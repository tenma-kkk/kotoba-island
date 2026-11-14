// のこれ！ことば島：画面と通信。部屋をつくった人の端末が「審判役」になり、
// 順番・持ち時間・辞書の判定をして、結果をみんなの端末へ配る（PeerJS で端末どうしを直接つなぐ）。
(function () {
  const L = window.KotobaLogic;
  const PREFIX = "nijin-kotobajima-v1-";
  const $ = id => document.getElementById(id);
  const screens = ["home", "lobby", "play", "over"];
  const show = name => screens.forEach(s => $(s).classList.toggle("hide", s !== name));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let peer = null, isHost = false, myId = null, hostConn = null;
  // 審判役だけが持つもの
  const conns = new Map();
  let members = [], timeLimit = 10, game = null, dict = null, timer = null;
  // 画面に出している最新の状態
  let view = null, localDeadline = 0, shownEvents = 0, shownUsed = 0;

  try { $("name").value = localStorage.getItem("kotobajima-name") || ""; } catch (e) { /* 保存できなくても遊べる */ }
  const myName = () => { const n = $("name").value.trim().slice(0, 8) || "なまえなし"; try { localStorage.setItem("kotobajima-name", n); } catch (e) { /* */ } return n; };
  const homeMsg = t => { $("homeMsg").textContent = t; };

  // ---------- 審判役（部屋をつくった人） ----------
  function createRoom(tries = 0) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    homeMsg("");
    $("create").disabled = true;
    peer = new Peer(PREFIX + code);
    peer.on("open", () => {
      isHost = true; myId = "host";
      members = [{ id: "host", name: myName() }];
      $("code").textContent = code;
      show("lobby"); renderLobby();
    });
    peer.on("connection", conn => {
      conn.on("data", msg => onHostData(conn, msg));
      conn.on("close", () => dropMember(conn.peer));
      conn.on("error", () => dropMember(conn.peer));
    });
    peer.on("error", err => {
      if (err.type === "unavailable-id" && tries < 5) { peer.destroy(); createRoom(tries + 1); return; }
      $("create").disabled = false;
      if (!isHost) homeMsg("部屋をつくれませんでした。ネットにつながっているか確かめてね（" + err.type + "）");
    });
  }

  function onHostData(conn, msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.t === "join") {
      if (game && game.phase === "playing") { conn.send({ kind: "reject", text: "いま対戦中です。終わってから入ってね" }); return; }
      if (members.length >= L.MAX_PLAYERS && !members.some(m => m.id === conn.peer)) { conn.send({ kind: "reject", text: "この部屋は満員です（4人まで）" }); return; }
      conns.set(conn.peer, conn);
      const name = String(msg.name || "なまえなし").slice(0, 8);
      const m = members.find(x => x.id === conn.peer);
      if (m) m.name = name; else members.push({ id: conn.peer, name });
      broadcast();
    } else if (msg.t === "word") {
      hostWord(conn.peer, msg.w, res => conn.send({ kind: "result", ...res }));
    } else if (msg.t === "giveup") {
      if (game) { L.giveUp(game, conn.peer, Date.now()); afterChange(); }
    }
  }

  function dropMember(id) {
    if (!conns.has(id)) return;
    conns.delete(id);
    if (game && game.phase === "playing") { L.leave(game, id, Date.now()); afterChange(); }
    members = members.filter(m => m.id !== id);
    broadcast();
  }

  async function hostStart() {
    if (members.length < 2) return;
    $("start").disabled = true;
    timeLimit = Number($("time").value) || 10;
    const odai = L.pickOdai();
    try {
      const text = await fetch("dict/" + odai.codePointAt(0).toString(16) + ".txt").then(r => { if (!r.ok) throw Error(r.status); return r.text(); });
      dict = new Set(text.split("\n"));
    } catch (e) {
      $("start").disabled = false; alertMsg("辞書を読めませんでした。もう一度スタートしてね"); return;
    }
    game = L.startGame(members, { now: Date.now(), odai, timeLimit });
    shownEvents = 0; shownUsed = 0;
    clearInterval(timer);
    timer = setInterval(() => { if (game && L.tick(game, Date.now())) afterChange(); }, 200);
    broadcast();
  }

  function hostWord(playerId, w, reply) {
    if (!game) return;
    const res = L.submitWord(game, playerId, w, x => dict.has(x), Date.now());
    reply({ ok: res.ok, reason: res.reason || "", word: res.word || "" });
    if (res.ok) broadcast();
  }

  function afterChange() {
    if (game && game.phase === "over") clearInterval(timer);
    broadcast();
  }

  function snapshot() {
    if (game) return { kind: "game", game, remainMs: Math.max(0, game.deadline - Date.now()), members };
    return { kind: "lobby", members, timeLimit: Number($("time").value) || 10 };
  }
  function broadcast() {
    const snap = snapshot();
    for (const c of conns.values()) { try { c.send(snap); } catch (e) { /* 切れた人は close で外れる */ } }
    receive(snap);
  }

  // ---------- 参加する人 ----------
  function joinRoom() {
    const code = $("joinCode").value.replace(/\D/g, "");
    if (code.length !== 4) { homeMsg("部屋番号は4けたの数字です"); return; }
    homeMsg("つないでいます…");
    $("join").disabled = true;
    peer = new Peer();
    peer.on("open", id => {
      myId = id;
      hostConn = peer.connect(PREFIX + code, { reliable: true });
      hostConn.on("open", () => { homeMsg(""); hostConn.send({ t: "join", name: myName() }); $("code").textContent = code; });
      hostConn.on("data", msg => {
        if (msg.kind === "reject") { homeMsg(msg.text); quit(false); return; }
        if (msg.kind === "result") { showResult(msg); return; }
        receive(msg);
      });
      hostConn.on("close", () => { if (view) { quit(false); homeMsg("部屋がなくなりました（部屋をつくった人がぬけました）"); } });
    });
    peer.on("error", err => {
      $("join").disabled = false;
      homeMsg(err.type === "peer-unavailable" ? "その番号の部屋が見つかりません" : "つなげませんでした（" + err.type + "）。学校のネットでは、つながらないことがあります");
      if (peer) { peer.destroy(); peer = null; }
    });
  }

  // ---------- 画面 ----------
  const S = n => window.KotobaSound && window.KotobaSound.play(n);
  let lastLobbyCount = 0, lastTurnKey = "", lastSec = -1, phaseShown = "", lastPhase = "";
  function receive(snap) {
    view = snap;
    if (snap.kind === "lobby") {
      if (!isHost) game = null;
      if (snap.members.length > lastLobbyCount && lastLobbyCount > 0) S("join");
      lastLobbyCount = snap.members.length; phaseShown = "lobby"; lastPhase = "";
      show("lobby"); renderLobby(); return;
    }
    const g = snap.game;
    localDeadline = Date.now() + snap.remainMs;
    const isNew = phaseShown !== "game" || (lastPhase === "over" && g.phase === "playing") || g.events.length < shownEvents;
    if (isNew) { shownEvents = 0; shownUsed = 0; if (g.phase === "playing") S("start"); }
    const prevPhase = isNew ? "" : lastPhase; lastPhase = g.phase;
    phaseShown = "game";
    const fresh = g.events.slice(shownEvents);
    shownEvents = g.events.length;
    if (g.phase === "over") {
      fresh.forEach(ev => bubble(ev, g));
      const first = prevPhase !== "over";
      if (first) setTimeout(() => S("win"), fresh.length ? 900 : 0);
      renderOver(g, first); show("over"); return;
    }
    if ($("play").classList.contains("hide")) { $("playMsg").textContent = ""; $("word").value = ""; }
    show("play"); renderPlay(g, fresh.map(e => e.id));
    fresh.forEach(ev => bubble(ev, g));
    const cur = g.players[g.turn], key = g.used.length + ":" + g.turn + ":" + g.events.length;
    if (key !== lastTurnKey) { lastTurnKey = key; lastSec = -1; if (cur && cur.id === myId) S("turn"); }
  }

  function bubble(ev, g) {
    const p = g.players.find(x => x.id === ev.id); if (!p) return;
    S("splash");
    const fx = $("fx");
    const b = document.createElement("div"); b.className = "bubble";
    b.textContent = `${p.name}、${ev.why === "giveup" ? "ギブアップ！" : ev.why === "left" ? "島をはなれた" : "海へざぶーん！"}`;
    const w = document.createElement("div"); w.className = "splashfx emo"; w.textContent = "💦";
    fx.append(b, w); setTimeout(() => { b.remove(); w.remove(); }, 2100);
  }

  function chars(list, g, falling = []) {
    const out = list.map((p, i) => {
      const av = p.av || L.AVATARS[i % L.AVATARS.length];
      let cls = "";
      if (g) cls = !p.alive ? (falling.includes(p.id) ? "falling" : "out") : (g.players[g.turn] && g.players[g.turn].id === p.id ? "turn" : "");
      return `<div class="ch ${cls}"><div class="face emo">${p.alive === false && !falling.includes(p.id) ? "🛟" : av}</div><span class="tag">${esc(p.name)}</span>${p.id === myId ? `<span class="me">じぶん</span>` : ""}</div>`;
    });
    if (!g) while (out.length < L.MAX_PLAYERS) out.push(`<div class="ch empty"><div class="face">？</div><span class="tag">あき</span></div>`);
    return out.join("");
  }

  function renderLobby() {
    const list = view && view.kind === "lobby" ? view.members : members;
    $("lobbyPlayers").innerHTML = chars(list);
    $("timeWrap").classList.toggle("hide", !isHost);
    $("start").classList.toggle("hide", !isHost);
    $("waitHost").classList.toggle("hide", isHost);
    $("start").disabled = list.length < 2;
    $("start").textContent = list.length < 2 ? "あと1人あつまったらスタート" : `🏁 ${list.length}人でスタート`;
  }

  function renderPlay(g, falling = []) {
    $("odai").textContent = g.odai;
    const cur = g.players[g.turn];
    const mine = cur && cur.id === myId;
    $("turnName").dataset.who = mine ? "あなたの番！" : `${cur ? cur.name : ""}の番`;
    $("leftCount").textContent = `🏝 のこり ${g.players.filter(p => p.alive).length}人`;
    $("roomPill").textContent = `部屋 ${$("code").textContent}`;
    $("playPlayers").innerHTML = chars(g.players, g, falling);
    $("used").innerHTML = g.used.map((u, i) => `<span class="${i >= shownUsed ? "new" : ""}"><span class="emo">🐚</span> ${esc(u.w)}</span>`).join("") || `<span class="none">「${g.odai}」から始まる言葉を出そう！</span>`;
    $("used").scrollTop = $("used").scrollHeight;
    shownUsed = g.used.length;
    const me = g.players.find(p => p.id === myId);
    const canType = mine && me && me.alive;
    $("word").disabled = !canType; $("send").disabled = !canType;
    $("giveup").classList.toggle("hide", !canType);
    $("word").placeholder = canType ? `「${g.odai}」から始まることば` : (me && !me.alive ? "うきわで見学中…" : "まってね");
    if (canType) $("word").focus();
    drawTimer();
  }

  function renderOver(g, first = true) {
    const w = g.players.find(p => p.id === g.winner);
    $("winner").innerHTML = w ? `<div class="crown emo">👑</div><div class="winface emo">${w.av}</div><div class="big" style="font-size:26px">${esc(w.name)} の勝ち！</div>` : `<div class="big">引き分け</div>`;
    // 順位：勝った人 → あとまで残った人ほど上
    const outOrder = g.events.filter(e => e.type === "out").map(e => e.id);
    const order = [g.winner, ...outOrder.slice().reverse()].filter(Boolean);
    $("rank").innerHTML = order.map((id, i) => { const p = g.players.find(x => x.id === id); return p ? `<div><b>${i + 1}</b><span class="emo">${p.av}</span> ${esc(p.name)}・${p.words}こ</div>` : ""; }).join("");
    $("overUsed").innerHTML = g.used.map(u => `<span>${esc(u.w)}</span>`).join("") || "";
    $("again").classList.toggle("hide", !isHost);
    $("waitAgain").classList.toggle("hide", isHost);
    $("again").disabled = !isHost || members.length < 2;
    if (!first) return;
    const fx = $("fx"); const c = document.createElement("div"); c.className = "confetti";
    c.innerHTML = Array.from({ length: 18 }, (_, i) => `<i style="left:${(i * 37) % 100}%;background:${["#F76707", "#FFD43B", "#2FB344", "#1C9BD8"][i % 4]};animation-delay:${(i % 6) * 0.35}s"></i>`).join("");
    fx.append(c); setTimeout(() => c.remove(), 6500);
  }

  function showResult(res) {
    const m = $("playMsg");
    if (res.ok) { m.className = "msg ok"; m.textContent = `✓「${res.word}」は辞書にあります`; $("word").value = ""; S("ok"); }
    else { m.className = "msg ng"; m.textContent = (L.REASON[res.reason] || "出せませんでした") + (res.word ? `（${res.word}）` : ""); S("ng"); }
  }
  function alertMsg(t) { const m = $("playMsg"); m.className = "msg ng"; m.textContent = t; homeMsg(t); }

  // 残り時間の表示（どの端末も自分の時計で数える）
  function drawTimer() {
    if (!view || view.kind !== "game" || view.game.phase !== "playing") return;
    const left = Math.max(0, localDeadline - Date.now());
    const pct = Math.min(100, left / (view.game.timeLimit * 1000) * 100);
    $("ring").style.setProperty("--p", pct + "%");
    $("ring").classList.toggle("hurry", left < 3000);
    const sec = Math.ceil(left / 1000);
    $("turnName").textContent = `${$("turnName").dataset.who || ""}　${sec}`;
    if (sec !== lastSec) { if (lastSec !== -1 && sec <= 3 && sec > 0) S("tick"); lastSec = sec; }
  }
  setInterval(drawTimer, 100);

  document.querySelectorAll(".soundBtn").forEach(b => b.onclick = () => {
    const m = window.KotobaSound.toggle();
    document.querySelectorAll(".soundBtn").forEach(x => { x.textContent = m ? "🔇" : "🔊"; x.setAttribute("aria-label", m ? "音を出す" : "音をきる"); });
  });
  if (window.KotobaSound && window.KotobaSound.muted) document.querySelectorAll(".soundBtn").forEach(x => { x.textContent = "🔇"; x.setAttribute("aria-label", "音を出す"); });

  function quit(goHome = true) {
    clearInterval(timer);
    try { if (peer) peer.destroy(); } catch (e) { /* */ }
    peer = null; hostConn = null; isHost = false; myId = null; game = null; view = null; members = []; conns.clear(); lastLobbyCount = 0; phaseShown = "";
    $("create").disabled = false; $("join").disabled = false;
    show("home");
    if (goHome) homeMsg("");
  }

  // ---------- ボタン ----------
  $("create").onclick = () => createRoom();
  $("join").onclick = joinRoom;
  $("joinCode").addEventListener("keydown", e => { if (e.key === "Enter") joinRoom(); });
  $("start").onclick = hostStart;
  $("time").onchange = () => broadcast();
  $("leave").onclick = () => quit();
  $("toHome").onclick = () => quit();
  $("again").onclick = () => { game = null; hostStart(); };
  $("wordForm").onsubmit = e => {
    e.preventDefault();
    const w = $("word").value;
    if (isHost) hostWord("host", w, showResult);
    else if (hostConn) hostConn.send({ t: "word", w });
  };
  $("giveup").onclick = () => {
    if (isHost) { if (game) { L.giveUp(game, "host", Date.now()); afterChange(); } }
    else if (hostConn) hostConn.send({ t: "giveup" });
  };
})();
