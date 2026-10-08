#!/usr/bin/env python3
"""Builds the bundled language packs from the sources in tools/sources.lock.json.

  python3 tools/build_packs.py fetch    # download sources into vendor/ and verify sha256
  python3 tools/build_packs.py build    # write packs/ and engines/
  python3 tools/build_packs.py check    # rebuild into a temp dir; exit 1 if any output differs
  python3 tools/build_packs.py legacy   # write packs/legacy-v13.json from the old lists in git

Standard library only. Outputs are deterministic so they can be committed and checked.
"""
import csv
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCK = ROOT / 'tools' / 'sources.lock.json'
VENDOR = ROOT / 'vendor'

N = 30000  # BNC / frequency rank cut-off for words without tags
WORD_RE = re.compile(r"^[a-z]+(?:['-][a-z]+)*$")
FORMS = 'pdi3srt'  # ECDICT exchange keys of inflected forms

# Lines dropped from a translation when other lines remain:
# "[计] 程序", "[网络] 胡德", "bend的过去式和过去分词".
DOMAIN_RE = re.compile(r'^\[[^\]]*\]')
INFLECTION_RE = re.compile(r"^[a-z'-]+\s*的\S*(过去式|分词|复数|单数|比较级|最高级)\S*$", re.I)
MAX_LINES, MAX_LINE = 4, 48

# Simplified Chinese levels (plan 6.1): (id, known tags, learn tags).
ZH_HANS_LEVELS = [
    ('basic', ['zk'], ['gk', 'cet4']),
    ('cet4', ['zk', 'gk', 'cet4'], ['cet6']),
    ('ky', ['zk', 'gk', 'cet4'], ['cet6', 'ky']),
    ('cet6', ['zk', 'gk', 'cet4', 'cet6', 'ky'], ['toefl', 'ielts']),
    ('gre', ['zk', 'gk', 'cet4', 'cet6', 'ky', 'toefl', 'ielts'], ['gre']),
]

ZH_HANS = 'packs/en-zh-Hans'
IRREGULAR = 'engines/en-irregular.js'
OUTPUTS = [f'{ZH_HANS}/dict.json', f'{ZH_HANS}/levels.json', f'{ZH_HANS}/LICENSE', IRREGULAR]


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
        sys.exit(f'{path} is missing: run `python3 tools/build_packs.py fetch` first')
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


def select(rows):
    """Headwords of the dictionary (plan 5.2 step 2)."""
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

    return {w for w in cand if not pure(w)}


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


def definition(row):
    """"[əˈbændən] vt. 放弃；抛弃 n. 放任", the format parseDefinition() reads."""
    lines = [l.strip() for l in row['translation'].split('\\n') if l.strip()]
    kept = [l for l in lines if not DOMAIN_RE.match(l) and not INFLECTION_RE.match(l)] or lines[:1]
    text = ' '.join(shorten(l.replace(', ', '；')) for l in kept[:MAX_LINES])
    phonetic = row['phonetic'].strip().replace('ә', 'ə')  # Cyrillic ә -> IPA ə
    return f'[{phonetic}] {text}' if phonetic else text


def levels(rows, words, common):
    tags = {w: set(rows[w]['tag'].split()) for w in words}
    having = lambda names: {w for w in words if tags[w] & set(names)}
    return {id: sorted(having(learn) - having(known) - common) for id, known, learn in ZH_HANS_LEVELS}


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
    common = common_words()
    words = select(rows)
    defs = {w: definition(rows[w]) for w in words}
    lvls = levels(rows, words, common)
    table = irregular(rows, words, common)

    write(out, f'{ZH_HANS}/dict.json', dump(defs))
    write(out, f'{ZH_HANS}/levels.json', dump(lvls))
    shutil.copyfile(vendor('ecdict-license'), out / ZH_HANS / 'LICENSE')
    write(out, IRREGULAR,
          '// Generated by tools/build_packs.py from ECDICT (MIT, see packs/en-zh-Hans/LICENSE). Do not edit.\n'
          '// Inflected forms the stems() rules cannot undo: "gave" -> "give".\n'
          f'const LexiBridgeIrregular = new Map(Object.entries({dump(table).rstrip()}));\n\n'
          "if (typeof module !== 'undefined') module.exports = LexiBridgeIrregular;\n")

    if report:
        print(f'dict: {len(defs):,} entries   irregular: {len(table):,} entries')
        print('levels: ' + '  '.join(f'{k} {len(v):,}' for k, v in lvls.items()))
        for rel in OUTPUTS:
            data = (out / rel).read_bytes()
            print(f'  {rel}: {len(data) / 1024:,.0f} KB, ~{len(zlib.compress(data, 9)) / 1024:,.0f} KB compressed')


def check():
    with tempfile.TemporaryDirectory() as tmp:
        build(Path(tmp))
        stale = [rel for rel in OUTPUTS
                 if not (ROOT / rel).exists() or (ROOT / rel).read_bytes() != (Path(tmp) / rel).read_bytes()]
    if stale:
        sys.exit('out of date, run `python3 tools/build_packs.py build`:\n  ' + '\n  '.join(stale))
    print('packs are up to date')


def normalize_word(word):
    """Same as normalizeWord() in lexicon.js."""
    word = word[1:] if word.startswith('﻿') else word
    return word.replace('’', "'").strip().lower()


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
