#!/usr/bin/env python3
"""Builds the bundled language packs from the sources in tools/sources.lock.json.

  python3 -m venv env && env/bin/pip install -r tools/requirements.txt   # once
  env/bin/python tools/build_packs.py fetch    # download sources into vendor/ and verify sha256
  env/bin/python tools/build_packs.py build    # write packs/ and engines/
  env/bin/python tools/build_packs.py check    # rebuild into a temp dir; exit 1 if any output differs
  env/bin/python tools/build_packs.py legacy   # write packs/legacy-v13.json from the old lists in git

build and check need OpenCC and openpyxl at the pinned versions, so that the
outputs are deterministic and can be committed and checked.
"""
import csv
import hashlib
import importlib
import io
import json
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCK = ROOT / 'tools' / 'sources.lock.json'
PHRASES = ROOT / 'tools' / 'zh-hant-phrases.tsv'
VENDOR = ROOT / 'vendor'

N = 30000  # BNC / frequency rank cut-off for words without tags
WORD_RE = re.compile(r"^[a-z]+(?:['-][a-z]+)*$")
FORMS = 'pdi3srt'  # ECDICT exchange keys of inflected forms

# Lines dropped from a translation when other lines remain:
# "[计] 程序", "[网络] 胡德", "bend的过去式和过去分词".
DOMAIN_RE = re.compile(r'^(?:\[[^\]]*\]\s*)+')
INFLECTION_RE = re.compile(r"^[a-z'-]+\s*的\S*(过去式|分词|复数|单数|比较级|最高级)\S*$", re.I)
MAX_LINES, MAX_LINE = 4, 48

# Levels: (lists, [(id, known), ...]), lists being ECDICT tags and CEFR-J levels from
# easy to hard. A level marks every listed word that its known lists lack, so a
# learner at CET4 also sees the GRE words, which are rare in real text anyway.
# Simplified Chinese follows the Chinese exams (plan 6.1).
ZH_HANS_LEVELS = (['zk', 'gk', 'cet4', 'cet6', 'ky', 'toefl', 'ielts', 'gre'], [
    ('basic', ['zk']),
    ('cet4', ['zk', 'gk', 'cet4']),
    ('cet6', ['zk', 'gk', 'cet4', 'cet6', 'ky']),
    ('gre', ['zk', 'gk', 'cet4', 'cet6', 'ky', 'toefl', 'ielts']),
])
# Traditional Chinese climbs the CEFR-J levels, then the study-abroad exams (design 3.3).
# No level below A2: it would mark a fifth of a Wikipedia page or more.
ZH_HANT_LEVELS = (['A1', 'A2', 'B1', 'B2', 'toefl', 'ielts', 'gre'], [
    ('a2', ['A1', 'A2']),
    ('b1', ['A1', 'A2', 'B1']),
    ('b2', ['A1', 'A2', 'B1', 'B2']),
    ('gre', ['A1', 'A2', 'B1', 'B2', 'toefl', 'ielts']),
])
CEFR = {'A1': 1, 'A2': 2, 'B1': 3, 'B2': 4}

# EJDict marks the core senses of common words with 『』. Dropped from a sense: usage
# notes "《複数形で》", countability "〈C〉", part-of-speech tags "{名}", English glosses
# "(therefore)", variants "(またburger)". Phrases split at ",;・" outside brackets: "(人,人の判断が)『正しい』,正当な".
JA_NOTE_RE = re.compile(r'〈[CU]〉|\{[^}]*\}|\([ -~]*\)|\(また[^)]*\)')
JA_PHRASE_RE = re.compile(r'(?:\([^)]*\)|〈[^〉]*〉|[^,;・(〈])+')
JA_LINE, JA_SENSE = 60, 32
JA_OPEN, JA_CLOSE = '(〈《', ')〉》'

ZH_HANS = 'packs/en-zh-Hans'
ZH_HANT = 'packs/en-zh-Hant'
JA = 'packs/en-ja'
IRREGULAR = 'engines/en-irregular.js'
OUTPUTS = [f'{pack}/{name}' for pack in (ZH_HANS, ZH_HANT, JA) for name in ('dict.json', 'levels.json', 'LICENSE')]
OUTPUTS.append(IRREGULAR)


def sources():
    return json.loads(LOCK.read_text(encoding='utf-8'))


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def vendor(name):
    path = VENDOR / sources()[name]['file']
    if not path.exists():
        sys.exit(f'{path} is missing: run `env/bin/python tools/build_packs.py fetch` first')
    return path


def fetch():
    VENDOR.mkdir(exist_ok=True)
    for name, src in sources().items():
        path = VENDOR / src['file']
        if path.exists() and sha256(path) == src['sha256']:
            print(f'{name}: up to date')
            continue
        print(f'{name}: downloading {src["url"]}')
        tmp = path.with_suffix('.part')
        urllib.request.urlretrieve(src['url'], tmp)
        if sha256(tmp) != src['sha256']:
            tmp.unlink()
            sys.exit(f'{name}: sha256 mismatch')
        tmp.replace(path)


def need(module):
    try:
        return importlib.import_module(module)
    except ImportError:
        sys.exit(f'{module} is missing: python3 -m venv env && env/bin/pip install -r tools/requirements.txt, '
                 'then run this with env/bin/python')


def num(s):
    try:
        return int(s or 0)
    except ValueError:
        return 0


def common_words():
    src = (ROOT / 'lexicon.js').read_text(encoding='utf-8')
    return set(re.search(r'COMMON_WORDS = new Set\(`(.*?)`', src, re.S).group(1).split())


# Same as stems() in lexicon.js.
def stems(w):
    res = []
    add = lambda s: res.append(s) if len(s) >= 3 else None
    doubled = lambda s: s[:-1] if len(s) >= 2 and s[-1] == s[-2] else None
    if w.endswith("'s"):
        return [w[:-2]]
    if w.endswith('ies') or w.endswith('ied'):
        add(w[:-3] + 'y')
    if w.endswith('es'):
        add(w[:-2])
    if w.endswith('s') and not w.endswith('ss'):
        add(w[:-1])
    for suffix in ('ed', 'ing'):
        if w.endswith(suffix):
            s = w[:-len(suffix)]
            add(s)
            add(s + 'e')
            if doubled(s):
                add(doubled(s))
    return res


def exchange(row):
    return dict(p.split(':', 1) for p in row['exchange'].split('/') if ':' in p)


def read_ecdict():
    csv.field_size_limit(sys.maxsize)
    rows = {}
    with open(vendor('ecdict'), encoding='utf-8', newline='') as f:
        for r in csv.DictReader(f):
            rows.setdefault(r['word'].strip().lower(), r)
    return rows


def read_cefrj():
    """Single-word headwords of the CEFR-J Wordlist -> their lowest level, "A1".."B2"."""
    with zipfile.ZipFile(vendor('cefrj')) as z:
        xlsx = z.read(next(n for n in z.namelist() if n.endswith('.xlsx')))
    sheet = need('openpyxl').load_workbook(io.BytesIO(xlsx), read_only=True)['ALL_sep']
    rows = sheet.iter_rows(values_only=True)
    head = [str(c).strip() for c in next(rows)]
    word_at, level_at = head.index('headword'), head.index('CEFR')
    levels = {}
    for r in rows:
        w, level = str(r[word_at] or '').strip().lower(), r[level_at]
        if WORD_RE.match(w) and level in CEFR and CEFR[level] < CEFR.get(levels.get(w), 9):
            levels[w] = level
    return levels


def read_ejdict():
    """EJDict-hand headword -> meaning, "『走る』,駆ける / 〈人が〉…". "polish" wins over
    "Polish"; headwords listing variants ("A1,A-1") give each its own key."""
    with zipfile.ZipFile(vendor('ejdict')) as z:
        lines = [l for n in sorted(z.namelist()) if re.search(r'/src/[a-z]\.txt$', n)
                 for l in z.read(n).decode('utf-8').splitlines()]
    out = {}
    for lower in (True, False):
        for line in lines:
            head, _, meaning = line.partition('\t')
            for w in head.split(','):
                w = w.strip()
                if meaning.strip() and (w == w.lower()) == lower:
                    out.setdefault(w.lower(), meaning.strip())
    return out


def ja_flatten(text):
    """Drops the usage notes 《…》, which hold " / " and brackets of their own, and
    brackets inside brackets: "(…澱粉(でんぷん))" -> "(…澱粉)". Stray closers go too."""
    out, stack = [], []
    for ch in text:
        if ch in JA_OPEN:
            stack.append(ch)
            keep = len(stack) == 1 and ch != '《'
        elif ch in JA_CLOSE:
            if not stack:
                continue
            top = stack.pop()
            keep, ch = not stack and top != '《', JA_CLOSE[JA_OPEN.index(top)]
        else:
            keep = len(stack) <= 1 and '《' not in stack
        if keep:
            out.append(ch)
    return ''.join(out)


def ja_shorten(sense):
    """The phrases of a sense that fit JA_SENSE, so no cut lands inside brackets.
    A long context goes first: "(中南米の農園で,…働かされる)未熟練労働者" -> "未熟練労働者"."""
    for text in (sense, re.sub(r'^\([^)]*\)', '', sense)):
        fit = [m.end() for m in JA_PHRASE_RE.finditer(text) if m.end() <= JA_SENSE]
        if fit:
            return text[:fit[-1]]
    return shorten(sense, JA_SENSE)


def ja_definition(row, meaning, ej):
    """"[lait] 光；明かり；…に火をつける；明るい；(重量が)軽い", one line of parseDefinition().
    Words with core senses keep their marked phrases, which span the parts of speech;
    others keep their first senses. "=hamburger3" takes sense 3 of hamburger.
    None if nothing is left ("=all right", not an entry)."""
    split = lambda text: re.split(r'\s+/\s*|\s*/\s+', text)
    senses = []
    for s in split(ja_flatten(meaning)):
        ref = re.fullmatch(r'=([^{\d]+)(?:\{[^}]*\})?\s*(\d*)\s*', s)
        if not ref:
            senses.append(s)
            continue
        target = split(ja_flatten(ej.get(ref[1].strip().lower(), '')))
        n = int(ref[2] or 0)
        senses += target[n - 1:n] if 0 < n <= len(target) else target
    senses = [re.sub(r'\s+', ' ', JA_NOTE_RE.sub('', s)).strip(' ,;') for s in senses]
    core = lambda p: '『' in re.sub(r'\([^)]*\)', '', p)  # not "(…『NATO』…)"
    marked = [p for s in senses for p in JA_PHRASE_RE.findall(s) if core(p)]
    kept = []
    for group in (marked, [ja_shorten(s) for s in senses]):
        for p in group:
            p = p.replace('『', '').replace('』', '').replace(',', '、').replace(';', '、').strip()
            if p and p not in kept and len('；'.join(kept + [p])) <= JA_LINE:
                kept.append(p)
        if kept:
            return with_phonetic(row, '；'.join(kept))
    return None


def select(rows, cefr, common):
    """Headwords of the dictionary, shared by every pack (plan 5.2 step 2, design 3.1)."""
    cand = {w for w, r in rows.items()
            if r['translation'].strip() and WORD_RE.match(w)
            and (r['tag'].strip() or r['oxford'] == '1' or num(r['collins']) > 0
                 or 0 < num(r['bnc']) <= N or 0 < num(r['frq']) <= N)}

    # "gave" (0:give, 1:p) is left to the irregular table. Words with a meaning of
    # their own ("found", "left", "ground") carry an Oxford or Collins mark; exam
    # tags do not count, they also cover plain plurals such as "children".
    def pure(w):
        r, ex = rows[w], exchange(rows[w])
        base = ex.get('0')
        return (bool(base) and '1' in ex and base != w and base in cand
                and r['oxford'] != '1' and num(r['collins']) == 0)

    words = {w for w in cand if not pure(w)}

    # CEFR-J words the selection missed ("antivirus", "face-to-face"). Its inflected
    # entries ("boiled", "best") are left to lookup(), like the rest.
    forms = irregular(rows, words, common)
    return words | {w for w in cefr if w not in words and w in rows and rows[w]['translation'].strip()
                    and w not in forms and not any(s in words for s in stems(w))}


def shorten(line, limit=MAX_LINE):
    if len(line) <= limit:
        return line
    cut = max(line.rfind(c, 0, limit) for c in '；;，,')
    line = line[:cut] if cut > limit // 3 else line[:limit]
    # Drop a bracket the cut left open: "abbr. 咨询调解和仲裁局（Advisory", "〈液体".
    opened = max(line.rfind('（'), line.rfind('('), line.rfind('〈'))
    if opened > max(line.rfind('）'), line.rfind(')'), line.rfind('〉')):
        line = line[:opened].rstrip('；;，, ') or line[opened + 1:]  # "(John ~,1628-88;英国の" -> "John ~…"
    return line


def definition(row, convert=lambda text: text):
    """"[əˈbændən] vt. 放弃；抛弃 n. 放任", the format parseDefinition() reads.
    convert rewrites the Chinese text; the phonetic is left alone."""
    lines = [l.strip() for l in row['translation'].split('\\n') if l.strip()]
    # A lone "[计] 累加器" keeps its text but not the tag, which would read as a phonetic.
    kept = ([l for l in lines if not DOMAIN_RE.match(l) and not INFLECTION_RE.match(l)]
            or [DOMAIN_RE.sub('', lines[0]).strip() or lines[0]])
    return with_phonetic(row, convert(' '.join(shorten(l.replace(', ', '；')) for l in kept[:MAX_LINES])))


def with_phonetic(row, text):
    phonetic = row['phonetic'].strip().replace('\u04d9', '\u0259')  # Cyrillic ә -> IPA ə
    return f'[{phonetic}] {text}' if phonetic else text


def bases(w, row):
    """Words w is a form of: "driving" -> drive, "sales" -> sale, "typically" -> typical.
    ECDICT gives the lemma of inflected headwords; an exchange field without one
    means w is a lemma itself ("herring", not "her"), so stems() is only a fallback.
    A verb with forms of its own ("lay" -> laid, "found" -> founded) is a word too."""
    ex = exchange(row)
    if any(ex.get(k, w) != w for k in 'pd3'):
        return []
    res = [ex['0']] if ex.get('0', w) != w else [] if ex else stems(w)
    if w.endswith('ly') and row['translation'].startswith('adv.'):
        res += [w[:-2], w[:-3] + 'y', w[:-1] + 'e']  # typical, happy, gentle
    return res


def levels(spec, rows, cefr, words, common):
    labels = {w: set(rows[w]['tag'].split()) | {cefr.get(w)} for w in words}
    having = lambda names: {w for w in words if labels[w] & set(names)}
    lists, spec = spec
    out = {}
    for id, known in spec:
        learn = [l for l in lists if l not in known]
        # Forms of a known word are known: a learner who knows "drive" reads "driving".
        easy = having(known) | common
        out[id] = sorted(w for w in having(learn) - easy if not easy & set(bases(w, rows[w])))
    return out


def read_phrases():
    """tools/zh-hant-phrases.tsv: s2tw output -> Taiwan usage; "#" starts a comment."""
    lines = PHRASES.read_text(encoding='utf-8').splitlines()
    return dict(l.split('\t')[:2] for l in lines if l.strip() and not l.startswith('#'))


def to_hant(phrases):
    """Simplified -> Traditional with Taiwan glyphs (OpenCC s2tw: characters only, no
    phrase swaps), then the reviewed phrase list. s2twp is not used: its phrase table
    is made for software UIs and garbles dictionary text (design doc 3.2)."""
    s2tw = need('opencc').OpenCC('s2tw')
    pattern = re.compile('|'.join(sorted(map(re.escape, phrases), key=len, reverse=True)))
    return lambda text: pattern.sub(lambda m: phrases[m.group(0)], s2tw.convert(text))


def irregular(rows, words, common):
    """Inflected form -> headword, for forms stems() cannot undo (plan 4.5)."""
    table = {}
    for base in sorted(words):
        if base in common:
            continue
        ex = exchange(rows[base])
        for k in FORMS:
            for f in ex.get(k, '').split(','):
                f = f.strip().lower()
                # Forms that are headwords themselves ("ground", "left") are homographs:
                # mapping them would highlight common words as their rare base.
                if WORD_RE.match(f) and f != base and f not in words and base not in stems(f):
                    table.setdefault(f, base)
    return table


def dump(obj):
    # One entry per line keeps diffs of the committed files readable.
    return json.dumps(obj, ensure_ascii=False, indent=0, separators=(',', ':'), sort_keys=True) + '\n'


def write(out, rel, text):
    path = out / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8')


def build(out, report=False):
    rows = read_ecdict()
    cefr = read_cefrj()
    common = common_words()
    words = select(rows, cefr, common)
    table = irregular(rows, words, common)
    hant = to_hant(read_phrases())
    packs = {
        ZH_HANS: ({w: definition(rows[w]) for w in words}, levels(ZH_HANS_LEVELS, rows, cefr, words, common)),
        ZH_HANT: ({w: definition(rows[w], hant) for w in words}, levels(ZH_HANT_LEVELS, rows, cefr, words, common)),
    }
    # Japanese takes the CEFR-J levels too; words EJDict lacks are left out.
    ej = read_ejdict()
    ja = {w: text for w in words if w in ej and (text := ja_definition(rows[w], ej[w], ej))}
    packs[JA] = (ja, {id: [w for w in ws if w in ja] for id, ws in packs[ZH_HANT][1].items()})

    for pack, (defs, lvls) in packs.items():
        write(out, f'{pack}/dict.json', dump(defs))
        write(out, f'{pack}/levels.json', dump(lvls))
        shutil.copyfile(vendor('ecdict-license'), out / pack / 'LICENSE')
    write(out, IRREGULAR,
          '// Generated by tools/build_packs.py from ECDICT (MIT, see packs/en-zh-Hans/LICENSE). Do not edit.\n'
          '// Inflected forms the stems() rules cannot undo: "gave" -> "give".\n'
          f'const LexiBridgeIrregular = new Map(Object.entries({dump(table).rstrip()}));\n\n'
          "if (typeof module !== 'undefined') module.exports = LexiBridgeIrregular;\n")

    if report:
        print(f'dict: {len(words):,} entries   irregular: {len(table):,} entries')
        for pack, (_, lvls) in packs.items():
            print(f'{pack} levels: ' + '  '.join(f'{k} {len(v):,}' for k, v in lvls.items()))
        for rel in OUTPUTS:
            data = (out / rel).read_bytes()
            print(f'  {rel}: {len(data) / 1024:,.0f} KB, ~{len(zlib.compress(data, 9)) / 1024:,.0f} KB compressed')


def check():
    with tempfile.TemporaryDirectory() as tmp:
        build(Path(tmp))
        stale = [rel for rel in OUTPUTS
                 if not (ROOT / rel).exists() or (ROOT / rel).read_bytes() != (Path(tmp) / rel).read_bytes()]
    if stale:
        sys.exit('out of date, run `env/bin/python tools/build_packs.py build`:\n  ' + '\n  '.join(stale))
    print('packs are up to date')


def normalize_word(word):
    """Same as normalizeWord() in lexicon.js."""
    word = word[1:] if word.startswith('\ufeff') else word
    return word.replace('\u2019', "'").strip().lower()


# v1.3.0, the only release with levels (words/ last changed before it), and its
# levels.js: id -> (known lists, learn lists).
V13 = '9d1a81f'
V13_LEVELS = {
    'basic': ([], ['CET4_edited', 'CET6_edited']),
    'cet4': (['CET4_edited'], ['CET6_edited']),
    'cet6': (['CET4_edited', 'CET6_edited'], ['GRE_abridged']),
    'gre': (['CET4_edited', 'CET6_edited', 'GRE_abridged'], ['GRE_8000_Words']),
}


def short_hash(text):
    return hashlib.sha1(text.encode('utf-8')).hexdigest()[:8]


def legacy():
    """What the v1.3 lists shipped, for the migration in migrate.js:
    rows: every [word, definition] row ever, to tell bundled definitions from
      ones the learner edited; sha1(normalizeWord(word) + "\\t" + definition).
    lists: each level's starting list, to tell the words the learner took out.
    Hashes are the first 8 hex digits."""
    git = lambda *args: subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    valid = lambda row: isinstance(row, list) and row and isinstance(row[0], str) and normalize_word(row[0])
    rows = set()
    for rev in git('log', '--format=%H', '--', 'words/*.json').split():
        for path in git('ls-tree', '--name-only', rev, 'words/').split():
            if not path.endswith('.json'):
                continue
            for row in filter(valid, json.loads(git('show', f'{rev}:{path}'))):
                definition = row[1] if len(row) > 1 and row[1] is not None else ''  # String(row[1] ?? '')
                rows.add(short_hash(f'{normalize_word(row[0])}\t{definition}'))

    # levelWords() of v1.3: learn words minus known and function words, first row wins.
    def keys(names):
        return list(dict.fromkeys(normalize_word(row[0]) for name in names
                                  for row in filter(valid, json.loads(git('show', f'{V13}:words/{name}.json')))))
    common = set(re.search(r'COMMON_WORDS = new Set\(`(.*?)`', git('show', f'{V13}:levels.js'), re.S).group(1).split())
    lists = {}
    for id, (known, learn) in V13_LEVELS.items():
        easy = set(keys(known)) | common
        lists[id] = [w for w in keys(learn) if w not in easy]

    write(ROOT, 'packs/legacy-v13.json', dump({'lists': lists, 'rows': sorted(rows)}))
    print(f'packs/legacy-v13.json: {len(rows):,} rows, lists', {id: short_hash('\n'.join(l)) for id, l in lists.items()})

if __name__ == '__main__':
    commands = {'fetch': fetch, 'build': lambda: build(ROOT, report=True), 'check': check, 'legacy': legacy}
    if len(sys.argv) != 2 or sys.argv[1] not in commands:
        sys.exit(__doc__)
    commands[sys.argv[1]]()
