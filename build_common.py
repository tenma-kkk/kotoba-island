# JMdict の「よく使う言葉」の印（re_pri / ke_pri）がある読みだけを、CPU 用に最初の文字ごとに分けて書き出す
import gzip, re, os
from collections import defaultdict
src = gzip.open('raw/JMdict_e.gz', 'rt', encoding='utf-8').read()
def hira(s): return ''.join(chr(ord(c)-0x60) if 'ァ' <= c <= 'ヶ' else c for c in s)
full = set()
for f in os.listdir('docs/dict'):
    if f.endswith('.txt'): full.update(open('docs/dict/' + f, encoding='utf-8').read().split('\n'))
by = defaultdict(set)
for entry in re.findall(r'<entry>(.*?)</entry>', src, re.S):
    common = bool(re.search(r'<(?:ke|re)_pri>(?:news1|ichi1|spec1|spec2|gai1)</(?:ke|re)_pri>', entry))
    if not common: continue
    for reb in re.findall(r'<reb>(.*?)</reb>', entry):
        w = hira(reb)
        if w in full: by[w[0]].add(w)
os.makedirs('docs/dict/common', exist_ok=True)
n = 0
for c, ws in by.items():
    open('docs/dict/common/%x.txt' % ord(c), 'w', encoding='utf-8').write('\n'.join(sorted(ws))); n += len(ws)
print(n, 'common words')
