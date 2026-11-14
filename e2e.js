// 3人分のブラウザ画面で、部屋づくり→参加→対戦→脱落→勝敗までを試す
const { chromium } = require(process.env.HOME + "/tools/browser/node_modules/playwright");
(async () => {
  const b = await chromium.connectOverCDP("http://127.0.0.1:9333"); const made = [];
  const ctx = async () => { const c = await b.newContext({ viewport: { width: 420, height: 860 } }); made.push(c); return c; };
  const [h, c1, c2] = await Promise.all([ctx(), ctx(), ctx()].map(p => p.then(x => x.newPage())));
  for (const p of [h, c1, c2]) { p.on("pageerror", e => console.log("ERR", e.message)); p.on("console", m => { if (m.type() === "error" || m.type() === "warning") console.log("CONSOLE", m.text().slice(0, 200)); }); }
  const url = "http://localhost:8765/";
  await h.goto(url, { waitUntil: "domcontentloaded" }); await h.bringToFront(); await h.fill("#name", "けんた"); await h.bringToFront(); await h.click("#create");
  await h.waitForSelector("#lobby:not(.hide)", { timeout: 20000 });
  const code = await h.textContent("#code"); console.log("room", code);
  for (const [p, n] of [[c1, "ゆい"], [c2, "そら"]]) {
    await p.goto(url, { waitUntil: "domcontentloaded" }); await p.fill("#name", n); await p.fill("#joinCode", code); await p.click("#join");
    await p.waitForSelector("#lobby:not(.hide)", { timeout: 20000 }).catch(async e => { console.log("join msg:", await p.textContent("#homeMsg")); throw e; });
  }
  await h.waitForFunction(() => document.querySelectorAll("#lobbyPlayers .p:not(.empty)").length === 3);
  await h.selectOption("#time", "20");
  await h.screenshot({ path: "shot-lobby.png" });
  await h.bringToFront(); await h.click("#start");
  for (const p of [h, c1, c2]) await p.waitForSelector("#play:not(.hide)", { timeout: 10000 });
  const odai = await h.textContent("#odai"); console.log("odai", odai);
  const words = (await (await fetch(url + "dict/" + odai.codePointAt(0).toString(16) + ".txt")).text()).split("\n").slice(0, 10);
  // けんた：まちがい→正解
  await h.bringToFront(); await h.fill("#word", "ほげほげ"); await h.bringToFront(); await h.click("#send"); await h.waitForTimeout(300); console.log("host msg:", await h.textContent("#playMsg"));
  await h.bringToFront(); await h.fill("#word", words[0]); await h.bringToFront(); await h.click("#send"); await h.waitForTimeout(500); console.log("host msg:", await h.textContent("#playMsg"));
  // ゆい：カタカナで
  const kata = words[1].replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
  await c1.bringToFront(); await c1.fill("#word", kata); await c1.bringToFront(); await c1.click("#send"); await c1.waitForTimeout(500); console.log("c1 msg:", await c1.textContent("#playMsg"));
  // そら：同じ言葉→だめ
  await c2.bringToFront(); await c2.fill("#word", words[0]); await c2.bringToFront(); await c2.click("#send"); await c2.waitForTimeout(500); console.log("c2 msg:", await c2.textContent("#playMsg"));
  await c2.screenshot({ path: "shot-play.png" });
  // そら：時間切れで脱落を待つ
  await c2.bringToFront(); await c2.waitForFunction(() => document.querySelectorAll("#playPlayers .p.out").length === 1, null, { timeout: 30000 });
  console.log("c2 tiles:", await c2.$$eval("#playPlayers .p", ts => ts.map(t => t.className + ":" + t.textContent)));
  await h.screenshot({ path: "shot-out.png" });
  // けんたの番 → ギブアップ → ゆいの勝ち
  await h.bringToFront(); await h.click("#giveup");
  for (const p of [h, c1, c2]) await p.waitForSelector("#over:not(.hide)", { timeout: 10000 });
  console.log("winner:", await c2.textContent("#winner"));
  await c1.screenshot({ path: "shot-over.png" });
  for (const c of made) await c.close();
})().catch(e => { console.error("FAIL", e.message); process.exit(1); }).then(() => process.exit(0));
