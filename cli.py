import json

res = []
with open('CET6_edited.txt', 'r') as f:
    for line in f.readlines():
        line = line.strip()
        data = line.split(' ')
        if len(data) >= 4:
            target = data[4] if data[3] == '1.' else data[3]
            target = target.split('，')[0]
            res.append([data[0], target, ' '.join(data)])


with open('en_zh.json', 'w') as f:
    f.write(json.dumps(res))
