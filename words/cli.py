import sys
import json
import argparse
from pathlib import Path
from tqdm import tqdm

parser = argparse.ArgumentParser(prog='generate JSON file for LexiBridge')
parser.add_argument('filename')
args = parser.parse_args()

source = Path(args.filename)
if not source.exists():
    print('File is not exists.')
    sys.exit()

res = []
with source.open() as f:
    for line in tqdm(f.readlines()):
        line = line.strip()
        if not line:
            continue
        data = line.split(' ')
        if len(data) < 2:
            continue
        res.append([data[0], ' '.join(data[1:])])


output = source.stem + '.json'
with open(output, 'w') as f:
    f.write(json.dumps(res))

print(f'Total lines: {len(res)}')
