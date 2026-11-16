const test = require("node:test"); const assert = require("node:assert/strict");
const L = require("./logic.js");
const dict = new Set(["あり", "あめ", "あいす", "あさがお"]); const has = w => dict.has(w);
const two = () => L.startGame([{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }], { now: 0, odai: "あ", timeLimit: 10 });
test("カタカナもひらがなにそろえる", () => { assert.equal(L.toHira(" アイス "), "あいす"); });
test("順番・お題・重複・辞書を確かめる", () => {
  const s = two();
  assert.equal(L.submitWord(s, "b", "あり", has, 1).reason, "notTurn");
  assert.equal(L.submitWord(s, "a", "いぬ", has, 1).reason, "wrongStart");
  assert.equal(L.submitWord(s, "a", "あああ", has, 1).reason, "notInDict");
  assert.equal(L.submitWord(s, "a", "アリ", has, 1).ok, true);
  assert.equal(s.players[s.turn].id, "b");
  assert.equal(L.submitWord(s, "b", "あり", has, 2).reason, "used");
  assert.equal(s.deadline, 1 + 10000, "まちがえても時間は戻らない");
});
test("時間切れで脱落、最後の1人が勝ち", () => {
  const s = two();
  L.tick(s, 10000); assert.equal(s.players[0].alive, false); assert.equal(s.players[s.turn].id, "b");
  L.giveUp(s, "c", 10001); assert.equal(s.phase, "over"); assert.equal(s.winner, "b");
});
test("お題は清音だけ", () => { for (const c of L.ODAI_CHARS) assert.match(c, /^[あ-わ]$/); assert.ok(!L.ODAI_CHARS.includes("ん") && !L.ODAI_CHARS.includes("ぬ")); });
test("CPU：使った言葉・長さの上限を守る", () => {
  const words = ["あり", "あめ", "あいす", "あさがお", "あいうえおかき"];
  const zero = () => 0.5;
  for (let i = 0; i < 50; i++) {
    const w = L.cpuPick(words, [{ w: "あり" }], "easy", () => Math.random() * 0.8 + 0.19);
    if (w) { assert.notEqual(w, "あり"); assert.ok(w.length <= 4); }
  }
  assert.equal(L.cpuPick(["あり"], [{ w: "あり" }], "normal", zero), null, "言葉がなければ言えない");
  assert.equal(L.cpuPick(words, [], "easy", () => 0), null, "わざと海へ");
});
test("ひとり遊びの記録", () => {
  let r = L.updateRecords(null, null, { won: true, words: 5, longest: "かいすいよく" });
  assert.deepEqual(r.best, { streak: 1, words: 5, longest: "かいすいよく" });
  r = L.updateRecords(r.best, r.run, { won: true, words: 3, longest: "あり" });
  assert.equal(r.best.streak, 2); assert.ok(r.fresh.streak && !r.fresh.words);
  r = L.updateRecords(r.best, r.run, { won: false, words: 1, longest: "" });
  assert.equal(r.run.streak, 0); assert.equal(r.best.streak, 2);
});
