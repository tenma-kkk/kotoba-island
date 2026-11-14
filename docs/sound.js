// 効果音：ファイルを使わず、ブラウザの中で音を作る（通信も費用もなし）
(function () {
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem("kotobajima-muted") === "1"; } catch (e) { /* 保存できなくても鳴る */ }

  function ac() {
    if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ctx = new A(); }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  // 音は画面を触ったあとでないと鳴らせないので、最初のタップで準備する
  document.addEventListener("pointerdown", () => ac(), { once: true });

  function tone(freq, start, dur, { type = "sine", vol = 0.25, slide = 0 } = {}) {
    const c = ac(); if (!c || muted) return;
    const t = c.currentTime + start;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(start, dur, { vol = 0.4, from = 1800, to = 200 } = {}) {
    const c = ac(); if (!c || muted) return;
    const t = c.currentTime + start;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(c.destination); s.start(t);
  }

  const SFX = {
    ok() { tone(880, 0, 0.09, { type: "triangle" }); tone(1320, 0.07, 0.14, { type: "triangle" }); },        // ポン！
    ng() { tone(180, 0, 0.12, { type: "square", vol: 0.12 }); tone(150, 0.13, 0.18, { type: "square", vol: 0.12 }); }, // ブブッ
    tick() { tone(1500, 0, 0.04, { type: "square", vol: 0.06 }); },                                            // カチッ
    turn() { tone(660, 0, 0.08, { vol: 0.15 }); },                                                             // 自分の番
    join() { tone(520, 0, 0.07); tone(780, 0.06, 0.1); },                                                      // 人が来た
    start() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.16, { type: "triangle", vol: 0.2 })); },
    splash() { tone(500, 0, 0.35, { slide: -380, vol: 0.18 }); noise(0.25, 0.9, { vol: 0.5, from: 2600, to: 160 }); }, // ひゅ〜ざぶーん
    win() { [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, i === 5 ? 0.5 : 0.14, { type: "triangle", vol: 0.22 })); },
  };

  window.KotobaSound = {
    play(name) { try { SFX[name] && SFX[name](); } catch (e) { /* 音が出なくてもゲームは続ける */ } },
    get muted() { return muted; },
    toggle() { muted = !muted; try { localStorage.setItem("kotobajima-muted", muted ? "1" : "0"); } catch (e) { /* */ } return muted; },
  };
})();
