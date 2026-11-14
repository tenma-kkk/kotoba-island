# JMdict_e から「ひらがなの読み」だけを取り出し、最初の文字ごとに分けた辞書ファイルを作る
import gzip, re, json, sys
from collections import defaultdict
src = gzip.open('raw/JMdict_e.gz', 'rt', encoding='utf-8').read()
def hira(s): return ''.join(chr(ord(c)-0x60) if 'ァ' <= c <= 'ヶ' else c for c in s)
ok = re.compile(r'^[ぁ-ゖー]{2,}$')
SKIP_POS = {'&int;', '&prt;', '&aux;', '&aux-v;', '&aux-adj;', '&pref;', '&suf;', '&ctr;', '&conj;'}
words = set()
for entry in re.findall(r'<entry>(.*?)</entry>', src, re.S):
    pos = set(re.findall(r'<pos>(.*?)</pos>', entry))
    if pos and pos <= SKIP_POS: continue
    for reb in re.findall(r'<reb>(.*?)</reb>', entry):
        w = hira(reb)
        if ok.match(w) and not w.startswith('ー') and not (len(w) == 2 and w[1] in 'ぁぃぅぇぉゃゅょっゎー'): words.add(w)
by = defaultdict(list)
for w in sorted(words): by[w[0]].append(w)
json.dump(by, open('dict.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(words), 'words')
print({k: len(v) for k, v in sorted(by.items(), key=lambda x: len(x[1]))[:12]})
