// のこれ！ことば島：ゲームの決まり（画面や通信とは切り離した、純粋な計算だけ）
(function (root) {
  // お題に出す文字：言葉が十分ある清音だけ（ん・を・ぬ・小さい文字・濁音は出さない）
  const ODAI_CHARS = "あいうえおかきくけこさしすせそたちつてとなにねのはひふへほまみむめもやゆよらりるれろわ".split("");
  const AVATARS = ["🐻", "🐰", "🦊", "🐸"];
  const MAX_PLAYERS = 4;

  /** 入力をひらがなにそろえる（カタカナ→ひらがな、空白を消す）。 */
  function toHira(s) {
    return String(s || "").normalize("NFKC").replace(/\s+/g, "")
      .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  }

  function pickOdai(rng) { return ODAI_CHARS[Math.floor((rng || Math.random)() * ODAI_CHARS.length)]; }

  /** 対戦を始める。players は参加順 [{id,name}]。 */
  function startGame(players, opts) {
    const timeLimit = opts.timeLimit || 10;
    return {
      phase: "playing",
      odai: opts.odai || pickOdai(opts.rng),
      timeLimit,
      players: players.map((p, i) => ({ id: p.id, name: p.name, av: AVATARS[i % AVATARS.length], alive: true, words: 0 })),
      turn: 0,
      deadline: opts.now + timeLimit * 1000,
      used: [],
      events: [],
      winner: null,
    };
  }

  const alive = s => s.players.filter(p => p.alive);
  function nextTurn(s, now) {
    const n = s.players.length;
    for (let k = 1; k <= n; k++) {
      const i = (s.turn + k) % n;
      if (s.players[i].alive) { s.turn = i; break; }
    }
    s.deadline = now + s.timeLimit * 1000;
  }
  function finishIfOne(s) {
    const left = alive(s);
    if (left.length <= 1) { s.phase = "over"; s.winner = left[0] ? left[0].id : null; return true; }
    return false;
  }
  function eliminate(s, i, why, now) {
    const p = s.players[i];
    if (!p || !p.alive) return;
    p.alive = false;
    s.events.push({ type: "out", id: p.id, why, at: now });
    if (finishIfOne(s)) return;
    if (s.turn === i) nextTurn(s, now);
  }

  /** 言葉を出す。dictHas(word) で辞書にあるかを調べる。 */
  function submitWord(s, playerId, raw, dictHas, now) {
    if (s.phase !== "playing") return { ok: false, reason: "notPlaying" };
    const cur = s.players[s.turn];
    if (!cur || cur.id !== playerId) return { ok: false, reason: "notTurn" };
    const w = toHira(raw);
    if (!w) return { ok: false, reason: "empty" };
    if (!/^[ぁ-ゖー]+$/.test(w)) return { ok: false, reason: "notKana", word: w };
    if (w[0] !== s.odai) return { ok: false, reason: "wrongStart", word: w };
    if (w.length < 2) return { ok: false, reason: "tooShort", word: w };
    if (s.used.some(u => u.w === w)) return { ok: false, reason: "used", word: w };
    if (!dictHas(w)) return { ok: false, reason: "notInDict", word: w };
    s.used.push({ w, by: playerId });
    cur.words++;
    nextTurn(s, now);
    return { ok: true, word: w };
  }

  /** 時間切れを調べる（審判役の端末が定期的に呼ぶ）。 */
  function tick(s, now) {
    if (s.phase === "playing" && now >= s.deadline) { eliminate(s, s.turn, "time", now); return true; }
    return false;
  }
  function giveUp(s, playerId, now) {
    const i = s.players.findIndex(p => p.id === playerId);
    if (i >= 0 && s.phase === "playing") eliminate(s, i, "giveup", now);
  }
  function leave(s, playerId, now) {
    const i = s.players.findIndex(p => p.id === playerId);
    if (i >= 0 && s.phase === "playing") eliminate(s, i, "left", now);
  }

  const REASON = {
    notTurn: "いまはあなたの番ではありません",
    empty: "言葉を入れてね",
    notKana: "ひらがな（カタカナ）で入れてね",
    wrongStart: "お題の文字から始まっていません",
    tooShort: "2文字以上の言葉にしてね",
    used: "その言葉はもう出ています",
    notInDict: "辞書に見つかりませんでした",
    notPlaying: "いまは対戦中ではありません",
  };

  const api = { ODAI_CHARS, AVATARS, MAX_PLAYERS, toHira, pickOdai, startGame, submitWord, tick, giveUp, leave, REASON };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.KotobaLogic = api;
})(this);
