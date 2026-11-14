# のこれ！ことば島

2〜4人のオンライン対戦ことばゲーム。お題のひらがなから始まる言葉を順番に言い、持ち時間内に言えなくなったら脱落、最後まで残った人の勝ち。

- 遊ぶ：https://tenma-kkk.github.io/kotoba-island/
- 部屋をつくった人の端末が審判役になり、ほかの端末と PeerJS（WebRTC）で直接つながります。サーバーや費用はかかりません。
- テスト：`node --test docs/logic.test.js`
- 辞書の作り直し：JMdict_e.gz を raw/ に置いて `python3 build_dict.py` → お題ごとのファイルを docs/dict/ に分ける

## 辞書のライセンス
docs/dict/ の言葉の一覧は [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html)（© Electronic Dictionary Research and Development Group）から作成したもので、[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) に従います。
