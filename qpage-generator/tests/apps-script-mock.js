/*
 * Прогон dist/QPortall-1-kod.gs + QPortall-2-shablon.gs + QPortall-3-shablon2.gs (собрать: node build-gs.js) в Node с имитацией сервисов Google:
 * setup() → ответ клиента → лист сайта → doGet() → JSON для генератора.
 * Настоящую работу в Google это не заменяет, но проверяет логику скрипта.
 *   node tests/apps-script-mock.js <ответы.json> <переводы.json> <куда сохранить JSON> [папка для файлов сайта]
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const [answersFile, trFile, outFile, siteOut] = process.argv.slice(2);
const answers = JSON.parse(fs.readFileSync(answersFile, "utf8"));
const tr = JSON.parse(fs.readFileSync(trFile, "utf8"));
const log = [];
const items = [];
const missingTr = [];

function chain(rec) {
  return new Proxy(rec, { get(t, k) {
    // setX(...) всегда записывает значение в поле setX (повторный вызов — перезаписывает).
    if (k in t && !(typeof k === "string" && k.startsWith("set"))) return t[k];
    return (...a) => { t[k] = a.length > 1 ? a : a[0]; return chain(t); };
  } });
}

class Sheet {
  constructor(name) { this.name = name; this.cells = []; this.links = []; }
  getName() { return this.name; }
  getIndex() { return ss.sheets.indexOf(this) + 1; }
  setName(n) { this.name = n; }
  getFormUrl() { return this.form ? "https://forms/edit" : null; }
  getRange(r, c, nr = 1, nc = 1) {
    const sh = this;
    const api = {
      setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { (sh.cells[r - 1 + i] ||= [])[c - 1 + j] = String(x); if (sh.links[r - 1 + i]) sh.links[r - 1 + i][c - 1 + j] = undefined; })); return api; },
      getDisplayValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (sh.cells[r - 1 + i] || [])[c - 1 + j] || "")); },
      getDisplayValue() { return api.getDisplayValues()[0][0]; },
      // Текст со ссылкой: в ячейке — надпись, адрес — в sh.links.
      setRichTextValue(v) { (sh.cells[r - 1] ||= [])[c - 1] = v.text; (sh.links[r - 1] ||= [])[c - 1] = v.url; return api; },
      setFontWeight() { return api; }, setNumberFormat() { return api; }, setWrap() { return api; }, setFormulas(v) { return api.setValues(v); }
    };
    return api;
  }
  getDataRange() { const w = Math.max(...this.cells.map((r) => r.length)); return this.getRange(1, 1, this.cells.length, w); }
  getLastRow() { return this.cells.length; }
  getLastColumn() { return Math.max(...this.cells.map((r) => r.length)); }
  setFrozenRows() {} setColumnWidth() {}
  getActiveCell() { return { getRow: () => this.activeRow || 1 }; }
}
const ss = {
  // Таблица, где уже есть лист «Ответы» от прежней (удалённой) формы — так было у Vadim.
  sheets: [new Sheet("Sheet1"), Object.assign(new Sheet("Ответы"), { cells: [["Отметка времени", "старое"]] })],
  getId: () => "SHEET", getUrl: () => "https://docs.google.com/spreadsheets/d/SHEET",
  getSheets() { return this.sheets; },
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; },
  insertSheet(n, idx) { const s = new Sheet(n); if (idx == null) this.sheets.push(s); else this.sheets.splice(idx, 0, s); return s; },
  getSpreadsheetTimeZone: () => "Asia/Jerusalem", linkedForm: null, getFormUrl() { return this.linkedForm; }, getActiveSheet() { return this.active; },
  deleteSheet(s) { this.sheets = this.sheets.filter((x) => x !== s); }
};
const props = {};
const form = {
  getId: () => "FORM", getEditUrl: () => "https://forms/edit", getPublishedUrl: () => "https://forms/view",
  setDescription() {}, setCollectEmail() {}, setProgressBar() {},
  setDestination() { const s = new Sheet("Ответы на форму (1)"); s.form = true; ss.sheets.push(s); ss.linkedForm = "https://forms/edit"; }
};
["addTextItem", "addParagraphTextItem", "addMultipleChoiceItem", "addCheckboxItem", "addListItem", "addPageBreakItem", "addSectionHeaderItem"]
  .forEach((m) => { form[m] = () => {
    const rec = { kind: m, getTitle: () => rec.setTitle, getIndex: () => items.indexOf(rec),
      getType: () => ({ addPageBreakItem: "PAGE_BREAK", addMultipleChoiceItem: "MULTIPLE_CHOICE", addTextItem: "TEXT" })[m] || m,
      asPageBreakItem: () => chain(rec), asMultipleChoiceItem: () => chain(rec), asTextItem: () => chain(rec),
      createChoice: (value, page) => ({ value, page }) };
    items.push(rec); return chain(rec);
  }; });
form.getItems = (type) => items.filter((it) => !type || it.getType() === type).map(chain);
form.deleteItem = (it) => { items.splice(it.getIndex(), 1); };
form.moveItem = (from, to) => { const [it] = items.splice(from, 1); items.splice(to, 0, it); };

// Google Диск: папки и файлы в памяти.
let ids = 0;
function blob(data, type, name) {
  return { data, type, name, getContentType() { return this.type; }, copyBlob() { return blob(this.data, this.type, this.name); }, getBytes() { return Array.from(new Int8Array(Buffer.from(this.data))); }, setName(n) { this.name = n; return this; } };
}
const MIME_BY_EXT = { png: "image/png", jpg: "image/jpeg", heic: "image/heif" };
function driveFile(name, data, type) {
  const f = { name, id: "D" + ++ids, trashed: false, blob: blob(data, type, name),
    getId() { return f.id; }, getName() { return f.name; }, getUrl() { return "https://drive/" + f.id; }, setTrashed(v) { f.trashed = v; },
    getMimeType() { return f.blob.type; }, getSize() { return Buffer.byteLength(f.blob.data); }, getBlob() { return f.blob.copyBlob(); },
    makeCopy(n, folder) { const c = driveFile(n, f.blob.data, f.blob.type); folder.files.push(c); allFiles[c.id] = c; return c; } };
  return f;
}
const allFiles = {};
class Folder {
  constructor(name) { this.name = name; this.id = "F" + ++ids; this.folders = []; this.files = []; this.trashed = false; }
  getId() { return this.id; } getUrl() { return "https://drive/" + this.id; } getName() { return this.name; }
  setTrashed(v) { this.trashed = v; }
  createFolder(n) { const f = new Folder(n); this.folders.push(f); return f; }
  createFile(b) { const f = driveFile(b.name, b.data, b.type); f.blob = b; this.files.push(f); return f; }
  getFiles() { return iter(this.files.filter((f) => !f.trashed)); }
  getFoldersByName(n) { return iter(this.folders.filter((f) => f.name === n && !f.trashed)); }
  getFilesByName(n) { return iter(this.files.filter((f) => f.name === n && !f.trashed)); }
}
function iter(a) { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; }
const driveRoot = new Folder("root");
let uiAvailable = false;
let formsCreated = 0;
const triggers = [];
const alerts = [];
// Блокировка скрипта: held — занята другим запуском, waited — сколько мс просили ждать.
const lk = { held: false, busy: false, waited: 0, released: 0 };

const ctx = {
  FormApp: { create: () => { formsCreated++; return form; }, openById: () => form, openByUrl: () => form, DestinationType: { SPREADSHEET: "S" },
    ItemType: { PAGE_BREAK: "PAGE_BREAK", MULTIPLE_CHOICE: "MULTIPLE_CHOICE", TEXT: "TEXT" },
    createTextValidation: () => chain({ kind: "validation" }) },
  SpreadsheetApp: { newRichTextValue: () => { const v = {}; const b = { setText: (t) => { v.text = t; return b; }, setLinkUrl: (u) => { v.url = u; return b; }, build: () => v }; return b; },
    create: () => ss, openById: () => ss, getActiveSpreadsheet: () => ss, flush() {},
    getUi() {
      if (!uiAvailable) throw new Error("Cannot call SpreadsheetApp.getUi() from this context.");
      return { alert: (m) => alerts.push(m), showModalDialog: (h) => alerts.push(h.html), createMenu: (t) => { const m = { title: t, items: [] }; ctx.__menu = m;
        const api = { addItem: (l, fn) => { m.items.push(fn); return api; }, addSeparator: () => api, addToUi: () => {} }; return api; } };
    } },
  DriveApp: { createFolder: (n) => driveRoot.createFolder(n), getFoldersByName: (n) => driveRoot.getFoldersByName(n), getFileById: (id) => { if (!allFiles[id]) throw new Error("No item with the given ID could be found."); return allFiles[id]; },
    getFolderById: (id) => { const find = (f) => f.id === id ? f : f.folders.map(find).find(Boolean); return find(driveRoot); } },
  ScriptApp: { newTrigger: (fn) => { const t = { fn, getHandlerFunction: () => fn }; triggers.push(t); return chain(t); },
    getOAuthToken: () => "OAUTH", getProjectTriggers: () => triggers.slice(), deleteTrigger: (t) => { triggers.splice(triggers.indexOf(t), 1); } },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperties: (o) => Object.assign(props, o),
    setProperty: (k, v) => { props[k] = v; }, deleteProperty: (k) => { delete props[k]; } }) },
  LockService: { getScriptLock: () => ({
    tryLock: (ms) => { lk.waited = ms; if (lk.busy) return false; lk.held = true; return true; },
    releaseLock: () => { lk.held = false; lk.released++; } }) },
  UrlFetchApp: { fetch: (url, opt) => (/googleapis\.com\/drive|^https:\/\/lh3\./.test(url) ? thumbMock(url, opt || {}) : netlifyMock(url, opt || {})) },
  Utilities: { getUuid: () => "1234abcd-0000-0000-0000-000000000000",
    newBlob: (data, type, name) => blob(data, type, name),
    zip: (blobs, name) => ({ name, type: "application/zip", entries: blobs.map((b) => b.name), getBytes: () => [80, 75, 3, 4] }),
    sleep: () => { nl.slept++; },
    computeDigest: (alg, str) => [...require("crypto").createHash("sha256").update(String(str)).digest()],
    base64Encode: (bytes) => Buffer.from(bytes).toString("base64"),
    DigestAlgorithm: { SHA_256: "SHA_256" }, Charset: { UTF_8: "UTF_8" },
    formatDate: () => "24.10.2026 15:30" },
  LanguageApp: { translate(text, from, to) {
    const k = to + "|" + text;
    if (!(k in tr)) { missingTr.push(k); return "[" + to + "] " + text; }
    return tr[k];
  } },
  Maps: { newGeocoder: () => ({ setRegion() { return this; }, geocode: (a) => (a ? { status: "OK", results: [{ geometry: { location: { lat: 31.8014, lng: 34.6435 } } }] } : { status: "ZERO_RESULTS", results: [] }) }) },
  ContentService: { createTextOutput: (s) => ({ body: s, setMimeType() { return this; } }), MimeType: { JSON: "json" } },
  HtmlService: { createHtmlOutput: (html) => ({ html, setWidth() { return this; }, setHeight() { return this; } }) },
  Logger: { log: (s) => log.push(s) }
};
// Миниатюры Google Диска (сжатие фото): Drive API отдаёт thumbnailLink, по нему — уменьшенный JPG.
// Только что скопированному файлу Диск готовит миниатюру не сразу: первый запрос — без ссылки.
const thumbJpg = fs.readFileSync(path.join(__dirname, "sample/media/photo2.jpg"));
const gd = { meta: [], got: [], fresh: new Set(), off: false, type: "image/jpeg" };
function thumbMock(url, opt) {
  const res = (code, body, b) => ({ getResponseCode: () => code, getContentText: () => (typeof body === "string" ? body : JSON.stringify(body)), getBlob: () => b });
  if ((opt.headers || {}).Authorization !== "Bearer OAUTH") return res(401, "no auth");
  let m = url.match(/drive\/v3\/files\/([\w-]+)\?fields=thumbnailLink/);
  if (m) {
    gd.meta.push(m[1]);
    if (!allFiles[m[1]]) return res(404, "not found");
    if (gd.off) return res(200, {});
    if (!gd.fresh.has(m[1])) { gd.fresh.add(m[1]); return res(200, {}); }
    return res(200, { thumbnailLink: "https://lh3.googleusercontent.com/drive-storage/T" + m[1] + "=s220" });
  }
  m = url.match(/drive-storage\/T([\w-]+)=s(\d+)$/);
  if (m) { gd.got.push(m[1] + "@" + m[2]); return res(200, "", blob(thumbJpg, gd.type, "thumb")); }
  return res(404, "?");
}

// Netlify API и сами сайты *.netlify.app — в памяти.
const nl = { sites: {}, requests: [], slept: 0, taken: new Set(), visibility: 200, failDeploy: false, formsDetect: true, pollsBeforeReady: 2 };
function netlifyMock(url, opt) {
  const method = (opt.method || "get").toLowerCase();
  const auth = (opt.headers || {}).Authorization;
  const res = (code, body) => ({ getResponseCode: () => code, getContentText: () => (typeof body === "string" ? body : JSON.stringify(body)) });
  nl.requests.push(method + " " + url);
  const site = Object.values(nl.sites).find((x) => url.startsWith(x.ssl_url));
  if (site) { // посетитель открывает сайт
    if (nl.visibility !== 200) return res(nl.visibility, "Redirecting to login");
    return res(200, '<script src="assets/js/content.js"></script>');
  }
  const p = url.replace("https://api.netlify.com/api/v1", "");
  if (auth !== "Bearer GOOD") return res(401, { code: 401, message: "Access Denied" });
  if (p === "/user") return res(200, { email: "vadim@example.com" });
  if (p === "/accounts") return res(200, [{ slug: "vadim-team" }]);
  if (p === "/sites" && method === "post") {
    const b = JSON.parse(opt.payload);
    if (nl.taken.has(b.name) || Object.values(nl.sites).some((x) => x.name === b.name)) return res(422, { errors: { subdomain: ["must be unique"] } });
    const s = { id: "S" + ++ids, name: b.name, ssl_url: "https://" + b.name + ".netlify.app", admin_url: "https://app.netlify.com/projects/" + b.name, deploys: [], forms: [], processing_settings: {} };
    nl.sites[s.id] = s; return res(201, s);
  }
  let m;
  if ((m = p.match(/^\/sites\/(\w+)$/))) {
    const s = nl.sites[m[1]];
    if (!s) return res(404, { code: 404, message: "Not Found" });
    if (method === "patch") Object.assign(s.processing_settings, JSON.parse(opt.payload).processing_settings);
    return res(200, s);
  }
  if ((m = p.match(/^\/sites\/(\w+)\/deploys$/)) && method === "post") {
    const s = nl.sites[m[1]];
    if (nl.failDeploy) return nl.failDeploy === "credit" ? res(403, { message: "Account credit usage exceeded - new deploys are blocked until credits are added" }) : res(500, { message: "Internal error" });
    if (opt.contentType !== "application/zip" || !Array.isArray(opt.payload)) return res(400, { message: "bad zip" });
    const d = { id: "DEP" + ++ids, site: s.id, state: "uploaded", polls: 0 };
    s.deploys.push(d); nl.deploys = Object.assign(nl.deploys || {}, { [d.id]: d });
    return res(200, { id: d.id, state: d.state });
  }
  if ((m = p.match(/^\/deploys\/(\w+)$/))) {
    const d = nl.deploys[m[1]];
    if (++d.polls >= nl.pollsBeforeReady) {
      d.state = "ready";
      const s = nl.sites[d.site];
      if (nl.formsDetect && s.processing_settings.ignore_html_forms === false && !s.forms.length) s.forms.push({ name: "contact" });
    }
    return res(200, { id: d.id, state: d.state });
  }
  if ((m = p.match(/^\/sites\/(\w+)\/forms$/))) return res(200, nl.sites[m[1]].forms);
  nl.hooks = nl.hooks || [];
  if ((m = p.match(/^\/hooks\?site_id=(\w+)$/))) {
    if (method === "get") return res(200, nl.hooks.filter((h) => h.site_id === m[1]));
    const h = Object.assign({ id: "H" + ++ids, site_id: m[1] }, JSON.parse(opt.payload));
    nl.hooks.push(h); return res(201, h);
  }
  if ((m = p.match(/^\/hooks\/(\w+)$/)) && method === "delete") { nl.hooks = nl.hooks.filter((h) => h.id !== m[1]); return res(204, ""); }
  return res(404, { message: "Not Found: " + p });
}
vm.createContext(ctx);
["QPortall-1-kod.gs", "QPortall-2-shablon.gs", "QPortall-3-shablon2.gs", "QPortall-5-yadro.gs"].forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, "../dist", f), "utf8"), ctx));

const checks = [];
const ok = (name, cond, info = "") => checks.push({ name, pass: !!cond, info });

uiAvailable = true;
ctx.addMenu();
ok("меню до настройки: «Первая настройка» и «Инструкция»", JSON.stringify(ctx.__menu.items) === '["setup","showHelp"]', JSON.stringify(ctx.__menu));
ctx.showHelp();
ok("«Инструкция»: окно с шагами (скрипт, клиент, правка, удаление в Netlify)", ["QPortall-1-kod.gs", "QPortall-2-shablon.gs", "QPortall-3-shablon2.gs", "QPortall-5-yadro.gs", "Ctrl+A", "Обновить форму", "Сделать сайт из этого листа", "Danger zone", "languages", "#1565C0"].every((w) => alerts[alerts.length - 1].includes(w)), alerts[alerts.length - 1].slice(0, 200));
alerts.pop();
ctx.setup();
ok("setup: показал ссылку на форму в таблице", alerts[0] && alerts[0].includes("https://forms/view"), alerts[0]);
ok("окно: ссылки кликабельные", alerts[0].includes('<a href="https://forms/edit" target="_blank"'), alerts[0]);
ok("setup: меню QPage сразу в таблице и при каждом открытии (триггер)", ctx.__menu.items.includes("makeSiteFromActiveSheet") && triggers.some((t) => t.fn === "addMenu"), JSON.stringify(ctx.__menu));
ctx.addMenu();
ok("меню после настройки", ctx.__menu.items.includes("makeSiteFromActiveSheet"), JSON.stringify(ctx.__menu.items));
uiAvailable = false;
const qs = ctx.questions().filter((q) => q.key);
const created = items.filter((i) => !/PageBreak|SectionHeader/.test(i.kind));
ok("setup: все вопросы созданы в форме", created.length === qs.length, created.length + " / " + qs.length);
ok("setup: названия вопросов совпадают", created.every((it, i) => it.setTitle === qs[i].title));
ok("setup: первый раздел без пустой страницы", items[0].kind === "addSectionHeaderItem");
ok("setup: обязательные поля", created.filter((i) => i.setRequired === true).length === qs.filter((q) => q.required).length);
ok("setup: проверки телефона/почты/цены", created.filter((i) => i.setValidation).length === qs.filter((q) => q.validate).length);
// Цепочка «Да / Нет»: «Да» → страница вопросов блока, «Нет» → следующий блок, у последнего — «Оформление».
function gateLinks() {
  const g = ctx.gates(), out = [];
  g.forEach((x, i) => {
    const ask = items.find((it) => it.setTitle === x.ask);
    const at = items.indexOf(ask);
    const ch = (ask && ask.setChoices) || [];
    const yes = ch.find((c) => c.value === "Да"), no = ch.find((c) => c.value === "Нет");
    const nextTitle = i + 1 < g.length ? g[i + 1].page : "Оформление";
    out.push(!!ask && items[at - 1].kind === "addPageBreakItem" && items[at - 1].setTitle === x.page &&
      yes && yes.page.getTitle() === x.detail && yes.page.getIndex() === at + 1 &&
      no && no.page.getTitle() === nextTitle && no.page.kind === "addPageBreakItem" &&
      x.questions.every((q, j) => items[at + 2 + j] && items[at + 2 + j].setTitle === q.title));
  });
  const design = items.findIndex((it) => it.setTitle === "Оформление");
  const lastQ = g[g.length - 1].questions;
  return out.every(Boolean) && items[design - 1].setTitle === lastQ[lastQ.length - 1].title ? "ok" : JSON.stringify(out) + " design@" + design;
}
ok("форма: цепочка Да/Нет для прайса, отзывов, шагов, лицензии, видео перед «Оформлением»", gateLinks() === "ok", gateLinks());
ok("форма: ссылки проверяются как URL", items.filter((i) => i.setTitle && /^Ссылка на (файл|скан)/.test(i.setTitle)).length === 1 && items.filter((i) => i.setTitle && /^Ссылка на (файл|скан)/.test(i.setTitle)).every((i) => i.setValidation), "");
ok("setup: лист ответов переименован, пустой удалён", ss.getSheetByName("Ответы") && ss.getSheetByName("Ответы").form && !ss.getSheetByName("Sheet1"), ss.sheets.map((s) => s.name).join());
ok("setup: старый лист «Ответы» не мешает, переименован", !!ss.getSheetByName("Ответы (старая форма)"), ss.sheets.map((s) => s.name).join());
ok("setup: ключ и id сохранены", props.TOKEN && props.FORM_ID && props.SHEET_ID);
let again = null; uiAvailable = true; ctx.__menu = null;
try { ctx.setup(); } catch (e) { again = e.message; } uiAvailable = false;
ok("setup: повторный запуск — без ошибки, без второй формы, меню QPage возвращено", !again && formsCreated === 1 &&
  alerts[alerts.length - 1].includes("уже настроено") && ctx.__menu && ctx.__menu.items.includes("makeSiteFromActiveSheet"), again || alerts[alerts.length - 1]);

// Ответ приходит так же, как e.namedValues в триггере таблицы: { "Заголовок вопроса": ["значение"] }
const named = {};
qs.forEach((q) => { if (answers[q.key] != null) named[q.title] = [answers[q.key]]; });
// Вопросы «Загрузка файлов»: в ответе — ссылки на файлы, которые Google положил на Диск владельца формы.
const mediaDir = path.join(path.dirname(answersFile), "media");
const upload = (name) => { const f = driveFile(name, fs.readFileSync(path.join(mediaDir, name)), MIME_BY_EXT[name.split(".").pop().toLowerCase()]); allFiles[f.id] = f; return "https://drive.google.com/open?id=" + f.id; };
if (fs.existsSync(mediaDir)) {
  named["Логотип"] = [upload("logo.png")];
  // Как у Vadim: вопрос назван «Фото для сайта», а не «Фотографии для сайта».
  named["Фото для сайта"] = [["photo1.jpg", "photo2.jpg", "photo3.jpg", "IMG_0004.HEIC"].map(upload).join(", ")];
  named["Фото для сайта"][0] += ", https://drive.google.com/open?id=GONE"; // файл, к которому нет доступа
  named["Ваше фото"] = [upload("photo1.jpg")];
  named["Главное фото"] = [upload("photo2.jpg")];
  named["Фото лицензий и дипломов"] = [upload("photo3.jpg")];
}
ctx.onFormSubmit({ namedValues: named }); // триггер: окон нет
ok("очередь: сборка по анкете берёт блокировку и отпускает её", lk.released === 1 && !lk.held && lk.waited >= 60000, JSON.stringify(lk));
// Адрес ссылки в ячейке листа (на «Сайты» ссылки — короткими словами).
const href = (sheet, row, col) => ((sheet.links[row] || [])[col]) || (sheet.cells[row] || [])[col];
const sheetName = ss.sheets.map((x) => x.name).find((n) => n !== "Сайты" && !n.startsWith("Ответы"));
ok("новый лист клиента — сразу после «Сайты»", ss.sheets.findIndex((x) => x.name === sheetName) === ss.sheets.findIndex((x) => x.name === "Сайты") + 1, ss.sheets.map((x) => x.name).join(", "));
ok("ответ → лист сайта", !!sheetName, ss.sheets.map((x) => x.name).join());
const sitesRoot = driveRoot.folders.find((f) => f.name === "QPage — сайты");
const siteFolder = sitesRoot.folders.find((f) => f.name === sheetName && !f.trashed);
ok("ответ → сайт сразу собран в папке на Диске", siteFolder && siteFolder.files.some((f) => f.name === "index.html"));
const zip = sitesRoot.files.find((f) => f.name === sheetName + ".zip" && !f.trashed);
const nMedia = fs.existsSync(mediaDir) ? 8 : 0;
ok("ZIP с правильными путями внутри", zip && zip.blob.entries.includes("assets/js/content.js") && zip.blob.entries.includes("index.html") && zip.blob.entries.includes("robots.txt") && zip.blob.entries.length === 9 + nMedia, zip && zip.blob.entries.join());
if (nMedia) {
  const photoDir = sitesRoot.folders.find((f) => f.name === sheetName + " — фото");
  ok("фото: файлы из анкеты скопированы в папку «<лист> — фото»", photoDir && photoDir.files.map((f) => f.name).join() === "logo.png,photo-01-photo1.jpg,photo-02-photo2.jpg,photo-03-photo3.jpg,photo-04-IMG_0004.HEIC,main.jpg,portrait.jpg,doc-01-photo3.jpg", photoDir && photoDir.files.map((f) => f.name).join());
  ok("фото: логотип и 4 фото в ZIP, HEIC переведён в JPG", ["assets/img/logo.png", "assets/img/photo-1.jpg", "assets/img/photo-3.jpg", "assets/img/photo-4.jpg"].every((e) => zip.blob.entries.includes(e)) && !zip.blob.entries.some((e) => /heic/i.test(e)), zip.blob.entries.join());
  const small = photoDir.folders.find((f) => f.name === "для сайта (сжатые)");
  ok("сжатие: HEIC → JPG 1600 точек через миниатюру Диска, копия в «для сайта (сжатые)», оригинал на месте",
    small && small.files.length === 1 && /\.jpg$/.test(small.files[0].name) && gd.got.length === 1 && /@1600$/.test(gd.got[0]) && photoDir.files.some((f) => f.name === "photo-04-IMG_0004.HEIC"),
    JSON.stringify({ small: small && small.files.map((f) => f.name), got: gd.got }));
  ok("сжатие: лёгкие фото и логотип не трогаются (миниатюры не запрашиваются)", gd.meta.length === 2 && gd.meta[0] === gd.meta[1], JSON.stringify(gd.meta));
  const img = siteFolder.folders.find((f) => f.name === "assets").folders.find((f) => f.name === "img");
  ok("фото: картинки в папке сайта те же байты", img && Buffer.compare(img.files.find((f) => f.name === "photo-1.jpg").blob.data, fs.readFileSync(path.join(mediaDir, "photo1.jpg"))) === 0);
  const content = siteFolder.folders.find((f) => f.name === "assets").folders.find((f) => f.name === "js").files.find((f) => f.name === "content.js").blob.data;
  const html = siteFolder.files.find((f) => f.name === "index.html").blob.data;
  ok("фото: в content.js свой логотип и галерея включена", content.includes('"logo": "assets/img/logo.png"') && content.includes('"gallery": true') && content.includes('"src": "assets/img/photo-3.jpg"'));
  ok("фото владельца: на первом экране, в content.js; не попало в галерею", content.includes('"portrait": "assets/img/portrait.jpg"') && zip.blob.entries.includes("assets/img/portrait.jpg") &&
    /<img class="hero-portrait" src="assets\/img\/portrait\.jpg" alt="[^"]+" width="160" height="160">/.test(html) && !content.includes('"src": "assets/img/photo-5'), "");
  ok("главное фото: крупно под кнопками; фото владельца — в цветной заливке", content.includes('"mainPhoto": "assets/img/main.jpg"') && zip.blob.entries.includes("assets/img/main.jpg") &&
    /<img class="hero-photo" src="assets\/img\/main\.jpg"/.test(html) && /<div class="hero-banner">\s*<div class="container">\s*<img class="hero-portrait"/.test(html));
  ok("фото документов: в блоке лицензий маленькими картинками со ссылкой на полный размер", content.includes('"docs": [\n') && zip.blob.entries.includes("assets/img/doc-1.jpg") &&
    /<ul class="doc-photos" id="credentials-docs"><li><a href="assets\/img\/doc-1\.jpg" target="_blank" rel="noopener"><img src="assets\/img\/doc-1\.jpg" alt="[^"]+ - 1"/.test(html), (html.match(/<ul class="doc-photos"[^]{0,300}/) || [""])[0]);
  ok("фото: значок вкладки — логотип клиента", html.includes('<link rel="icon" href="assets/img/logo.png" type="image/png">'));
  const row = ss.getSheetByName("Сайты").cells[1];
  ok("фото: маленькое фото — замечание с размером (640×420 меньше 1200 у главного)", row[4].includes("Главное фото низкого качества. Замените: main.jpg"), row[4]);
  ok("фото: в «Сайты» нет замечания про HEIC, есть ссылка на папку фото", !row[4].includes("HEIC (iPhone)") && href(ss.getSheetByName("Сайты"), 1, 6) === photoDir.getUrl() && row[6] === "Фото" && ss.getSheetByName("Сайты").cells[0][6] === "фото и логотип", JSON.stringify(row));
  ok("фото: недоступный файл не ломает обработку, записан в журнал", log.some((l) => String(l).includes("GONE")));
}
const list = ss.getSheetByName("Сайты");
ok("лист «Сайты»: строка со ссылками", list && list.cells[1] && list.cells[1][0] === sheetName && href(list, 1, 2).startsWith("https://drive/") && list.cells[1][2] === "Папка" && list.cells[1][3] === "ZIP", JSON.stringify(list && list.cells));

// «Сделать сайт» на листе «Сайты» с выделенной строкой клиента.
uiAvailable = true;
ss.active = ss.getSheetByName("Сайты"); ss.active.activeRow = 2;
ctx.makeSiteFromActiveSheet();
uiAvailable = false;
ok("«Сделать сайт» на листе «Сайты»: берёт клиента из выделенной строки", alerts[alerts.length - 1].includes("Сайт готов"), alerts[alerts.length - 1]);
ss.getSheetByName("Сайты").activeRow = 1;

// Пересборка из меню после правки листа: старая версия в корзине, строка в «Сайты» та же.
uiAvailable = true;
ss.active = ss.getSheetByName(sheetName);
ctx.makeSiteFromActiveSheet();
uiAvailable = false;
ok("меню «Сделать сайт»: окно со ссылкой", alerts[alerts.length - 1].includes("Сайт готов") && alerts[alerts.length - 1].includes("https://drive/"), alerts[alerts.length - 1]);
ok("пересборка: старая папка в корзине, новая одна", sitesRoot.folders.filter((f) => f.name === sheetName && !f.trashed).length === 1 && sitesRoot.folders.filter((f) => f.name === sheetName).length === 3);
ok("пересборка: в «Сайты» не появилось дубля", list.cells.filter((r) => r[0] === sheetName).length === 1);
ss.active = ss.getSheetByName("Ответы");
uiAvailable = true; ctx.makeSiteFromActiveSheet(); uiAvailable = false;
ok("меню на чужом листе: подсказка, а не ошибка", alerts[alerts.length - 1].includes("Откройте лист клиента"));

// Файлы сайта с «Диска» — на диск компьютера, для проверки в браузере.
if (siteOut) {
  const dump = (folder, dir) => {
    fs.mkdirSync(dir, { recursive: true });
    folder.files.filter((f) => !f.trashed).forEach((f) => fs.writeFileSync(path.join(dir, f.name), f.blob.data));
    folder.folders.filter((f) => !f.trashed).forEach((f) => dump(f, path.join(dir, f.name)));
  };
  fs.rmSync(siteOut, { recursive: true, force: true });
  dump(sitesRoot.folders.find((f) => f.name === sheetName && !f.trashed), siteOut);
}

// Повторная обработка той же строки даёт новый лист с суффиксом, а не перезапись.
const resp = ss.getSheetByName("Ответы");
resp.cells = [qs.map((q) => q.title), qs.map((q) => answers[q.key] || "")];
ok("processRow: повторная обработка → новый лист", ctx.processRow(2) === sheetName + "-2");
ok("processRow: и для него собран сайт", sitesRoot.folders.some((f) => f.name === sheetName + "-2"));

const bad = JSON.parse(ctx.doGet({ parameter: { token: "wrong" } }).body);
ok("doGet: чужой ключ отклонён", bad.ok === false);
const sitesList = JSON.parse(ctx.doGet({ parameter: { token: props.TOKEN } }).body);
ok("doGet: список листов сайтов", JSON.stringify(sitesList.sites) === JSON.stringify([sheetName + "-2", sheetName]), JSON.stringify(sitesList));
const site = JSON.parse(ctx.doGet({ parameter: { token: props.TOKEN, site: sheetName } }).body);
ok("doGet: лист сайта отдан", site.ok && site.rows.length > 10);
const none = JSON.parse(ctx.doGet({ parameter: { token: props.TOKEN, site: "Ответы" } }).body);
ok("doGet: лист ответов не отдаётся", none.ok === false);
ok("все тексты переведены (в имитации)", missingTr.length === 0, missingTr.join(" || "));

// Новая версия скрипта с вопросом, которого нет в уже созданной форме.
const capIdx = items.findIndex((i) => i.setTitle === "Подписи к фотографиям");
items.splice(capIdx, 1);
uiAvailable = true; ctx.updateForm(); uiAvailable = false;
const capNew = items.findIndex((i) => i.setTitle === "Подписи к фотографиям");
ok("updateForm: недостающий вопрос добавлен на своё место", capNew === capIdx && items[capNew + 1].setTitle === "Что ещё показать на сайте?", capNew + " vs " + capIdx);
ok("updateForm: подсказка добавить вопросы «Загрузка файлов»", alerts[alerts.length - 1].includes("«Логотип»") && alerts[alerts.length - 1].includes("Загрузка файлов"), alerts[alerts.length - 1]);
uiAvailable = true; ctx.updateForm(); uiAvailable = false;
ok("updateForm: второй запуск ничего не дублирует", items.filter((i) => i.setTitle === "Подписи к фотографиям").length === 1 && alerts[alerts.length - 1].includes("форма актуальна"));

// Старая форма (до прайса/отзывов/…): нет районов, главной кнопки, доступности и всей цепочки.
{
  const gt = ctx.gates();
  const drop = new Set(["Районы и города, где вы работаете", "Главная кнопка сайта", "Внешний вид сайта", "Добавить на сайт заявление о доступности?"]);
  gt.forEach((g) => { drop.add(g.page); drop.add(g.ask); drop.add(g.detail); g.questions.forEach((q) => drop.add(q.title)); });
  const cap = items.find((i) => i.setTitle === "Подписи к фотографиям"); cap.setHelpText = "старая подсказка";
  const full = items.length;
  for (let i = items.length - 1; i >= 0; i--) if (drop.has(items[i].setTitle)) items.splice(i, 1);
  uiAvailable = true; ctx.updateForm(); uiAvailable = false;
  const msg = alerts[alerts.length - 1];
  const at = (t) => items.findIndex((i) => i.setTitle === t);
  ok("старая форма: районы — сразу после адреса (та же страница)", at("Районы и города, где вы работаете") === at("Адрес") + 1);
  ok("старая форма: «На чём сделать акцент?» — после цвета, главная кнопка — после него, доступность — после доп. блоков",
    at("На чём сделать акцент?") === at("Основной цвет сайта") + 1 && at("Главная кнопка сайта") === at("На чём сделать акцент?") + 1 &&
    at("Добавить на сайт заявление о доступности?") === at("Что ещё показать на сайте?") + 1);
  ok("старая форма: цепочка блоков добавлена и связана", gateLinks() === "ok", gateLinks());
  ok("старая форма: в сообщении названы новые блоки", gt.every((g) => msg.includes("«" + g.page + "»")), msg);
  ok("старая форма: подсказка к подписям фото обновлена (название — цена)", /цена/.test(cap.setHelpText), cap.setHelpText);
  uiAvailable = true; ctx.updateForm(); uiAvailable = false;
  ok("старая форма: второй запуск ничего не дублирует", items.length === full && gateLinks() === "ok" && alerts[alerts.length - 1].includes("форма актуальна"),
    items.length + " vs " + full);
}

// Форма прошлой версии: отзывы по 8 полям, «видео с YouTube», подписи к фото далеко от вопроса с фото.
{
  const at = (t) => items.findIndex((i) => i.setTitle === t);
  const rev = at("Тексты отзывов");
  items.splice(rev, 1);
  for (let i = 4; i >= 1; i--) {
    ["Отзыв " + i + ": имя клиента", "Отзыв " + i + ": текст"].forEach((title) => { const r = { kind: "addTextItem", setTitle: title }; r.getTitle = () => r.setTitle; r.getIndex = () => items.indexOf(r); r.getType = () => "TEXT"; items.splice(rev, 0, r); });
  }
  items[at("Ссылка на видео")].setTitle = "Ссылка на видео YouTube";
  items[at("Цены (прайс-лист)")].setTitle = "Прайс-лист"; // как в форме прошлой версии: страница и вопрос с одним названием
  items[at("Показать на сайте видео?")].setTitle = "Показать на сайте видео с YouTube?";
  const up = { kind: "fileUpload", setTitle: "Фото для сайта" }; up.getTitle = () => up.setTitle; up.getIndex = () => items.indexOf(up); up.getType = () => "FILE_UPLOAD";
  items.splice(at("Адрес") + 1, 0, up); // Vadim поставил вопрос с фото в «Контакты»
  uiAvailable = true; ctx.updateForm(); uiAvailable = false;
  const msg = alerts[alerts.length - 1];
  ok("прошлая версия: 8 полей отзывов убраны, одно поле «Тексты отзывов» на странице отзывов",
    !items.some((i) => /^Отзыв \d:/.test(i.setTitle)) && at("Тексты отзывов") === at("Отзывы клиентов: тексты") + 1, msg);
  ok("прошлая версия: вопросы о видео и прайсе переименованы (страница «Прайс-лист» не тронута), переходы целы", at("Ссылка на видео") !== -1 && at("Ссылка на видео YouTube") === -1 &&
    at("Цены (прайс-лист)") === at("Прайс-лист: цены") + 1 && items[at("Прайс-лист")].kind === "addPageBreakItem" && gateLinks() === "ok", gateLinks());
  ok("прошлая версия: подписи к фото — сразу после вопроса с фото", at("Подписи к фотографиям") === at("Фото для сайта") + 1, msg);
  ok("прошлая версия: в сообщении названо, что изменено", /убран «Отзыв 1: текст»/.test(msg) && /Подписи к фотографиям» перенесены/.test(msg), msg);
  items.splice(at("Фото для сайта"), 1);
}

// Клиент сначала ответил «Да» и заполнил прайс, потом передумал — «Нет»: ответы блока не берём.
{
  const n = {}; Object.keys(named).forEach((k) => { n[k] = named[k]; });
  const g = ctx.gates()[0];
  n[g.ask] = ["Нет"];
  const a = ctx.answersByKey(n);
  ok("цепочка: при «Нет» ответы блока не попадают на лист", a.pricelist === "" && a.priceLink === "" && ctx.answersByKey(named).pricelist !== "");
}

// Новый проект скрипта в той же таблице (например, код вставили заново): анкета и папка те же.
for (const k of Object.keys(props)) delete props[k];
uiAvailable = true; ctx.setup(); uiAvailable = false;
ok("повторная настройка: вторая форма не создаётся", formsCreated === 1, formsCreated);
ok("повторная настройка: папка «QPage — сайты» та же", driveRoot.folders.filter((f) => f.name === "QPage — сайты").length === 1);
ok("повторная настройка: один триггер на ответы и один на меню", triggers.filter((t) => t.fn === "onFormSubmit").length === 1 && triggers.filter((t) => t.fn === "addMenu").length === 1, triggers.map((t) => t.fn).join());
const saveActive = ctx.SpreadsheetApp.getActiveSpreadsheet;
ctx.SpreadsheetApp.getActiveSpreadsheet = () => null;
for (const k of Object.keys(props)) delete props[k];
let standalone = null; try { ctx.setup(); } catch (e) { standalone = e.message; }
// Как у Vadim: в свойствах осталась удалённая форма от прежнего запуска, а таблица связана с другой.
props.FORM_ID = "OLD_TRASHED"; props.SHEET_ID = "SHEET";
ctx.SpreadsheetApp.getActiveSpreadsheet = saveActive;
ok("отдельный проект (не из таблицы): понятная ошибка, ничего не создано", standalone && standalone.includes("Расширения → Apps Script") && formsCreated === 1, standalone);
let stale = null; uiAvailable = true; try { ctx.setup(); } catch (e) { stale = e.message; } uiAvailable = false;
ok("в свойствах удалённая форма: настройка проходит, берёт связанную", !stale && props.FORM_ID === "FORM" && formsCreated === 1, stale || props.FORM_ID);

// ---------- Публикация на Netlify ----------
const sitesIdx = () => ss.getSheetByName("Сайты").cells.findIndex((r) => r[0] === sheetName);
const sitesRow = () => { const sh = ss.getSheetByName("Сайты"), i = sitesIdx(); return sh.cells[i].map((x, c) => href(sh, i, c)); };
ok("без ключа Netlify: в Netlify ничего не отправляется, колонки пустые", nl.requests.length === 0 && !sitesRow()[7], nl.requests.join());
uiAvailable = true; ctx.addMenu(); uiAvailable = false;
ok("меню: пункт «Подключить Netlify»", ctx.__menu.items.includes("connectNetlify"), JSON.stringify(ctx.__menu.items));
uiAvailable = true; ctx.connectNetlify(); uiAvailable = false;
ok("окно подключения: ссылка на страницу ключей и поле ввода", alerts[alerts.length - 1].includes("personal-access-tokens") && alerts[alerts.length - 1].includes("saveNetlifyToken"));
let badTok = null; try { ctx.saveNetlifyToken("WRONG"); } catch (e) { badTok = e.message; }
ok("неверный ключ: понятная ошибка, не сохранён", badTok && badTok.includes("не принял ключ") && !props.NETLIFY_TOKEN, badTok);
const saved = ctx.saveNetlifyToken("  GOOD \n");
ok("верный ключ: сохранён, ссылка на настройку видимости команды", props.NETLIFY_TOKEN === "GOOD" && saved.includes("teams/vadim-team/settings/general") && saved.includes("Public"), saved);
ok("ссылки: публикация подключена", ctx.links().includes("Публикация на Netlify: подключена"));

nl.taken.add(sheetName); // имя занято чужим сайтом
nl.requests = [];
let pub = ctx.makeSite(ss, sheetName);
const nlSite = Object.values(nl.sites)[0];
ok("публикация: сайт создан, имя занято → добавлен хвост", nlSite && nlSite.name.startsWith(sheetName + "-") && nlSite.name.length === sheetName.length + 6, nlSite && nlSite.name);
ok("публикация: ZIP отправлен, дождались ready", nlSite.deploys.length === 1 && nlSite.deploys[0].state === "ready" && nl.slept >= 1);
ok("публикация: ссылка на сайт и на управление в «Сайты»", sitesRow()[7] === nlSite.ssl_url && sitesRow()[8] === nlSite.admin_url && ss.getSheetByName("Сайты").cells[0][7] === "сайт в интернете", JSON.stringify(sitesRow()));
ok("публикация: распознавание форм включено, форма найдена, лишнего замечания нет", nlSite.processing_settings.ignore_html_forms === false && !sitesRow()[4].includes("Netlify"), sitesRow()[4]);
ok("публикация: сайт на Диске тоже собран", pub.folderUrl && pub.zipUrl && pub.siteUrl === nlSite.ssl_url);
{
  // Адрес сайта известен до сборки: карта сайта, robots.txt и canonical указывают на него.
  const dir = sitesRoot.folders.find((f) => f.name === sheetName && !f.trashed);
  const text = (n) => { const f = dir.files.find((x) => x.name === n); return f ? String(f.blob.data) : ""; };
  const html = text("index.html");
  if (nMedia) ok("логотип: размер прочитан из файла (страница не «прыгает»)", /<img class="brand-logo" src="assets\/img\/logo\.png" alt="" width="\d+" height="\d+"/.test(html) && !/width="40" height="40" data-logo/.test(html), (html.match(/<img class="brand-logo"[^>]*>/) || [])[0]);
  ok("SEO: sitemap.xml и robots.txt с адресом сайта Netlify", text("sitemap.xml").includes("<loc>" + nlSite.ssl_url + "/</loc>") && text("robots.txt").includes("Sitemap: " + nlSite.ssl_url + "/sitemap.xml"), text("robots.txt"));
  ok("SEO: canonical, og:url и JSON-LD с адресом сайта", html.includes('<link rel="canonical" href="' + nlSite.ssl_url + '/">') && html.includes('property="og:url"') && html.includes('"@type":"LocalBusiness"'), html.slice(0, 1500));
}
const fresh = () => { delete props["NETLIFY_HASH:" + sheetName]; }; // будто в анкете что-то поменяли
ctx.makeSite(ss, sheetName);
ok("пересборка без изменений: на Netlify не выкладываем (экономим кредиты), ссылка на месте", nlSite.deploys.length === 1 && sitesRow()[4].includes("сайт не изменился") && sitesRow()[7] === nlSite.ssl_url, sitesRow()[4]);
fresh();
uiAvailable = true; ss.active = ss.getSheetByName(sheetName); ctx.makeSiteFromActiveSheet(); uiAvailable = false;
ok("пересборка с изменениями: тот же сайт Netlify, новая версия", Object.keys(nl.sites).length === 1 && nlSite.deploys.length === 2);
ok("окно «Сайт готов»: ссылка на сайт в интернете", alerts[alerts.length - 1].startsWith('<div style="font:14px/1.5 Arial,sans-serif;word-break:break-all">Сайт в интернете: <a href="' + nlSite.ssl_url + '"') && !alerts[alerts.length - 1].includes("ZIP для Netlify Drop"), alerts[alerts.length - 1]);

nl.visibility = 302; // команда Netlify делает новые сайты закрытыми
fresh(); ctx.makeSite(ss, sheetName);
ok("сайт закрыт входом Netlify: замечание с путём настройки", sitesRow()[4].includes("закрыт для посетителей") && sitesRow()[4].includes("Visitor access"), sitesRow()[4]);
nl.visibility = 200;

// Строка прежней версии с длинными адресами — превращается в короткие ссылки.
{
  const sh = ss.getSheetByName("Сайты"), n = sh.cells.length;
  sh.cells.push(["old-site", "", "https://drive.google.com/drive/folders/X", "https://drive.google.com/file/d/Y/view", "", "", "", "https://old-site.netlify.app", ""]);
  ctx.sitesSheet(ss);
  ok("«Сайты»: старые длинные адреса стали короткими ссылками", sh.cells[n][2] === "Папка" && sh.cells[n][3] === "ZIP" && sh.cells[n][7] === "Открыть сайт" &&
    href(sh, n, 7) === "https://old-site.netlify.app" && sh.cells[n][8] === "", JSON.stringify(sh.cells[n]));
  sh.cells.splice(n, 1); sh.links.splice(n, 1);
}

nl.failDeploy = true;
fresh(); pub = ctx.makeSite(ss, sheetName);
ok("сбой Netlify: сайт на Диске собран, причина в «проверить»", pub.zipUrl && !pub.siteUrl && sitesRow()[4].startsWith("Сайт не опубликован: Netlify ответил 500") && sitesRow()[7] === "не опубликован", sitesRow()[4]);
nl.failDeploy = "credit";
fresh(); pub = ctx.makeSite(ss, sheetName);
ok("кончились кредиты Netlify: коротко первой строкой", pub.pubError === "кончились кредиты Netlify" && sitesRow()[4].split("\n")[0] === "Сайт не опубликован: кончились кредиты Netlify" && sitesRow()[7] === "не опубликован", sitesRow()[4]);
nl.failDeploy = false;

delete nl.sites[nlSite.id]; // сайт удалили в Netlify руками
ctx.makeSite(ss, sheetName);
const reSite = Object.values(nl.sites)[0];
ok("сайт удалён в Netlify: создаётся заново", reSite && reSite.id !== nlSite.id && props["NETLIFY_SITE:" + sheetName] === reSite.id && sitesRow()[7] === reSite.ssl_url);

// Письма о заявках: на почту клиента; без почты (заявки в WhatsApp) — писем нет.
{
  const sh = ss.getSheetByName(sheetName);
  const setVal = (key, val) => { sh.cells.find((r) => r[0] === key)[2] = val; };
  const mail = () => (nl.hooks || []).filter((h) => h.site_id === reSite.id && h.type === "email" && h.event === "submission_created").map((h) => h.data.email);
  ok("заявки без почты: писем Netlify нет", mail().length === 0, JSON.stringify(nl.hooks));
  setVal("email", "client@example.com"); ctx.makeSite(ss, sheetName);
  ok("заявки: письмо о заявке на почту клиента", JSON.stringify(mail()) === '["client@example.com"]', JSON.stringify(mail()));
  ctx.makeSite(ss, sheetName);
  ok("пересборка: второе письмо не добавилось", mail().length === 1, JSON.stringify(mail()));
  setVal("email", "new@example.com"); ctx.makeSite(ss, sheetName);
  ok("клиент сменил почту: письма только на новую", JSON.stringify(mail()) === '["new@example.com"]', JSON.stringify(mail()));
  setVal("email", ""); ctx.makeSite(ss, sheetName);
  ok("почту убрали: писем больше нет", mail().length === 0, JSON.stringify(mail()));
}

nl.formsDetect = false; reSite.forms = [];
fresh(); ctx.makeSite(ss, sheetName);
ok("форма не распозналась: замечание, как включить", sitesRow()[4].includes("форма заявки не найдена"), sitesRow()[4]);
nl.formsDetect = true;

nl.pollsBeforeReady = 1000; nl.slept = 0;
fresh(); ctx.makeSite(ss, sheetName);
ok("долгая публикация: ждём не дольше 90 секунд, ссылка всё равно в «Сайты»", nl.slept === 30 && sitesRow()[4].includes("публикация ещё идёт") && sitesRow()[7] === reSite.ssl_url, nl.slept + " " + sitesRow()[4]);
nl.pollsBeforeReady = 2;

props.NETLIFY_TOKEN = "EXPIRED";
ctx.makeSite(ss, sheetName);
ok("ключ отозван: подсказка переподключить", sitesRow()[4].includes("Подключить Netlify"), sitesRow()[4]);
ctx.saveNetlifyToken("");
ok("пустой ключ: публикация отключена", !props.NETLIFY_TOKEN);

ss.active = ss.getSheetByName(sheetName); lk.released = 0; uiAvailable = true;
const nAlerts = alerts.length;
ctx.makeSiteFromActiveSheet();
ok("очередь: «Сделать сайт из этого листа» тоже через блокировку, окно «Сайт готов»", lk.released === 1 && !lk.held && alerts.length === nAlerts + 1 && alerts[alerts.length - 1].includes("Сайт"), JSON.stringify(lk));
lk.busy = true;
const sheetsBefore = ss.sheets.length;
let lockErr = null;
try { ctx.onFormSubmit({ namedValues: named }); } catch (e) { lockErr = e.message; }
ok("очередь: другой сайт собирается слишком долго — понятная ошибка, ничего не тронуто", lockErr && lockErr.includes("Обработать последний ответ заново") && ss.sheets.length === sheetsBefore, lockErr);
lk.busy = false;

fs.writeFileSync(outFile, JSON.stringify(site, null, 1));
// Сжатие тяжёлых фото: отдельные случаи.
{
  const pad = (file, n) => Buffer.concat([fs.readFileSync(path.join(__dirname, "sample/media", file)), Buffer.alloc(n)]);
  const dir = ctx.mediaFolder("szhatie");
  const add = (name, data, type) => { const f = driveFile(name, data, type); allFiles[f.id] = f; dir.files.push(f); return f; };
  const big = add("photo-01-big.jpg", pad("photo1.jpg", 2000000), "image/jpeg");
  const logo = add("logo.png", pad("logo.png", 500000), "image/png");
  gd.got = []; gd.fresh.add(big.id); gd.fresh.add(logo.id);
  let m = ctx.collectMedia("szhatie");
  const small = dir.folders.find((f) => f.name === "для сайта (сжатые)");
  ok("сжатие: фото 2 МБ → JPG до 1600 точек, в сайт идёт копия", m.photos.length === 1 && m.photos[0].file !== big && m.photos[0].file.getSize() === thumbJpg.length && m.photos[0].path === "assets/img/photo-1.jpg" && gd.got.includes(big.id + "@1600") && !m.notes.some((n) => n.includes("большой")), JSON.stringify({ got: gd.got, notes: m.notes }));
  ok("сжатие: прозрачный PNG-логотип не превращается в JPG, остаётся оригинал", m.logo && m.logo.file === logo && m.logo.path === "assets/img/logo.png" && gd.got.includes(logo.id + "@800"), JSON.stringify(gd.got));
  const n = gd.got.length, firstCopy = m.photos[0].file;
  m = ctx.collectMedia("szhatie");
  ok("сжатие: при пересборке готовая копия берётся из папки, Диск заново не спрашиваем", gd.got.length === n && m.photos[0].file === firstCopy && small.files.length === 1, JSON.stringify({ got: gd.got, files: small.files.map((f) => f.name) }));
  gd.off = true;
  const heic = add("photo-02-IMG.HEIC", pad("IMG_0004.HEIC", 10), "image/heif");
  const big2 = add("photo-03-big2.jpg", pad("photo3.jpg", 2000000), "image/jpeg");
  const slept = nl.slept;
  m = ctx.collectMedia("szhatie");
  ok("сжатие: Диск не дал миниатюру — HEIC пропущен с понятным замечанием, тяжёлое фото идёт оригиналом", m.photos.length === 2 && m.photos[1].file === big2 &&
    m.notes.some((x) => x.includes("HEIC") && x.includes("photo-02-IMG.HEIC")) && m.notes.some((x) => x.includes("большой файл") && x.includes("big2")) && nl.slept - slept >= 10, JSON.stringify({ notes: m.notes, slept: nl.slept - slept }));
  gd.off = false;
}

// Версии внешнего вида: тот же лист, разный вид → порядок блоков, меню, фон первого экрана.
{
  const rows = ss.getSheetByName(sheetName).getDataRange().getDisplayValues();
  const make = (design, story) => {
    const fields = ctx.QPageCore.rowsToFields(rows);
    fields.design = { value: design };
    if (story) fields.story = { value: "", ru: "Абзац один.\nАбзац два.", he: "פסקה.\nפסקה.", en: "One.\nTwo." };
    return ctx.QPageCore.siteFiles(fields, ctx.TEMPLATE_FILES, ctx.TEMPLATE_TEXT, "vid", { photos: ["assets/img/photo-1.jpg", "assets/img/photo-2.jpg", "assets/img/photo-3.jpg"] });
  };
  const ids = (html) => (html.match(/<section\b[^>]*\sid="(\w+)"/g) || []).map((x) => x.match(/id="(\w+)"/)[1]);
  const shown = (html) => (html.match(/<section\b[^>]*>/g) || []).filter((t) => !/\shidden/.test(t)).map((x) => (x.match(/id="(\w+)"/) || [])[1]);
  const nav = (html) => (html.match(/<nav class="site-nav"[\s\S]*?<\/nav>/)[0].match(/href="#(\w+)"/g) || []).map((x) => x.slice(7, -1));
  const tpl = ids(ctx.TEMPLATE_FILES["index.html"]);
  const c = make(""), v = make("Фото-витрина"), st = make("Текстовый блок", true), cs = make("Классический вариант", true);
  ok("вид: старые ответы («Витрина — …», «Строгий — …», «Классика — …») тоже понимаются",
    ["Витрина — крупные фото", "Строгий — спокойный", "Классика — для мастеров"].map((x) => make(x).data.site.design).join() === "showcase,strict,classic");
  const ci = c.files["index.html"], vi = v.files["index.html"], si = st.files["index.html"];
  // Первый экран одинаковый: без «Главного фото» крупно — 1-е фото работ, в заливке фото нет.
  const heroOk = (h) => !h.includes("hero-bg") && /<p class="hero-tagline"[^>]*>[^<]+<\/p>\s*<div class="hero-photo-box"><img class="hero-photo-bg" src="assets\/img\/photo-1\.jpg" alt="" aria-hidden="true"><img class="hero-photo" src="assets\/img\/photo-1\.jpg" alt="[^"]+"[^>]*><\/div>\s*<\/div>\s*<\/section>/.test(h);
  ok("вид: пусто → Классика, порядок блоков как в шаблоне",
    c.data.site.design === "classic" && ci.includes('data-design="classic"') && ids(ci).join() === tpl.join(), ids(ci).join());
  ok("вид: первый экран одинаковый во всех видах (1-е фото работ крупно под кнопками)", [ci, vi, si].every(heroOk));
  ok("вид: «Фото-витрина» → showcase, мозаика фото сразу после первого экрана",
    v.data.site.design === "showcase" && vi.includes('data-design="showcase"') && shown(vi).slice(0, 3).join() === "top,gallery,about", shown(vi).join());
  ok("вид: «Текстовый блок» → strict, главный текст сразу после первого экрана, дальше как в Классике",
    st.data.site.design === "strict" && shown(si).slice(0, 3).join() === "top,story,about" && /id="story-text">\s*<p>Абзац один\.<\/p><p>Абзац два\.<\/p>/.test(si) &&
    shown(si).slice(2).join() === shown(ci).slice(1).join(), shown(si).join() + " | " + shown(ci).join());
  ok("вид: главный текст — только в «Строгом»", !shown(cs.files["index.html"]).includes("story") && !shown(ci).includes("story"));
  ok("вид: меню в том же порядке, что блоки",
    [si, vi].every((h) => nav(h).join() === ids(h).filter((x) => nav(h).includes(x)).join()), nav(si).join() + " | " + nav(vi).join());
  ok("вид: блоки не потерялись при перестановке", [vi, si].every((h) => ids(h).slice().sort().join() === tpl.slice().sort().join() && h.length > ci.length - 2000), [vi, si, ci].map((h) => h.length).join());
  const nf = ctx.QPageCore.siteFiles(ctx.QPageCore.rowsToFields(rows), ctx.TEMPLATE_FILES, ctx.TEMPLATE_TEXT, "vid", { photos: [], portrait: "assets/img/portrait.jpg" }).files["index.html"];
  ok("без фото: фото владельца — в цветной заливке, предложение — под кнопками, крупного фото нет", ((h) => /<div class="hero-banner">\s*<div class="container">\s*<img class="hero-portrait"/.test(h) && /class="hero-actions">[\s\S]*?<\/div>\s*<\/div>\s*<p class="hero-tagline"[^>]*>[^<]+<\/p>/.test(h) &&
      !h.includes("hero-photo"))(nf),
    (nf.match(/<section class="hero[\s\S]*?<\/section>/) || [""])[0]);
  ok("вид: длинное главное предложение → предупреждение", (() => {
    const fields = ctx.QPageCore.rowsToFields(rows);
    fields.tagline = Object.assign({}, fields.tagline, { value: "x".repeat(401), ru: "x".repeat(401) });
    return ctx.QPageCore.siteFiles(fields, ctx.TEMPLATE_FILES, ctx.TEMPLATE_TEXT, "vid", { photos: [] }).notes.some((w) => /главное предложение длиннее 400/.test(w));
  })());
  const softs = (html) => (html.match(/<section\b[^>]*>/g) || []).filter((t) => /class="section/.test(t) && !/\shidden/.test(t)).map((t) => /section-soft/.test(t) ? 1 : 0).join("");
  ok("вид: фон видимых блоков чередуется (белый, серый, …)", [ci, vi, si].every((h) => /^(01)*0?$/.test(softs(h))), [ci, vi, si].map(softs).join(" | "));
  ok("вид: строка «внешний вид» в листе клиента", rows.some((r) => r[0] === "design" && /^акцент: Фото-витрина \/ Текстовый блок \/ Классический вариант$/.test(r[1])), JSON.stringify(rows.find((r) => r[0] === "design")));
}

checks.forEach((c) => console.log((c.pass ? "PASS " : "FAIL ") + c.name + (c.pass ? "" : "  -> " + c.info)));
console.log(`\n${checks.filter((c) => c.pass).length}/${checks.length} passed`);
console.log("Окно после setup():\n" + alerts[0]);
process.exit(checks.every((c) => c.pass) ? 0 : 1);
