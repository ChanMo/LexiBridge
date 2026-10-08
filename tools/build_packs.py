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

# Levels: (id, known, learn), each a list of ECDICT tags and CEFR-J levels.
# Simplified Chinese follows the Chinese exams (plan 6.1).
ZH_HANS_LEVELS = [
    ('basic', ['zk'], ['gk', 'cet4']),
    ('cet4', ['zk', 'gk', 'cet4'], ['cet6']),
    ('ky', ['zk', 'gk', 'cet4'], ['cet6', 'ky']),
    ('cet6', ['zk', 'gk', 'cet4', 'cet6', 'ky'], ['toefl', 'ielts']),
    ('gre', ['zk', 'gk', 'cet4', 'cet6', 'ky', 'toefl', 'ielts'], ['gre']),
]
# Traditional Chinese climbs the CEFR-J levels, then the study-abroad exams (design 3.3).
ZH_HANT_LEVELS = [
    ('a1', [], ['A1', 'A2']),
    ('b1', ['A1', 'A2'], ['B1']),
    ('b2', ['A1', 'A2', 'B1'], ['B2']),
    ('adv', ['A1', 'A2', 'B1', 'B2'], ['toefl', 'ielts']),
    ('gre', ['A1', 'A2', 'B1', 'B2', 'toefl', 'ielts'], ['gre']),
]
CEFR = {'A1': 1, 'A2': 2, 'B1': 3, 'B2': 4}

ZH_HANS = 'packs/en-zh-Hans'
ZH_HANT = 'packs/en-zh-Hant'
IRREGULAR = 'engines/en-irregular.js'
OUTPUTS = [f'{pack}/{name}' for pack in (ZH_HANS, ZH_HANT) for name in ('dict.json', 'levels.json', 'LICENSE')]
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


def shorten(line):
    if len(line) <= MAX_LINE:
        return line
    cut = max(line.rfind(c, 0, MAX_LINE) for c in '；;，,')
    line = line[:cut] if cut > MAX_LINE // 3 else line[:MAX_LINE]
    # Drop a bracket the cut left open: "abbr. 咨询调解和仲裁局（Advisory".
    opened = max(line.rfind('（'), line.rfind('('))
    if opened > max(line.rfind('）'), line.rfind(')')):
        line = line[:opened].rstrip('；;，, ') or line
    return line


def definition(row, convert=lambda text: text):
    """"[əˈbændən] vt. 放弃；抛弃 n. 放任", the format parseDefinition() reads.
    convert rewrites the Chinese text; the phonetic is left alone."""
    lines = [l.strip() for l in row['translation'].split('\\n') if l.strip()]
    # A lone "[计] 累加器" keeps its text but not the tag, which would read as a phonetic.
    kept = ([l for l in lines if not DOMAIN_RE.match(l) and not INFLECTION_RE.match(l)]
            or [DOMAIN_RE.sub('', lines[0]).strip() or lines[0]])
    text = convert(' '.join(shorten(l.replace(', ', '；')) for l in kept[:MAX_LINES]))
    phonetic = row['phonetic'].strip().replace('\u04d9', '\u0259')  # Cyrillic ә -> IPA ə
    return f'[{phonetic}] {text}' if phonetic else text


def levels(spec, rows, cefr, words, common):
    labels = {w: set(rows[w]['tag'].split()) | {cefr.get(w)} for w in words}
    having = lambda names: {w for w in words if labels[w] & set(names)}
    return {id: sorted(having(learn) - having(known) - common) for id, known, learn in spec}


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


def legacy():
    """Hashes of every [word, definition] row the v1.3 lists ever shipped, so the
    v1.4 migration can tell bundled definitions from ones the learner edited.
    Hash: first 8 hex digits of sha1(normalizeWord(word) + "\\t" + definition)."""
    git = lambda *args: subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    hashes = set()
    for rev in git('log', '--format=%H', '--', 'words/*.json').split():
        for path in git('ls-tree', '--name-only', rev, 'words/').split():
            if not path.endswith('.json'):
                continue
            for row in json.loads(git('show', f'{rev}:{path}')):
                if isinstance(row, list) and row and isinstance(row[0], str) and normalize_word(row[0]):
                    definition = row[1] if len(row) > 1 and row[1] is not None else ''  # String(row[1] ?? '')
                    text = f'{normalize_word(row[0])}\t{definition}'
                    hashes.add(hashlib.sha1(text.encode('utf-8')).hexdigest()[:8])
    write(ROOT, 'packs/legacy-v13.json', dump(sorted(hashes)))
    print(f'packs/legacy-v13.json: {len(hashes):,} hashes')


if __name__ == '__main__':
    commands = {'fetch': fetch, 'build': lambda: build(ROOT, report=True), 'check': check, 'legacy': legacy}
    if len(sys.argv) != 2 or sys.argv[1] not in commands:
        sys.exit(__doc__)
    commands[sys.argv[1]]()
