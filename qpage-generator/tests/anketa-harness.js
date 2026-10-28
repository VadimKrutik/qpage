/*
 * Имитация Google (из apps-script-mock.js) + анкета QPortall, для проверок в браузере:
 *   const m = require("./anketa-harness")(); → { ctx, ss, props, nl, publish(api) → файлы страницы, ... }
 */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os");

module.exports = function load() {
  const src = fs.readFileSync(path.join(__dirname, "apps-script-mock.js"), "utf8");
  let harness = src.slice(0, src.indexOf("const checks = [];"));
  const list = '"QPortall-3-shablon2.gs"';
  harness = harness.replace(list, list + ', "QPortall-4-anketa.gs"').replace('"QPortall-5-yadro.gs"', '"QPortall-5-yadro.gs", "QPortall-6-stranica.gs"').replace(/__dirname/g, JSON.stringify(__dirname));
  harness += `
ctx.Utilities.base64Decode = (s) => Int8Array.from(Buffer.from(s, "base64"));
ctx.ScriptApp.getService = () => ({ getUrl: () => null });
ctx.LockService.getUserLock = () => ({ tryLock: () => !lk.userBusy, releaseLock: () => {} });
let uuids = 0;
ctx.Utilities.getUuid = () => require("crypto").randomBytes(16).toString("hex").replace(/^(.{8})(.{4})(.{4})(.{4})/, "$1-$2-$3-$4-");
const cf = Folder.prototype.createFile;
Folder.prototype.createFile = function (b) { const f = cf.call(this, b); allFiles[f.id] = f; return f; };
const zips = [];
const zip0 = ctx.Utilities.zip;
ctx.Utilities.zip = (blobs, name) => { zips.push({ name, blobs }); return zip0(blobs, name); };
module.exports = { ctx, ss, props, nl, driveRoot, allFiles, driveFile, triggers, alerts, zips, log,
  ui: (v) => { uiAvailable = v; } };
`;
  const tmp = path.join(os.tmpdir(), "qp-anketa-harness-" + process.pid + "-" + Date.now() + ".js");
  fs.writeFileSync(tmp, harness);
  const sample = path.join(__dirname, "sample");
  const argv = process.argv;
  process.argv = [argv[0], tmp, path.join(sample, "answers.json"), path.join(sample, "translations.json"), path.join(os.tmpdir(), "qp-anketa-out.json")];
  let m;
  try { m = require(tmp); } finally { fs.unlinkSync(tmp); process.argv = argv; }
  m.ui(true); m.ctx.setup(); m.ui(false);
  m.props.NETLIFY_TOKEN = "GOOD";
  // Опубликовать анкету (в имитации Netlify) и вернуть её файлы: { "index.html": Buffer, ... }.
  m.publish = (api) => {
    m.props.ANKETA_HASH = "";
    m.ctx.saveAnketaApi(api || "https://script.google.com/macros/s/LOCAL/exec");
    const z = m.zips[m.zips.length - 1];
    const out = {};
    z.blobs.forEach((b) => { out[b.name] = Buffer.isBuffer(b.data) ? b.data : typeof b.data === "string" ? Buffer.from(b.data) : Buffer.from(Uint8Array.from(b.data)); });
    return out;
  };
  return m;
};
