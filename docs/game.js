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
  function receive(snap) {
    view = snap;
    if (snap.kind === "lobby") { game = isHost ? null : game; show("lobby"); renderLobby(); return; }
    const g = snap.game;
    localDeadline = Date.now() + snap.remainMs;
    if (g.events.length < shownEvents) { shownEvents = 0; shownUsed = 0; }
    for (const ev of g.events.slice(shownEvents)) {
      const p = g.players.find(x => x.id === ev.id);
      if (p) splash(`${p.av} ${p.name}さん、海へざぶーん！`);
    }
    shownEvents = g.events.length;
    if (g.phase === "over") { renderOver(g); show("over"); return; }
    if ($("play").classList.contains("hide")) { $("playMsg").textContent = ""; $("word").value = ""; }
    show("play"); renderPlay(g);
  }

  function playerTiles(list, g) {
    const tiles = list.map((p, i) => {
      const av = p.av || L.AVATARS[i % L.AVATARS.length];
      const cls = g ? (p.alive ? (g.players[g.turn] && g.players[g.turn].id === p.id ? "turn" : "") : "out") : "";
      return `<div class="p ${cls}"><span class="av">${av}</span>${esc(p.name)}${p.id === myId ? `<span class="me">じぶん</span>` : ""}</div>`;
    });
    while (tiles.length < L.MAX_PLAYERS) tiles.push(`<div class="p empty"><span class="av">・</span>あき</div>`);
    return tiles.join("");
  }

  function renderLobby() {
    const list = view && view.kind === "lobby" ? view.members : members;
    $("lobbyPlayers").innerHTML = playerTiles(list);
    $("timeWrap").classList.toggle("hide", !isHost);
    $("start").classList.toggle("hide", !isHost);
    $("waitHost").classList.toggle("hide", isHost);
    $("start").disabled = list.length < 2;
    $("start").textContent = list.length < 2 ? "あと1人以上あつまったらスタート" : `${list.length}人でスタート`;
  }

  function renderPlay(g) {
    $("odai").textContent = g.odai;
    $("odaiText").textContent = `「${g.odai}」から始まる言葉！`;
    const cur = g.players[g.turn];
    const mine = cur && cur.id === myId;
    $("turnName").textContent = mine ? "あなたの番！" : `${cur ? cur.name : ""}さんの番`;
    $("playPlayers").innerHTML = playerTiles(g.players, g);
    $("used").innerHTML = g.used.map((u, i) => `<span class="${i >= shownUsed ? "new" : ""}">${esc(u.w)}</span>`).join("") || `<span style="border:0;background:none;color:var(--sub)">まだ出た言葉はありません</span>`;
    $("used").scrollTop = $("used").scrollHeight;
    shownUsed = g.used.length;
    const me = g.players.find(p => p.id === myId);
    const canType = mine && me && me.alive;
    $("word").disabled = !canType; $("send").disabled = !canType;
    $("giveup").classList.toggle("hide", !(me && me.alive));
    $("word").placeholder = canType ? `「${g.odai}」から始まることば` : (me && !me.alive ? "見学中…" : "まってね");
    if (canType) $("word").focus();
  }

  function renderOver(g) {
    const w = g.players.find(p => p.id === g.winner);
    $("winner").innerHTML = w ? `<span class="av">${w.av}</span>${esc(w.name)}さんの勝ち！<div class="small">お題「${g.odai}」・出た言葉 ${g.used.length}こ</div>` : "引き分け";
    $("overUsed").innerHTML = g.used.map(u => `<span>${esc(u.w)}</span>`).join("");
    $("again").classList.toggle("hide", !isHost);
    $("waitAgain").classList.toggle("hide", isHost);
    $("again").disabled = !isHost || members.length < 2;
  }

  function showResult(res) {
    const m = $("playMsg");
    if (res.ok) { m.className = "msg ok"; m.textContent = `✓「${res.word}」は辞書にあります`; $("word").value = ""; }
    else { m.className = "msg ng"; m.textContent = (L.REASON[res.reason] || "出せませんでした") + (res.word ? `（${res.word}）` : ""); }
  }
  function alertMsg(t) { const m = $("playMsg"); m.className = "msg ng"; m.textContent = t; homeMsg(t); }

  function splash(text) {
    const s = $("splash"); s.firstElementChild.textContent = text; s.classList.remove("hide");
    s.firstElementChild.style.animation = "none"; void s.offsetWidth; s.firstElementChild.style.animation = "";
    clearTimeout(splash.t); splash.t = setTimeout(() => s.classList.add("hide"), 1600);
  }

  // 残り時間の表示（どの端末も自分の時計で数える）
  setInterval(() => {
    if (!view || view.kind !== "game" || view.game.phase !== "playing") return;
    const left = Math.max(0, localDeadline - Date.now());
    const pct = Math.min(100, left / (view.game.timeLimit * 1000) * 100);
    $("bar").firstElementChild.style.width = pct + "%";
    $("bar").classList.toggle("hurry", left < 3000);
    $("sec").textContent = `のこり ${Math.ceil(left / 1000)}びょう`;
  }, 100);

  function quit(goHome = true) {
    clearInterval(timer);
    try { if (peer) peer.destroy(); } catch (e) { /* */ }
    peer = null; hostConn = null; isHost = false; myId = null; game = null; view = null; members = []; conns.clear();
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
