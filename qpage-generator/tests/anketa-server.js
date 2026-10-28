/*
 * Анкета QPortall на компьютере: страница (как её выкладывает «Опубликовать анкету») + веб-приложение
 * в имитации Google (doGet/doPost; после отправки сразу processAnketas). Для проверок в браузере.
 *   node build-gs.js && node tests/anketa-server.js [порт]
 */
"use strict";
const http = require("http");
const load = require("./anketa-harness");

function start(port, opts) {
  opts = opts || {};
  const m = load();
  if (opts.prepare) opts.prepare(m);
  const files = m.publish();
  // Как у Google: веб-приложение на другом адресе (страница — 127.0.0.1, приложение — localhost), значит, действуют
  // правила CORS; ответ на POST — переадресация 302 на другой путь, где лежит готовый ответ.
  const api = "http://localhost:" + port + "/api";
  const echoes = {};
  files["config.js"] = Buffer.from(String(files["config.js"]).replace(/"api":"[^"]*"/, '"api":' + JSON.stringify(api)));
  const types = { html: "text/html; charset=utf-8", css: "text/css", js: "application/javascript", png: "image/png", jpg: "image/jpeg", svg: "image/svg+xml" };
  m.requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/api") {
      // Как Google: на пробный запрос (OPTIONS) веб-приложение Apps Script не отвечает разрешением.
      if (req.method === "OPTIONS") { m.requests.push({ type: "OPTIONS" }); res.writeHead(405); res.end(); return; }
      const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
      if (req.method === "GET") {
        const p = Object.fromEntries(url.searchParams);
        res.writeHead(200, cors); res.end(m.ctx.doGet({ parameter: p }).body); return;
      }
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        m.requests.push({ type: req.headers["content-type"], size: body.length, body });
        const out = m.ctx.doPost({ postData: { contents: body } }).body;
        if (m.triggers.some((t) => t.fn === "processAnketas")) m.ctx.processAnketas();
        const id = String(Object.keys(echoes).length + 1);
        echoes[id] = out;
        setTimeout(() => { res.writeHead(302, { "Access-Control-Allow-Origin": "*", Location: "http://localhost:" + port + "/echo?id=" + id }); res.end(); }, opts.delay || 0);
      });
      return;
    }
    if (url.pathname === "/echo") {
      res.writeHead(200, { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" });
      res.end(echoes[url.searchParams.get("id")] || "{}");
      return;
    }
    let rel = decodeURIComponent(url.pathname).replace(/^\//, "") || "index.html";
    if (!files[rel]) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": types[rel.split(".").pop()] || "application/octet-stream" });
    res.end(files[rel]);
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ m, server, files, url: "http://127.0.0.1:" + port + "/" })));
}

module.exports = start;
if (require.main === module) {
  const port = +process.argv[2] || 8090;
  start(port).then((s) => console.log("Анкета: " + s.url));
}
