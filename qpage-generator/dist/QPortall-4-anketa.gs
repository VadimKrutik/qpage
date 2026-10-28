// ===================== Анкета QPortall, код (собрано build-gs.js 2026-10-28) =====================
/*
 * Своя анкета QPortall — вторая точка входа рядом с Google Формой (форма остаётся запасной).
 *
 *  - Страница анкеты лежит на Netlify (сайт qportall-anketa). Её выкладывает «QPortall → Опубликовать анкету QPortall»:
 *    вопросы берутся из questions() (Code.gs), фоны — с листа «Фоны анкеты» (дизайн N = строка N, ссылка …/?d=N).
 *  - Страница отправляет ответы в веб-приложение этого скрипта (doPost). doPost только проверяет и складывает:
 *    файлы — в папку «Анкеты — входящие» на Диске, ответы — строкой на лист «Анкеты QPortall», и ставит разовый
 *    триггер processAnketas. Сайт собирает processAnketas: триггер всегда работает на последней сохранённой версии
 *    кода, а веб-приложение — на версии своего развертывания.
 *  - Новая анкета → обычный лист клиента и сайт (buildSiteSheet + makeSite, как из Google Формы).
 *    Исправление по личной ссылке (?edit=<ключ>) → тот же лист и тот же сайт; строки, ответ на которые не менялся,
 *    остаются как есть (с правками владельца).
 *  - Защита: длинный секретный ключ у каждого клиента, лимит правок (лист «Сайты», колонка «лимит правок»),
 *    лимит новых анкет в день и выключатель (лист «Настройки анкеты»), ловушка для роботов и проверка времени заполнения.
 */

var ANKETA_SHEET = "Анкеты QPortall";
var ANKETA_HEADER = ["ключ", "лист", "создана", "изменена", "правок использовано", "статус", "дизайн анкеты",
  "ответы", "ответы, по которым собран сайт", "новые файлы", "канал"];
var ANKETA_COL = { key: 1, tab: 2, created: 3, changed: 4, edits: 5, status: 6, group: 7, answers: 8, built: 9, files: 10, channel: 11 };
var ANKETA_SETTINGS_SHEET = "Настройки анкеты";
var ANKETA_SETTINGS = [
  { key: "open", label: "Анкета принимает ответы (Да / Нет)", value: "Да" },
  { key: "perDay", label: "Новых анкет в день, не больше", value: "20" },
  { key: "edits", label: "Правок по умолчанию (для каждого клиента)", value: "3" }
];
var BG_SHEET = "Фоны анкеты";
// Дизайн анкеты N = строка N этого листа (ссылка …/?d=N). Номер скрипт пишет сам.
var BG_SHEET_HEADER = ["№", "картинка: ссылка на файл в Google Диске (или «встроенный фон 1–5»)", "что на картинке", "кому подходит", "цвет кнопок (можно пусто), например #0b6e69", "ссылка на анкету"];
var BG = { num: 1, pic: 2, about: 3, who: 4, color: 5, link: 6 };
var ANKETA_SITE = "qportall-anketa";
// Первые фоны (лист «Фоны анкеты» создаётся с ними): картинка | что на картинке | кому подходит | цвет кнопок.
// «встроенный фон N» — картинка из самой анкеты (папка anketa/bg); свои фоны — ссылкой на картинку в Google Диске.
var BG_DEFAULTS = [
  ["встроенный фон 1", "Тёплый светлый фон, мягкие волны", "Всем, универсальный", ""],
  ["встроенный фон 2", "Тёмно-синий, тонкие линии, золотистая рамка", "Строгое: юристы, нотариусы, бухгалтеры, финансы", "#1f2a44"],
  ["встроенный фон 3", "Яркие розовые, оранжевые и фиолетовые пятна", "Яркое: брови, ногти, красота, праздники, дети", "#c2185b"],
  ["встроенный фон 4", "Синий чертёж: сетка, шестерёнка, схема", "Техника: сантехники, электрики, ремонт, IT", "#0e5a9c"],
  ["встроенный фон 5", "Светлая мята, мягкие пятна, маленькие крестики", "Спокойное, светлое: медицина, психологи, массаж", "#1f7a72"]
];
// Колонки листа «Сайты» после колонок makeSite (Code.gs, SITES_HEADER).
var SITES_EXTRA = ["анкета: исправить", "правок использовано", "лимит правок", "канал", "оплачено"];
// Каналы рекламы: канал N = строка N листа «Каналы» (ссылка …/?r=N). Номер канала запоминается с анкетой навсегда
// (исправления его не меняют) и попадает на «Сайты» в колонку «канал». Счётчики на листе «Каналы» — формулы.
var CH_SHEET = "Каналы";
var CH_HEADER = ["№", "канал (где реклама)", "номер фона с листа «Фоны анкеты» (можно пусто)", "ссылка на анкету", "анкет пришло", "сайтов оплачено"];
var CH = { num: 1, name: 2, bg: 3, link: 4, count: 5, paid: 6 };
var CH_DEFAULTS = [["Пример: Instagram (переименуйте)", ""]];
var STATUS_WAIT = "ждёт сборки", STATUS_BUSY = "собирается", STATUS_DONE = "готово", STATUS_ERR = "ошибка";
var ANKETA_MIN_MS = 20000;                 // быстрее робот, человек так анкету не заполнит
var ANKETA_FILE_MAX = 8 * 1024 * 1024;     // байт на файл
var ANKETA_FILES = { logo: 1, main: 1, portrait: 1, photos: 12, docs: 8 };
// Ограничения текстов (защита от спама): [ключ вопроса, знаков, строк, знаков в строке]. Остальные: строка 300, абзац 2000.
var ANKETA_LIMITS = [
  [/^(name|nameHe|nameEn)$/, 80], [/^kind$/, 120], [/^tagline$/, 150], [/^facts$/, 150, 3, 40], [/^about$/, 1500],
  [/^story$/, 3000], [/^legal$/, 200], [/^address$/, 200], [/^areas$/, 300], [/^telegram$/, 40],
  [/^service\d+Name$/, 60], [/^service\d+Text$/, 300], [/^faq\d+Q$/, 200], [/^faq\d+A$/, 1000],
  [/^pricelist$/, 3000, 40, 120], [/^reviews$/, 3000, 8, 400], [/^steps$/, 1200, 8, 150], [/^license$/, 1000, 10],
  [/^captions$/, 2000, 12, 120]
];
// Ссылки в текстах не принимаем (реклама спамеров попала бы на сайт). Можно только в полях-ссылках и почте.
var ANKETA_LINK_RE = "(https?:|www\\.|\\b[a-z0-9-]+\\.(com|net|org|ru|info|io|co|il|biz|xyz|top|me|ly|site|online|shop|app|link|click|ua|by|kz|de|uk|us|cc|tk|ml|ga|gq|cf)\\b)";

function anketaLimitOf(q) {
  for (var i = 0; i < ANKETA_LIMITS.length; i++) {
    var r = ANKETA_LIMITS[i];
    if (r[0].test(q.key)) return { max: r[1], lines: r[2] || 0, lineMax: r[3] || 0 };
  }
  return { max: q.type === "paragraph" ? 2000 : 300, lines: 0, lineMax: 0 };
}

var ANKETA_UPLOAD_TITLE = { logo: UPLOAD_LOGO, main: UPLOAD_MAIN, portrait: UPLOAD_PORTRAIT, photos: UPLOAD_PHOTOS, docs: UPLOAD_DOCS };

// Раздел «QPortall → Инструкция» про анкету (добавляется в конец окна, см. showHelp в Code.gs).
var ANKETA_HELP = [
  "<h3>Своя анкета QPortall</h3><ol>",
  "<li>Ссылка для клиентов — <b>QPortall → Ссылки</b>. Google Форма остаётся запасной и работает как раньше.</li>",
  "<li>Анкета с другим фоном: лист <b>«Фоны анкеты»</b>, дизайн N = строка N (ссылка …/?d=N). Свой фон — ссылка на картинку в Google Диске; ",
  "после изменения листа — <b>QPortall → Опубликовать анкету QPortall</b>.</li>",
  "<li>Ответы — лист <b>«Анкеты QPortall»</b> (статус сборки). «ошибка» — <b>QPortall → Анкеты QPortall: собрать ещё раз</b>.</li>",
  "<li>Правки клиента: на «Сайты» ссылка <b>Исправить анкету</b> (её можно переслать клиенту), сколько правок использовано, ",
  "<b>лимит правок</b> (впишите своё число). Число по умолчанию, лимит новых анкет в день и выключатель — лист <b>«Настройки анкеты»</b>.</li>",
  "<li>Каналы рекламы: лист <b>«Каналы»</b>, канал N = строка N (ссылка …/?r=N, фон — номер с листа «Фоны анкеты»). ",
  "Новую строку — <b>Опубликовать анкету QPortall</b> (появятся номер, ссылка и счётчики). Оплату отмечайте на «Сайты» в колонке <b>«оплачено»</b>: Да.</li>",
  "<li>Если менялся файл <b>QPortall-4-anketa.gs</b> (приём анкет): Apps Script → <b>Начать развертывание → Управление развертываниями</b> → карандаш → ",
  "Версия: <b>Новая версия</b> → <b>Начать развертывание</b> (адрес не меняется), затем <b>Опубликовать анкету QPortall</b>.</li></ol>"
].join("");

// ---------- Приём анкеты (веб-приложение) ----------

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: "bad" }); }
  try { return json(anketaSubmit(req)); }
  catch (err) { Logger.log(err.stack || err); return json({ ok: false, error: "server" }); }
}

function anketaSs() {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SHEET_ID"));
}

function anketaSubmit(req) {
  var ss = anketaSs();
  var set = anketaSettings(ss);
  if (!/^да$/i.test(String(set.open).trim())) return { ok: false, error: "closed" };
  if (req.hp) return { ok: false, error: "bot" };
  var edit = String(req.edit || "");
  if (!edit && !(Number(req.t) >= ANKETA_MIN_MS)) return { ok: false, error: "fast" };
  var answers = anketaClean(req.answers);
  if (answers.__links) return { ok: false, error: "links" };
  if (!edit && (!answers.name || !answers.phone)) return { ok: false, error: "bad" };
  // Свой замок, не общий скриптовый: тот держит сборка сайта (минуты), а приём анкеты ждать не должен.
  var lock = LockService.getUserLock();
  if (!lock.tryLock(30000)) return { ok: false, error: "busy" };
  try {
    var sh = anketaSheet(ss);
    var now = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "dd.MM.yyyy HH:mm");
    var row, key, used = 0, limit = 0, files;
    if (edit) {
      row = anketaRow(sh, edit);
      if (!row) return { ok: false, error: "key" };
      var vals = sh.getRange(row, 1, 1, ANKETA_HEADER.length).getDisplayValues()[0];
      key = edit;
      used = Number(vals[ANKETA_COL.edits - 1]) || 0;
      limit = anketaLimit(ss, vals[ANKETA_COL.tab - 1], set);
      if (used >= limit) return { ok: false, error: "edits", editsLeft: 0 };
      files = anketaSaveFiles(req.files, key, anketaJson(vals[ANKETA_COL.files - 1]) || {});
      files.remove = (files.remove || []).concat(anketaIds(req.remove));
      sh.getRange(row, ANKETA_COL.changed, 1, 1).setValues([[now]]);
      sh.getRange(row, ANKETA_COL.edits, 1, 1).setValues([[String(used + 1)]]);
      sh.getRange(row, ANKETA_COL.status, 1, 1).setValues([[STATUS_WAIT]]);
      sh.getRange(row, ANKETA_COL.answers, 1, 1).setValues([[JSON.stringify(answers)]]);
      sh.getRange(row, ANKETA_COL.files, 1, 1).setValues([[JSON.stringify(files)]]);
      used++;
    } else {
      var props = PropertiesService.getScriptProperties();
      var day = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");
      var count = String(props.getProperty("ANKETA_DAY") || "").split("|");
      var n = count[0] === day ? Number(count[1]) || 0 : 0;
      if (n >= (Number(set.perDay) || 0)) { anketaLimitMail(props, day, set.perDay); return { ok: false, error: "limit" }; }
      props.setProperty("ANKETA_DAY", day + "|" + (n + 1));
      key = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "").slice(0, 8);
      files = anketaSaveFiles(req.files, key, {});
      limit = Number(set.edits) || 0;
      var group = String(req.design || "").replace(/\D/g, "").slice(0, 4);
      var channel = String(req.ref || "").replace(/\D/g, "").slice(0, 4);
      row = sh.getLastRow() + 1;
      var line = [];
      line[ANKETA_COL.key - 1] = key; line[ANKETA_COL.tab - 1] = ""; line[ANKETA_COL.created - 1] = now; line[ANKETA_COL.changed - 1] = "";
      line[ANKETA_COL.edits - 1] = "0"; line[ANKETA_COL.status - 1] = STATUS_WAIT; line[ANKETA_COL.group - 1] = group;
      line[ANKETA_COL.answers - 1] = JSON.stringify(answers); line[ANKETA_COL.built - 1] = ""; line[ANKETA_COL.files - 1] = JSON.stringify(files);
      line[ANKETA_COL.channel - 1] = channel;
      sh.getRange(row, 1, 1, line.length).setNumberFormat("@").setValues([line]);
    }
    anketaSchedule(5000);
    return { ok: true, key: key, editsLeft: Math.max(0, limit - used) };
  } finally { lock.releaseLock(); }
}

// Лимит новых анкет за день исчерпан — одно письмо владельцу в день, чтобы потолок не забылся.
function anketaLimitMail(props, day, perDay) {
  if (props.getProperty("ANKETA_DAY_MAIL") === day) return;
  props.setProperty("ANKETA_DAY_MAIL", day);
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), "QPortall: сегодня достигнут лимит анкет (" + perDay + ")",
      "Сегодня пришло " + perDay + " новых анкет — это лимит. Следующие люди видят «Сегодня анкет очень много. Попробуйте завтра».\n\n" +
      "Поднять лимит: таблица «QPage — анкеты», лист «" + ANKETA_SETTINGS_SHEET + "», строка «Новых анкет в день».\n" +
      "Таблица: " + anketaSs().getUrl());
  } catch (e) { Logger.log("письмо о лимите: " + e); }
}

// Ответы страницы: только известные вопросы, только текст (у вопросов с галочками — список).
// Длинное обрезается по ANKETA_LIMITS; ссылка в тексте — out.__links (анкету не принимаем).
function anketaClean(src) {
  var out = {}, link = new RegExp(ANKETA_LINK_RE, "i");
  src = src && typeof src === "object" ? src : {};
  questions().forEach(function (q) {
    if (!q.key || src[q.key] == null) return;
    var v = src[q.key];
    if (Array.isArray(v)) { out[q.key] = v.slice(0, 20).map(function (x) { return String(x).slice(0, 200); }); return; }
    var lim = anketaLimitOf(q);
    var t = String(v).slice(0, lim.max);
    if (lim.lines) t = t.split("\n").slice(0, lim.lines).join("\n");
    if (q.validate !== "url" && q.validate !== "email" && link.test(t)) out.__links = true;
    out[q.key] = t;
  });
  return out;
}

function anketaIds(list) {
  return (Array.isArray(list) ? list : []).map(String).filter(function (id) { return /^[\w-]{1,100}$/.test(id); }).slice(0, 40);
}

// Файлы страницы ({ name, type, data: base64 }) → во «входящие» на Диске. Возвращает список id по видам,
// добавляя к уже ждущим (если клиент исправил анкету ещё раз до сборки).
function anketaSaveFiles(files, key, have) {
  var out = { logo: have.logo || [], main: have.main || [], portrait: have.portrait || [], photos: have.photos || [], docs: have.docs || [], remove: have.remove || [] };
  if (!files || typeof files !== "object") return out;
  var folder = null;
  Object.keys(ANKETA_FILES).forEach(function (kind) {
    var list = files[kind];
    if (!list) return;
    if (!Array.isArray(list)) list = [list];
    list.slice(0, ANKETA_FILES[kind]).forEach(function (f, i) {
      if (!f || typeof f.data !== "string") return;
      var type = String(f.type || "");
      var name = String(f.name || kind).replace(/[\\\/:*?"<>|]+/g, "_").slice(-80);
      if (!/^image\//.test(type) && !/\.(jpe?g|png|webp|gif|hei[cf]|svg)$/i.test(name)) return;
      var bytes = Utilities.base64Decode(f.data);
      if (!bytes.length || bytes.length > ANKETA_FILE_MAX) return;
      if (!folder) folder = anketaInbox(key);
      var id = folder.createFile(Utilities.newBlob(bytes, type || "application/octet-stream", name)).getId();
      if (ANKETA_FILES[kind] === 1) out[kind] = [id]; else out[kind].push(id);
    });
    if (ANKETA_FILES[kind] > 1) out[kind] = out[kind].slice(0, ANKETA_FILES[kind]);
  });
  return out;
}

function anketaInbox(key) {
  var root = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty("FOLDER_ID"));
  var it = root.getFoldersByName("Анкеты — входящие");
  var inbox = it.hasNext() ? it.next() : root.createFolder("Анкеты — входящие");
  var sub = inbox.getFoldersByName(key.slice(0, 12));
  return sub.hasNext() ? sub.next() : inbox.createFolder(key.slice(0, 12));
}

function anketaSchedule(ms) {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === "processAnketas"; });
  if (!has) ScriptApp.newTrigger("processAnketas").timeBased().after(ms).create();
}

// ---------- Открыть анкету по личной ссылке (doGet ?anketa=load&edit=<ключ>) ----------

function anketaLoad(p) {
  var ss = anketaSs();
  var sh = anketaSheet(ss);
  var row = anketaRow(sh, String(p.edit || ""));
  if (!row) return { ok: false, error: "key" };
  var vals = sh.getRange(row, 1, 1, ANKETA_HEADER.length).getDisplayValues()[0];
  var set = anketaSettings(ss);
  var tab = vals[ANKETA_COL.tab - 1];
  var used = Number(vals[ANKETA_COL.edits - 1]) || 0;
  var media = [];
  if (tab) {
    var files = [], it = mediaFolder(tab).getFiles();
    while (it.hasNext()) files.push(it.next());
    files.sort(function (a, b) { return a.getName() < b.getName() ? -1 : 1; });
    files.forEach(function (f) {
      var n = f.getName();
      var kind = /^logo\./i.test(n) ? "logo" : /^main\./i.test(n) ? "main" : /^portrait\./i.test(n) ? "portrait" : /^doc-/i.test(n) ? "docs" : "photos";
      media.push({ id: f.getId(), kind: kind, name: n, thumb: anketaThumb(f) });
    });
  }
  return { ok: true, answers: anketaJson(vals[ANKETA_COL.answers - 1]) || {}, media: media, group: vals[ANKETA_COL.group - 1],
    editsLeft: Math.max(0, anketaLimit(ss, tab, set) - used), status: vals[ANKETA_COL.status - 1] };
}

// Маленькая картинка для страницы (data:…): небольшой файл как есть, иначе миниатюра Диска (одна попытка).
function anketaThumb(f) {
  try {
    var type = f.getMimeType();
    if (f.getSize() <= 200000 && /^image\/(jpeg|png|webp|gif)$/.test(type)) return "data:" + type + ";base64," + Utilities.base64Encode(f.getBlob().getBytes());
    var auth = { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
    var meta = UrlFetchApp.fetch("https://www.googleapis.com/drive/v3/files/" + f.getId() + "?fields=thumbnailLink", auth);
    var link = meta.getResponseCode() === 200 && JSON.parse(meta.getContentText()).thumbnailLink;
    if (!link) return "";
    var res = UrlFetchApp.fetch(link.replace(/=s\d+[^=\/]*$/, "") + "=s400", auth);
    if (res.getResponseCode() !== 200) return "";
    var b = res.getBlob();
    return "data:" + b.getContentType() + ";base64," + Utilities.base64Encode(b.getBytes());
  } catch (e) { Logger.log("thumb: " + e); return ""; }
}

// ---------- Сборка сайтов по анкетам (разовый триггер) ----------

function processAnketas() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "processAnketas") ScriptApp.deleteTrigger(t); });
  var ss = anketaSs();
  var sh = anketaSheet(ss);
  var start = Date.now();
  var vals = sh.getDataRange().getDisplayValues();
  for (var i = 1; i < vals.length; i++) {
    if (vals[i][ANKETA_COL.status - 1] !== STATUS_WAIT) continue;
    // Сборка сайта занимает 1–2 минуты, а запуск скрипта ограничен 6 минутами: остальное — следующим запуском.
    if (Date.now() - start > 210000) { anketaSchedule(1000); return; }
    anketaBuild(ss, sh, i + 1);
  }
}

function anketaBuild(ss, sh, row) {
  var cell = function (c) { return sh.getRange(row, c, 1, 1); };
  var vals = sh.getRange(row, 1, 1, ANKETA_HEADER.length).getDisplayValues()[0];
  var key = vals[ANKETA_COL.key - 1], tab = vals[ANKETA_COL.tab - 1];
  var answers = anketaJson(vals[ANKETA_COL.answers - 1]) || {};
  var files = anketaJson(vals[ANKETA_COL.files - 1]) || {};
  cell(ANKETA_COL.status).setValues([[STATUS_BUSY]]);
  var r;
  try {
    withLock(function () {
      if (!tab || !ss.getSheetByName(tab)) {
        tab = buildSiteSheet(ss, anketaNamed(answers, files));
        cell(ANKETA_COL.tab).setValues([[tab]]);
      } else {
        anketaUpdateSheet(ss.getSheetByName(tab), answers, anketaJson(vals[ANKETA_COL.built - 1]) || {});
        anketaUpdateMedia(tab, files);
      }
      cell(ANKETA_COL.built).setValues([[JSON.stringify(answers)]]);
      cell(ANKETA_COL.files).setValues([[""]]);
      r = makeSite(ss, tab);
      anketaSitesRow(ss, tab, key, vals[ANKETA_COL.edits - 1], vals[ANKETA_COL.channel - 1]);
    });
    // Входящие файлы уже скопированы в папку «<лист> — фото».
    try { var it = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty("FOLDER_ID")).getFoldersByName("Анкеты — входящие");
      if (it.hasNext()) { var sub = it.next().getFoldersByName(key.slice(0, 12)); if (sub.hasNext()) sub.next().setTrashed(true); } } catch (e) { Logger.log(e); }
    cell(ANKETA_COL.status).setValues([[STATUS_DONE + " " + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "dd.MM HH:mm") +
      (r && r.pubError ? " (сайт не опубликован: " + r.pubError + ")" : "")]]);
  } catch (e) {
    Logger.log(e.stack || e);
    cell(ANKETA_COL.status).setValues([[STATUS_ERR + ": " + String(e.message || e).slice(0, 300)]]);
  }
}

// Ответы страницы → как e.namedValues из Google Формы: { "Название вопроса": ["ответ"] }; файлы — ссылками Диска.
function anketaNamed(answers, files) {
  var named = {};
  questions().forEach(function (q) {
    if (!q.key || answers[q.key] == null) return;
    var v = answers[q.key];
    named[q.title] = [Array.isArray(v) ? v.join(", ") : String(v)];
  });
  Object.keys(ANKETA_UPLOAD_TITLE).forEach(function (kind) {
    var ids = (files && files[kind]) || [];
    if (ids.length) named[ANKETA_UPLOAD_TITLE[kind]] = [ids.map(function (id) { return "https://drive.google.com/open?id=" + id; }).join(", ")];
  });
  return named;
}

// От каких ответов зависит строка листа клиента (по умолчанию — от ответа с тем же ключом).
var ANKETA_DEPS = { languages: ["languages", "formLang"], name: ["name", "nameHe", "nameEn", "languages", "formLang"],
  lat: ["address"], lon: ["address"], workHours: ["workFrom", "workTo"], fridayHours: ["workFrom", "workTo", "fridayTo"] };

// Исправленная анкета → тот же лист. Строку, ответ на который не менялся, оставляем как есть (там могут быть
// правки владельца, например перевод); изменённые строки — заново (с переводом). Свои строки владельца
// (которых анкета не делает, например siteUrl) остаются внизу.
function anketaUpdateSheet(sh, answers, built) {
  var a = answersByKey(anketaNamed(answers, {}));
  var before = answersByKey(anketaNamed(built, {}));
  var old = sh.getDataRange().getDisplayValues();
  var byKey = {};
  old.slice(1).forEach(function (r) { if (r[0] && !byKey[r[0]]) byKey[r[0]] = r.slice(0, TAB_HEADER.length); });
  var translated = {};
  questions().forEach(function (q) { if (q.t) translated[q.key] = true; });
  var keep = function (key) {
    if (!byKey[key]) return null;
    var deps = ANKETA_DEPS[key] || (translated[key] ? [key, "languages", "formLang"] : [key]);
    return deps.every(function (k) { return (a[k] || "") === (before[k] || ""); }) ? byKey[key] : null;
  };
  var rows = siteRows(a, keep);
  var made = {};
  rows.forEach(function (r) { made[r[0]] = true; });
  // Ключи, которые делает анкета: если ответ стёрли, такой строки больше нет.
  var own = { languages: 1, color: 1, blocks: 1, name: 1, lat: 1, lon: 1, workHours: 1, fridayHours: 1 };
  questions().forEach(function (q) { if (q.key) own[q.key] = 1; });
  old.slice(1).forEach(function (r) { if (r[0] && !own[r[0]] && !made[r[0]]) { rows.push(r.slice(0, TAB_HEADER.length)); made[r[0]] = true; } });
  rows = rows.map(function (r) { var x = r.slice(0, TAB_HEADER.length); while (x.length < TAB_HEADER.length) x.push(""); return x; });
  var height = Math.max(rows.length, old.length - 1);
  while (rows.length < height) rows.push(TAB_HEADER.map(function () { return ""; }));
  sh.getRange(2, 1, height, TAB_HEADER.length).setNumberFormat("@").setValues(rows);
}

// Новые и удалённые фото исправленной анкеты → папка «<лист> — фото».
function anketaUpdateMedia(tab, files) {
  var folder = mediaFolder(tab);
  var have = [], it = folder.getFiles();
  while (it.hasNext()) have.push(it.next());
  var remove = {};
  (files.remove || []).forEach(function (id) { remove[id] = true; });
  have.forEach(function (f) { if (remove[f.getId()]) f.setTrashed(true); });
  have = have.filter(function (f) { return !remove[f.getId()]; });
  var ext = function (f, def) { return f.getName().indexOf(".") !== -1 ? f.getName().split(".").pop() : def; };
  var copy = function (id, name) {
    try { var f = DriveApp.getFileById(id); f.makeCopy(name(f), folder); }
    catch (err) { Logger.log("Не удалось скопировать файл " + id + ": " + err); }
  };
  [["logo", /^logo\./i, "png"], ["main", /^main\./i, "jpg"], ["portrait", /^portrait\./i, "jpg"]].forEach(function (s) {
    var id = (files[s[0]] || [])[0];
    if (!id) return;
    have.forEach(function (f) { if (s[1].test(f.getName())) f.setTrashed(true); });
    copy(id, function (f) { return s[0] + "." + ext(f, s[2]); });
  });
  // Фото и документы — в конец, номером после последнего (по номеру в имени идёт порядок на сайте).
  [["photos", "photo-", /^photo-(\d+)/i], ["docs", "doc-", /^doc-(\d+)/i]].forEach(function (s) {
    var n = 0;
    have.forEach(function (f) { var m = f.getName().match(s[2]); if (m) n = Math.max(n, Number(m[1])); });
    (files[s[0]] || []).forEach(function (id) {
      n++;
      copy(id, function (f) { return s[1] + (n < 10 ? "0" : "") + n + "-" + f.getName(); });
    });
  });
}

// ---------- Лист «Сайты»: ссылка «Исправить анкету», счётчик и лимит правок ----------

function anketaSitesCols(list) {
  var head = list.getRange(1, 1, 1, list.getLastColumn()).getDisplayValues()[0];
  var cols = {};
  SITES_EXTRA.forEach(function (h) {
    var at = head.indexOf(h);
    if (at === -1) {
      var end = head.length;
      while (end > 0 && !String(head[end - 1]).trim()) end--;
      at = Math.max(end, SITES_HEADER.length);
      list.getRange(1, at + 1, 1, 1).setValues([[h]]).setFontWeight("bold");
      head[at] = h;
    }
    cols[h] = at + 1;
  });
  return cols;
}

function anketaSitesRow(ss, tab, key, used, channel) {
  var list = sitesSheet(ss);
  var cols = anketaSitesCols(list);
  var vals = list.getDataRange().getDisplayValues();
  var row = 0;
  for (var i = 1; i < vals.length; i++) if (vals[i][0] === tab) row = i + 1;
  if (!row) return;
  var url = PropertiesService.getScriptProperties().getProperty("ANKETA_URL");
  if (url) list.getRange(row, cols[SITES_EXTRA[0]]).setRichTextValue(SpreadsheetApp.newRichTextValue()
    .setText("Исправить анкету").setLinkUrl(url + "/?edit=" + key).build());
  list.getRange(row, cols[SITES_EXTRA[1]], 1, 1).setValues([[String(Number(used) || 0)]]);
  var lim = list.getRange(row, cols[SITES_EXTRA[2]], 1, 1);
  if (!String(lim.getDisplayValue()).trim()) lim.setValues([[anketaSettings(ss).edits]]);
  // Канал пишем, только если клетка пустая: исправления канал не меняют, а своё значение владельца не трогаем.
  var ch = list.getRange(row, cols[SITES_EXTRA[3]], 1, 1);
  if (channel && !String(ch.getDisplayValue()).trim()) ch.setNumberFormat("@").setValues([[String(channel)]]);
}

// Лимит правок клиента: число в колонке «лимит правок» на листе «Сайты», если пусто — из настроек.
function anketaLimit(ss, tab, set) {
  var def = Number(set.edits) || 0;
  var list = ss.getSheetByName(SITES_SHEET);
  if (!tab || !list) return def;
  var vals = list.getDataRange().getDisplayValues();
  var col = vals[0].indexOf(SITES_EXTRA[2]);
  if (col === -1) return def;
  for (var i = 1; i < vals.length; i++) {
    if (vals[i][0] !== tab) continue;
    var v = String(vals[i][col]).trim();
    return v === "" || isNaN(Number(v)) ? def : Number(v);
  }
  return def;
}

// ---------- Служебные листы ----------

function anketaSheet(ss) {
  var sh = ss.getSheetByName(ANKETA_SHEET);
  if (!sh) {
    sh = ss.insertSheet(ANKETA_SHEET);
    sh.getRange(1, 1, 1, ANKETA_HEADER.length).setValues([ANKETA_HEADER]).setFontWeight("bold");
    sh.setFrozenRows(1);
  } else {
    // Лист из прежней версии — без новых колонок (например «канал»).
    var head = sh.getRange(1, 1, 1, ANKETA_HEADER.length).getDisplayValues()[0];
    ANKETA_HEADER.forEach(function (h, i) { if (!head[i]) sh.getRange(1, i + 1, 1, 1).setValues([[h]]).setFontWeight("bold"); });
  }
  return sh;
}

function anketaRow(sh, key) {
  if (!/^[0-9a-f]{32,48}$/.test(key)) return 0;
  var vals = sh.getRange(1, 1, sh.getLastRow(), 1).getDisplayValues();
  for (var i = 1; i < vals.length; i++) if (vals[i][0] === key) return i + 1;
  return 0;
}

function anketaSettings(ss) {
  var sh = ss.getSheetByName(ANKETA_SETTINGS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(ANKETA_SETTINGS_SHEET);
    sh.getRange(1, 1, 1, 2).setValues([["настройка", "значение"]]).setFontWeight("bold");
    sh.getRange(2, 1, ANKETA_SETTINGS.length, 2).setValues(ANKETA_SETTINGS.map(function (s) { return [s.label, s.value]; }));
    sh.setColumnWidth(1, 320);
  }
  var vals = sh.getDataRange().getDisplayValues();
  var out = {};
  ANKETA_SETTINGS.forEach(function (s) {
    out[s.key] = s.value;
    vals.forEach(function (r) { if (r[0] === s.label && String(r[1]).trim() !== "") out[s.key] = String(r[1]).trim(); });
  });
  return out;
}

function anketaJson(text) {
  try { return text ? JSON.parse(text) : null; } catch (e) { return null; }
}

// Меню: ещё раз собрать анкеты со статусом «ошибка» (и те, что ждут).
function retryAnketas() {
  var ss = anketaSs();
  var sh = anketaSheet(ss);
  var vals = sh.getDataRange().getDisplayValues();
  var n = 0;
  for (var i = 1; i < vals.length; i++) {
    var st = vals[i][ANKETA_COL.status - 1];
    if (st.indexOf(STATUS_ERR) === 0 || st === STATUS_BUSY || st === STATUS_WAIT) { sh.getRange(i + 1, ANKETA_COL.status, 1, 1).setValues([[STATUS_WAIT]]); n++; }
  }
  if (!n) { notify("Анкет с ошибкой нет: на листе «" + ANKETA_SHEET + "» у всех статус «готово»."); return; }
  processAnketas();
  notify("Готово: собрано анкет — " + n + ". Статус — на листе «" + ANKETA_SHEET + "».");
}

// ---------- Публикация страницы анкеты на Netlify ----------

// Адрес веб-приложения (куда страница отправляет ответы). Задаётся один раз в окне publishAnketa.
function anketaApi() {
  var p = PropertiesService.getScriptProperties();
  // Только адрес, который владелец вставил сам. ScriptApp.getService().getUrl() не годится: у проекта может быть
  // несколько развертываний, и он вернул старое (28.10 так анкета ушла в развертывание без приёма анкет).
  return p.getProperty("ANKETA_API") || "";
}

function publishAnketa() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty("NETLIFY_TOKEN")) { notify("Сначала подключите Netlify: «QPortall → Подключить Netlify»."); return; }
  if (!anketaApi()) { anketaAskApi(); return; }
  var ss = anketaSs();
  anketaSheet(ss); anketaSettings(ss); anketaBgSheet(ss); anketaChannelSheet(ss); anketaSitesCols(sitesSheet(ss));
  var r = anketaDeploy(ss);
  notify((r.changed ? "Анкета опубликована: " : "Анкета не менялась, заново не выкладывали (каждая выкладка стоит 15 кредитов Netlify): ") + r.url +
    "\n\nОтветы идут в развертывание " + anketaApi().replace(/^.*\/s\/(.{10}).*$/, "$1…") +
    " (Apps Script → Управление развертываниями: после новой версии файлов обновлять его)." +
    "\n\nЭто анкета с общим фоном. Ссылки на анкету с другим фоном (дизайн 1, 2, 3…) — на листе «" + BG_SHEET + "»." +
    (r.notes.length ? "\n\nПроверьте:\n" + r.notes.join("\n") : ""));
}

function anketaAskApi() {
  var html = HtmlService.createHtmlOutput(
    '<div style="font:14px/1.5 Arial,sans-serif">' +
    '<p>Анкета отправляет ответы в этот скрипт. Для этого его нужно один раз развернуть как веб-приложение:</p>' +
    '<ol style="padding-left:20px">' +
    '<li>Расширения → Apps Script → справа вверху <b>Начать развертывание → Новое развертывание</b>.</li>' +
    '<li>Шестерёнка «Выберите тип» → <b>Веб-приложение</b>. Запуск от имени: <b>Я</b>. У кого есть доступ: <b>Все</b>.</li>' +
    '<li><b>Начать развертывание</b> → если Google спросит разрешения — разрешить → скопировать <b>URL веб-приложения</b> и вставить сюда.</li></ol>' +
    '<input id="t" style="width:100%;padding:6px;font:13px monospace" placeholder="https://script.google.com/macros/s/.../exec" autocomplete="off">' +
    '<p><button id="b" style="padding:6px 16px">Сохранить и опубликовать</button> <span id="m"></span></p>' +
    '<script>document.getElementById("b").onclick=function(){var m=document.getElementById("m");m.textContent="Публикую, это займёт минуту…";' +
    'google.script.run.withSuccessHandler(function(r){m.innerHTML=r;}).withFailureHandler(function(e){m.textContent=e.message;})' +
    '.saveAnketaApi(document.getElementById("t").value);};</script></div>').setWidth(600).setHeight(420);
  SpreadsheetApp.getUi().showModalDialog(html, "QPortall — анкета");
}

// Из окна anketaAskApi. Возвращает HTML для окна.
function saveAnketaApi(url) {
  url = String(url || "").trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) throw new Error("Нужен адрес вида https://script.google.com/macros/s/…/exec");
  PropertiesService.getScriptProperties().setProperty("ANKETA_API", url);
  var ss = anketaSs();
  anketaSheet(ss); anketaSettings(ss); anketaBgSheet(ss); anketaChannelSheet(ss); anketaSitesCols(sitesSheet(ss));
  var r = anketaDeploy(ss);
  return "<b>Анкета опубликована:</b> <a href=\"" + r.url + "\" target=\"_blank\" rel=\"noopener\">" + r.url + "</a>" +
    (r.notes.length ? "<br>Проверьте: " + r.notes.map(escapeHtml).join("<br>") : "") + "<br>Окно можно закрыть.";
}

function anketaBgSheet(ss) {
  var sh = ss.getSheetByName(BG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(BG_SHEET);
    sh.getRange(1, 1, 1, BG_SHEET_HEADER.length).setValues([BG_SHEET_HEADER]).setFontWeight("bold");
    if (BG_DEFAULTS.length) sh.getRange(2, 1, BG_DEFAULTS.length, 5).setValues(BG_DEFAULTS.map(function (d, i) { return [String(i + 1)].concat(d); }));
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 40);
    [2, 3, 4, 6].forEach(function (c) { sh.setColumnWidth(c, 260); });
  }
  return sh;
}

function anketaChannelSheet(ss) {
  var sh = ss.getSheetByName(CH_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CH_SHEET);
    sh.getRange(1, 1, 1, CH_HEADER.length).setValues([CH_HEADER]).setFontWeight("bold");
    if (CH_DEFAULTS.length) sh.getRange(2, 1, CH_DEFAULTS.length, 3).setValues(CH_DEFAULTS.map(function (d, i) { return [String(i + 1)].concat(d); }));
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 40);
    [2, 4].forEach(function (c) { sh.setColumnWidth(c, 260); });
  }
  return sh;
}

// Счётчики канала (формулы, считаются сами): анкет с этим каналом и сайтов с «оплачено» = Да.
// Колонки ищутся по заголовку — их можно двигать.
function anketaChannelFormulas(row) {
  var col = function (sheet, head) {
    var q = "'" + sheet + "'";
    return "INDEX(" + q + "!A2:AZ,0,MATCH(\"" + head + "\"," + q + "!A1:AZ1,0))";
  };
  var me = "TO_TEXT($A" + row + ")";
  return [
    "=IFERROR(ARRAYFORMULA(SUM(--(TO_TEXT(" + col(ANKETA_SHEET, "канал") + ")=" + me + "))),0)",
    "=IFERROR(ARRAYFORMULA(SUM((TO_TEXT(" + col(SITES_SHEET, SITES_EXTRA[3]) + ")=" + me + ")*REGEXMATCH(LOWER(TRIM(TO_TEXT(" +
      col(SITES_SHEET, SITES_EXTRA[4]) + "))),\"^(да|true|yes|v|✓|✔)$\"))),0)"
  ];
}

// Формулы с запятыми; в таблице с русскими настройками Google ждёт «;» (проверено 28.10: с запятыми — #ERROR!).
function anketaSetFormulas(range, list) {
  range.setFormulas([list]);
  SpreadsheetApp.flush();
  if (!range.getDisplayValues()[0].some(function (v) { return /^#ERROR/.test(v); })) return;
  range.setFormulas([list.map(function (f) { return f.replace(/("[^"]*")|,/g, function (m, str) { return str || ";"; }); })]);
}

// Id файла Диска из ссылки (…/file/d/<id>/…, …?id=<id>) или null.
function driveIdFromUrl(url) {
  var m = String(url || "").match(/\/d\/([\w-]{20,})|[?&]id=([\w-]{20,})/);
  return m ? m[1] || m[2] : null;
}

function anketaDeploy(ss) {
  var props = PropertiesService.getScriptProperties();
  var notes = [];
  var bgSheet = anketaBgSheet(ss);
  var bgRows = bgSheet.getDataRange().getDisplayValues();
  var groups = {}, images = {};
  bgRows.slice(1).forEach(function (r, i) {
    var num = String(i + 1), pic = String(r[BG.pic - 1] || "").trim();
    if (!pic) return;
    var color = String(r[BG.color - 1] || "").trim();
    if (color && !/^#[0-9a-f]{6}$/i.test(color)) { notes.push("«" + BG_SHEET + "», строка " + num + ": цвет пишется так: #0b6e69"); color = ""; }
    var builtin = pic.match(/^встро\S*\s*(?:фон\s*)?(\d+)$/i);
    if (builtin) {
      if (ANKETA_PAGE["bg/" + builtin[1] + ".svg"]) groups[num] = { img: "bg/" + builtin[1] + ".svg", color: color };
      else notes.push("«" + BG_SHEET + "», строка " + num + ": встроенного фона " + builtin[1] + " нет (есть 1–5)");
      return;
    }
    var blob = null, id = driveIdFromUrl(pic);
    try {
      if (id) blob = driveThumbnail(id, 1600);
      else if (/^https:\/\//.test(pic)) { var res = UrlFetchApp.fetch(pic, { muteHttpExceptions: true }); if (res.getResponseCode() === 200) blob = res.getBlob(); }
    } catch (e) { Logger.log("фон " + num + ": " + e); }
    var ext = blob && QPageCore.IMAGE_EXT[blob.getContentType()];
    if (!ext || ext === "svg") { notes.push("«" + BG_SHEET + "», строка " + num + ": картинку не удалось взять. Нужна ссылка на картинку (JPG/PNG) в Google Диске."); return; }
    images["bg/" + num + "." + ext] = blob;
    groups[num] = { img: "bg/" + num + "." + ext, color: color };
  });
  // Каналы: фон канала — номер строки листа «Фоны анкеты».
  var chSheet = anketaChannelSheet(ss);
  var chRows = chSheet.getDataRange().getDisplayValues();
  var channels = {};
  chRows.slice(1).forEach(function (r, i) {
    var num = String(i + 1), bg = String(r[CH.bg - 1] || "").trim();
    if (!String(r[CH.name - 1] || "").trim() || !bg) return;
    if (groups[bg]) channels[num] = bg;
    else notes.push("«" + CH_SHEET + "», строка " + num + ": фона " + bg + " нет на листе «" + BG_SHEET + "»");
  });
  var api = anketaApi();
  var config = {
    api: api, version: Utilities.formatDate(new Date(), "UTC", "yyyyMMddHHmm"),
    questions: questions().map(function (q) {
      var x = {};
      ["section", "help", "key", "title", "type", "options", "required", "validate", "gate", "t"].forEach(function (k) { if (q[k] != null) x[k] = q[k]; });
      if (q.key && (q.type === "text" || q.type === "paragraph")) {
        var lim = anketaLimitOf(q);
        x.max = lim.max; if (lim.lines) x.lines = lim.lines; if (lim.lineMax) x.lineMax = lim.lineMax;
      }
      if (q.gateOf) { x.gatePage = q.gateOf.page; }
      return x;
    }),
    colors: COLORS, designs: ["showcase", "strict", "classic"].map(function (k) { return { key: k, label: QPageCore.DESIGNS[k].label }; }),
    uploads: ANKETA_UPLOAD_TITLE, maxFiles: ANKETA_FILES, minPx: MIN_PX, maxPhotos: QPageCore.MAX_PHOTOS, minMs: ANKETA_MIN_MS,
    groups: groups, channels: channels, linkRe: ANKETA_LINK_RE, contact: props.getProperty("ORDER_URL") || ""
  };
  var files = {};
  Object.keys(ANKETA_PAGE).forEach(function (rel) { files[rel] = ANKETA_PAGE[rel]; });
  var configJs = "window.QP_ANKETA = " + JSON.stringify(config) + ";\n";
  // Метка версии у файлов — чтобы браузер не взял старую анкету из кеша.
  var stamp = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    configJs.replace(/"version":"\d+"/, "") + files["anketa.js"] + files["anketa.css"], Utilities.Charset.UTF_8)).replace(/[^a-z0-9]/gi, "").slice(0, 10);
  files["index.html"] = files["index.html"].replace(/\?v=dev/g, "?v=" + stamp);
  files["config.js"] = configJs;
  var blobs = Object.keys(files).map(function (rel) {
    return Utilities.newBlob(files[rel], MIME[rel.split(".").pop()] || "text/plain", rel);
  });
  blobs.push(Utilities.newBlob(Utilities.base64Decode(ANKETA_LOGO_PNG), "image/png", "logo.png"));
  Object.keys(images).forEach(function (rel) { blobs.push(images[rel].copyBlob().setName(rel)); });
  var fingerprint = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    Object.keys(files).sort().map(function (k) { return k + "\n" + (k === "config.js" ? configJs.replace(/"version":"\d+"/, "") : files[k]); }).join("\n\n") +
    Object.keys(images).sort().map(function (k) { return k + ":" + images[k].getBytes().length; }).join(","), Utilities.Charset.UTF_8));

  var site = netlifySite(ANKETA_SITE);
  var url = site.ssl_url || site.url;
  var changed = props.getProperty("ANKETA_HASH") !== fingerprint;
  if (changed) {
    var deploy = netlify("post", "/sites/" + site.id + "/deploys", Utilities.zip(blobs, "anketa.zip"));
    var waited = 0;
    while (deploy.state !== "ready" && deploy.state !== "error" && waited < NETLIFY_WAIT_SEC) {
      Utilities.sleep(3000); waited += 3;
      deploy = netlify("get", "/deploys/" + deploy.id);
    }
    if (deploy.state === "error") throw new Error("Netlify не принял анкету: " + (deploy.error_message || "ошибка публикации"));
    if (deploy.state !== "ready") notes.push("Netlify: публикация ещё идёт, через минуту откройте " + url);
    props.setProperty("ANKETA_HASH", fingerprint);
  }
  props.setProperty("ANKETA_URL", url);
  // Номера строк и готовые ссылки — рядом с каждой картинкой.
  for (var i = 1; i < bgRows.length; i++) {
    var num = String(i);
    if (bgRows[i][BG.num - 1] !== num) bgSheet.getRange(i + 1, BG.num, 1, 1).setValues([[num]]);
    var link = groups[num] ? url + "/?d=" + num : "";
    var cellR = bgSheet.getRange(i + 1, BG.link);
    if (link) cellR.setRichTextValue(SpreadsheetApp.newRichTextValue().setText(link).setLinkUrl(link).build());
    else if (bgRows[i][BG.link - 1]) cellR.setValues([[""]]);
  }
  // Каналы: номер, ссылка …/?r=N и счётчики — у каждой строки с названием.
  for (var j = 1; j < chRows.length; j++) {
    var cn = String(j), named = String(chRows[j][CH.name - 1] || "").trim();
    if (chRows[j][CH.num - 1] !== cn) chSheet.getRange(j + 1, CH.num, 1, 1).setNumberFormat("@").setValues([[cn]]);
    var chLink = chSheet.getRange(j + 1, CH.link);
    if (named) {
      var ref = url + "/?r=" + cn;
      chLink.setRichTextValue(SpreadsheetApp.newRichTextValue().setText(ref).setLinkUrl(ref).build());
      anketaSetFormulas(chSheet.getRange(j + 1, CH.count, 1, 2), anketaChannelFormulas(j + 1));
    } else if (chRows[j][CH.link - 1]) {
      chLink.setValues([[""]]);
      chSheet.getRange(j + 1, CH.count, 1, 2).setValues([["", ""]]);
    }
  }
  return { url: url, changed: changed, notes: notes };
}

// Фоны и логотип анкеты (папка anketa).
var ANKETA_PAGE = typeof ANKETA_PAGE === "object" && ANKETA_PAGE ? ANKETA_PAGE : {};
ANKETA_PAGE["_headers"] = [
"/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n/index.html\n  Cache-Control: no-cache\n/\n  Cache-Control: no-cache\n/config.js\n  Cache-Control: no-cache\n"
].join("");
ANKETA_PAGE["bg/1.svg"] = [
"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1600 1000\" width=\"1600\" height=\"1000\" preserveAspectRatio=\"xMidYMid slice\"><defs><linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#efe9e1\"/><stop offset=\"0.45\" stop-color=\"#e4ddd3\"/><stop offset=\"1\" stop-color=\"#d9d4cc\"/></linearGradient></defs><rect width=\"1600\" height=\"1000\" fill=\"url(#g)\"/><g fill=\"none\"><path d=\"M-50 120C400 40 900 220 1650 90\" stroke=\"rgba(120,100,80,0.05)\" stroke-width=\"1.2\"/><path d=\"M-50 190C400 110 900 290 1650 160\" stroke=\"rgba(120,100,80,0.08)\" stroke-width=\"2.2\"/><path d=\"M-50 260C400 180 900 360 1650 230\" stroke=\"rgba(120,100,80,0.11)\" stroke-width=\"3.2\"/><path d=\"M-50 330C400 250 900 430 1650 300\" stroke=\"rgba(120,100,80,0.05)\" stroke-width=\"4.2\"/><path d=\"M-50 400C400 320 900 500 1650 370\" stroke=\"rgba(120,100,80,0.08)\" stroke-width=\"1.2\"/><path d=\"M-50 470C400 390 900 570 1650 440\" stroke=\"rgba(120,100,80,0.11)\" stroke-width=\"2.2\"/><path d=\"M-50 540C400 460 900 640 1650 510\" stroke=\"rgba(120,100,80,0.05)\" stroke-width=\"3.2\"/><path d=\"M-50 610C400 530 900 710 1650 580\" stroke=\"rgba(120,100,80,0.08)\" stroke-width=\"4.2\"/><path d=\"M-50 680C400 600 900 780 1650 650\" stroke=\"rgba(120,100,80,0.11)\" stroke-width=\"1.2\"/><path d=\"M-50 750C400 670 900 850 1650 720\" stroke=\"rgba(120,100,80,0.05)\" stroke-width=\"2.2\"/><path d=\"M-50 820C400 740 900 920 1650 790\" stroke=\"rgba(120,100,80,0.08)\" stroke-width=\"3.2\"/><path d=\"M-50 890C400 810 900 990 1650 860\" stroke=\"rgba(120,100,80,0.11)\" stroke-width=\"4.2\"/><path d=\"M-50 960C400 880 900 1060 1650 930\" stroke=\"rgba(120,100,80,0.05)\" stroke-width=\"1.2\"/><path d=\"M-50 1030C400 950 900 1130 1650 1000\" stroke=\"rgba(120,100,80,0.08)\" stroke-width=\"2.2\"/></g></svg>\n"
].join("");
ANKETA_PAGE["bg/2.svg"] = [
"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1600 1000\" width=\"1600\" height=\"1000\" preserveAspectRatio=\"xMidYMid slice\"><defs><radialGradient id=\"g\" cx=\"0.75\" cy=\"0.2\" r=\"0.9\"><stop offset=\"0\" stop-color=\"#33415c\"/><stop offset=\"0.55\" stop-color=\"#1b2333\"/><stop offset=\"1\" stop-color=\"#10151f\"/></radialGradient></defs><rect width=\"1600\" height=\"1000\" fill=\"url(#g)\"/><g stroke=\"rgba(255,255,255,0.035)\"><line x1=\"-400\" y1=\"0\" x2=\"600\" y2=\"1000\"/><line x1=\"-360\" y1=\"0\" x2=\"640\" y2=\"1000\"/><line x1=\"-320\" y1=\"0\" x2=\"680\" y2=\"1000\"/><line x1=\"-280\" y1=\"0\" x2=\"720\" y2=\"1000\"/><line x1=\"-240\" y1=\"0\" x2=\"760\" y2=\"1000\"/><line x1=\"-200\" y1=\"0\" x2=\"800\" y2=\"1000\"/><line x1=\"-160\" y1=\"0\" x2=\"840\" y2=\"1000\"/><line x1=\"-120\" y1=\"0\" x2=\"880\" y2=\"1000\"/><line x1=\"-80\" y1=\"0\" x2=\"920\" y2=\"1000\"/><line x1=\"-40\" y1=\"0\" x2=\"960\" y2=\"1000\"/><line x1=\"0\" y1=\"0\" x2=\"1000\" y2=\"1000\"/><line x1=\"40\" y1=\"0\" x2=\"1040\" y2=\"1000\"/><line x1=\"80\" y1=\"0\" x2=\"1080\" y2=\"1000\"/><line x1=\"120\" y1=\"0\" x2=\"1120\" y2=\"1000\"/><line x1=\"160\" y1=\"0\" x2=\"1160\" y2=\"1000\"/><line x1=\"200\" y1=\"0\" x2=\"1200\" y2=\"1000\"/><line x1=\"240\" y1=\"0\" x2=\"1240\" y2=\"1000\"/><line x1=\"280\" y1=\"0\" x2=\"1280\" y2=\"1000\"/><line x1=\"320\" y1=\"0\" x2=\"1320\" y2=\"1000\"/><line x1=\"360\" y1=\"0\" x2=\"1360\" y2=\"1000\"/><line x1=\"400\" y1=\"0\" x2=\"1400\" y2=\"1000\"/><line x1=\"440\" y1=\"0\" x2=\"1440\" y2=\"1000\"/><line x1=\"480\" y1=\"0\" x2=\"1480\" y2=\"1000\"/><line x1=\"520\" y1=\"0\" x2=\"1520\" y2=\"1000\"/><line x1=\"560\" y1=\"0\" x2=\"1560\" y2=\"1000\"/><line x1=\"600\" y1=\"0\" x2=\"1600\" y2=\"1000\"/><line x1=\"640\" y1=\"0\" x2=\"1640\" y2=\"1000\"/><line x1=\"680\" y1=\"0\" x2=\"1680\" y2=\"1000\"/><line x1=\"720\" y1=\"0\" x2=\"1720\" y2=\"1000\"/><line x1=\"760\" y1=\"0\" x2=\"1760\" y2=\"1000\"/><line x1=\"800\" y1=\"0\" x2=\"1800\" y2=\"1000\"/><line x1=\"840\" y1=\"0\" x2=\"1840\" y2=\"1000\"/><line x1=\"880\" y1=\"0\" x2=\"1880\" y2=\"1000\"/><line x1=\"920\" y1=\"0\" x2=\"1920\" y2=\"1000\"/><line x1=\"960\" y1=\"0\" x2=\"1960\" y2=\"1000\"/><line x1=\"1000\" y1=\"0\" x2=\"2000\" y2=\"1000\"/><line x1=\"1040\" y1=\"0\" x2=\"2040\" y2=\"1000\"/><line x1=\"1080\" y1=\"0\" x2=\"2080\" y2=\"1000\"/><line x1=\"1120\" y1=\"0\" x2=\"2120\" y2=\"1000\"/><line x1=\"1160\" y1=\"0\" x2=\"2160\" y2=\"1000\"/><line x1=\"1200\" y1=\"0\" x2=\"2200\" y2=\"1000\"/><line x1=\"1240\" y1=\"0\" x2=\"2240\" y2=\"1000\"/><line x1=\"1280\" y1=\"0\" x2=\"2280\" y2=\"1000\"/><line x1=\"1320\" y1=\"0\" x2=\"2320\" y2=\"1000\"/><line x1=\"1360\" y1=\"0\" x2=\"2360\" y2=\"1000\"/><line x1=\"1400\" y1=\"0\" x2=\"2400\" y2=\"1000\"/><line x1=\"1440\" y1=\"0\" x2=\"2440\" y2=\"1000\"/><line x1=\"1480\" y1=\"0\" x2=\"2480\" y2=\"1000\"/><line x1=\"1520\" y1=\"0\" x2=\"2520\" y2=\"1000\"/><line x1=\"1560\" y1=\"0\" x2=\"2560\" y2=\"1000\"/><line x1=\"1600\" y1=\"0\" x2=\"2600\" y2=\"1000\"/><line x1=\"1640\" y1=\"0\" x2=\"2640\" y2=\"1000\"/><line x1=\"1680\" y1=\"0\" x2=\"2680\" y2=\"1000\"/><line x1=\"1720\" y1=\"0\" x2=\"2720\" y2=\"1000\"/><line x1=\"1760\" y1=\"0\" x2=\"2760\" y2=\"1000\"/><line x1=\"1800\" y1=\"0\" x2=\"2800\" y2=\"1000\"/><line x1=\"1840\" y1=\"0\" x2=\"2840\" y2=\"1000\"/><line x1=\"1880\" y1=\"0\" x2=\"2880\" y2=\"1000\"/><line x1=\"1920\" y1=\"0\" x2=\"2920\" y2=\"1000\"/><line x1=\"1960\" y1=\"0\" x2=\"2960\" y2=\"1000\"/></g><g fill=\"none\"><rect x=\"980\" y=\"160\" width=\"420\" height=\"560\" stroke=\"rgba(214,190,140,0.35)\" stroke-width=\"2\"/><rect x=\"1010\" y=\"190\" width=\"420\" height=\"560\" stroke=\"rgba(214,190,140,0.18)\"/></g></svg>\n"
].join("");
ANKETA_PAGE["bg/3.svg"] = [
"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1600 1000\" width=\"1600\" height=\"1000\" preserveAspectRatio=\"xMidYMid slice\"><defs><filter id=\"b\" x=\"-50%\" y=\"-50%\" width=\"200%\" height=\"200%\"><feGaussianBlur stdDeviation=\"90\"/></filter></defs><rect width=\"1600\" height=\"1000\" fill=\"#ff6a88\"/><g filter=\"url(#b)\"><circle cx=\"250\" cy=\"200\" r=\"380\" fill=\"#ff2e93\"/><circle cx=\"1350\" cy=\"180\" r=\"420\" fill=\"#ffb03a\"/><circle cx=\"900\" cy=\"850\" r=\"450\" fill=\"#8f3dff\"/><circle cx=\"200\" cy=\"900\" r=\"320\" fill=\"#ff8a3d\"/><circle cx=\"1500\" cy=\"900\" r=\"300\" fill=\"#ff3d6e\"/></g><circle cx=\"0\" cy=\"0\" r=\"3\" fill=\"rgba(255,255,255,0.15)\"/><circle cx=\"397\" cy=\"211\" r=\"6\" fill=\"rgba(255,255,255,0.25)\"/><circle cx=\"794\" cy=\"422\" r=\"9\" fill=\"rgba(255,255,255,0.35)\"/><circle cx=\"1191\" cy=\"633\" r=\"12\" fill=\"rgba(255,255,255,0.15)\"/><circle cx=\"1588\" cy=\"844\" r=\"15\" fill=\"rgba(255,255,255,0.25)\"/><circle cx=\"385\" cy=\"55\" r=\"3\" fill=\"rgba(255,255,255,0.35)\"/><circle cx=\"782\" cy=\"266\" r=\"6\" fill=\"rgba(255,255,255,0.15)\"/><circle cx=\"1179\" cy=\"477\" r=\"9\" fill=\"rgba(255,255,255,0.25)\"/><circle cx=\"1576\" cy=\"688\" r=\"12\" fill=\"rgba(255,255,255,0.35)\"/><circle cx=\"373\" cy=\"899\" r=\"15\" fill=\"rgba(255,255,255,0.15)\"/><circle cx=\"770\" cy=\"110\" r=\"3\" fill=\"rgba(255,255,255,0.25)\"/><circle cx=\"1167\" cy=\"321\" r=\"6\" fill=\"rgba(255,255,255,0.35)\"/><circle cx=\"1564\" cy=\"532\" r=\"9\" fill=\"rgba(255,255,255,0.15)\"/><circle cx=\"361\" cy=\"743\" r=\"12\" fill=\"rgba(255,255,255,0.25)\"/><circle cx=\"758\" cy=\"954\" r=\"15\" fill=\"rgba(255,255,255,0.35)\"/><circle cx=\"1155\" cy=\"165\" r=\"3\" fill=\"rgba(255,255,255,0.15)\"/><circle cx=\"1552\" cy=\"376\" r=\"6\" fill=\"rgba(255,255,255,0.25)\"/><circle cx=\"349\" cy=\"587\" r=\"9\" fill=\"rgba(255,255,255,0.35)\"/><circle cx=\"746\" cy=\"798\" r=\"12\" fill=\"rgba(255,255,255,0.15)\"/><circle cx=\"1143\" cy=\"9\" r=\"15\" fill=\"rgba(255,255,255,0.25)\"/><circle cx=\"1540\" cy=\"220\" r=\"3\" fill=\"rgba(255,255,255,0.35)\"/><circle cx=\"337\" cy=\"431\" r=\"6\" fill=\"rgba(255,255,255,0.15)\"/><circle cx=\"734\" cy=\"642\" r=\"9\" fill=\"rgba(255,255,255,0.25)\"/><circle cx=\"1131\" cy=\"853\" r=\"12\" fill=\"rgba(255,255,255,0.35)\"/><circle cx=\"1528\" cy=\"64\" r=\"15\" fill=\"rgba(255,255,255,0.15)\"/><circle cx=\"325\" cy=\"275\" r=\"3\" fill=\"rgba(255,255,255,0.25)\"/><circle cx=\"722\" cy=\"486\" r=\"6\" fill=\"rgba(255,255,255,0.35)\"/><circle cx=\"1119\" cy=\"697\" r=\"9\" fill=\"rgba(255,255,255,0.15)\"/><circle cx=\"1516\" cy=\"908\" r=\"12\" fill=\"rgba(255,255,255,0.25)\"/><circle cx=\"313\" cy=\"119\" r=\"15\" fill=\"rgba(255,255,255,0.35)\"/><circle cx=\"710\" cy=\"330\" r=\"3\" fill=\"rgba(255,255,255,0.15)\"/><circle cx=\"1107\" cy=\"541\" r=\"6\" fill=\"rgba(255,255,255,0.25)\"/><circle cx=\"1504\" cy=\"752\" r=\"9\" fill=\"rgba(255,255,255,0.35)\"/><circle cx=\"301\" cy=\"963\" r=\"12\" fill=\"rgba(255,255,255,0.15)\"/><circle cx=\"698\" cy=\"174\" r=\"15\" fill=\"rgba(255,255,255,0.25)\"/><circle cx=\"1095\" cy=\"385\" r=\"3\" fill=\"rgba(255,255,255,0.35)\"/><circle cx=\"1492\" cy=\"596\" r=\"6\" fill=\"rgba(255,255,255,0.15)\"/><circle cx=\"289\" cy=\"807\" r=\"9\" fill=\"rgba(255,255,255,0.25)\"/><circle cx=\"686\" cy=\"18\" r=\"12\" fill=\"rgba(255,255,255,0.35)\"/><circle cx=\"1083\" cy=\"229\" r=\"15\" fill=\"rgba(255,255,255,0.15)\"/></svg>\n"
].join("");
ANKETA_PAGE["bg/4.svg"] = [
"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1600 1000\" width=\"1600\" height=\"1000\" preserveAspectRatio=\"xMidYMid slice\"><defs><linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\"0.4\" y2=\"1\"><stop offset=\"0\" stop-color=\"#0b3a63\"/><stop offset=\"0.6\" stop-color=\"#0a2a48\"/><stop offset=\"1\" stop-color=\"#071d33\"/></linearGradient></defs><rect width=\"1600\" height=\"1000\" fill=\"url(#g)\"/><g stroke=\"rgba(160,210,255,0.06)\"><line x1=\"40\" y1=\"0\" x2=\"40\" y2=\"1000\"/><line x1=\"80\" y1=\"0\" x2=\"80\" y2=\"1000\"/><line x1=\"120\" y1=\"0\" x2=\"120\" y2=\"1000\"/><line x1=\"160\" y1=\"0\" x2=\"160\" y2=\"1000\"/><line x1=\"240\" y1=\"0\" x2=\"240\" y2=\"1000\"/><line x1=\"280\" y1=\"0\" x2=\"280\" y2=\"1000\"/><line x1=\"320\" y1=\"0\" x2=\"320\" y2=\"1000\"/><line x1=\"360\" y1=\"0\" x2=\"360\" y2=\"1000\"/><line x1=\"440\" y1=\"0\" x2=\"440\" y2=\"1000\"/><line x1=\"480\" y1=\"0\" x2=\"480\" y2=\"1000\"/><line x1=\"520\" y1=\"0\" x2=\"520\" y2=\"1000\"/><line x1=\"560\" y1=\"0\" x2=\"560\" y2=\"1000\"/><line x1=\"640\" y1=\"0\" x2=\"640\" y2=\"1000\"/><line x1=\"680\" y1=\"0\" x2=\"680\" y2=\"1000\"/><line x1=\"720\" y1=\"0\" x2=\"720\" y2=\"1000\"/><line x1=\"760\" y1=\"0\" x2=\"760\" y2=\"1000\"/><line x1=\"840\" y1=\"0\" x2=\"840\" y2=\"1000\"/><line x1=\"880\" y1=\"0\" x2=\"880\" y2=\"1000\"/><line x1=\"920\" y1=\"0\" x2=\"920\" y2=\"1000\"/><line x1=\"960\" y1=\"0\" x2=\"960\" y2=\"1000\"/><line x1=\"1040\" y1=\"0\" x2=\"1040\" y2=\"1000\"/><line x1=\"1080\" y1=\"0\" x2=\"1080\" y2=\"1000\"/><line x1=\"1120\" y1=\"0\" x2=\"1120\" y2=\"1000\"/><line x1=\"1160\" y1=\"0\" x2=\"1160\" y2=\"1000\"/><line x1=\"1240\" y1=\"0\" x2=\"1240\" y2=\"1000\"/><line x1=\"1280\" y1=\"0\" x2=\"1280\" y2=\"1000\"/><line x1=\"1320\" y1=\"0\" x2=\"1320\" y2=\"1000\"/><line x1=\"1360\" y1=\"0\" x2=\"1360\" y2=\"1000\"/><line x1=\"1440\" y1=\"0\" x2=\"1440\" y2=\"1000\"/><line x1=\"1480\" y1=\"0\" x2=\"1480\" y2=\"1000\"/><line x1=\"1520\" y1=\"0\" x2=\"1520\" y2=\"1000\"/><line x1=\"1560\" y1=\"0\" x2=\"1560\" y2=\"1000\"/><line x1=\"0\" y1=\"40\" x2=\"1600\" y2=\"40\"/><line x1=\"0\" y1=\"80\" x2=\"1600\" y2=\"80\"/><line x1=\"0\" y1=\"120\" x2=\"1600\" y2=\"120\"/><line x1=\"0\" y1=\"160\" x2=\"1600\" y2=\"160\"/><line x1=\"0\" y1=\"240\" x2=\"1600\" y2=\"240\"/><line x1=\"0\" y1=\"280\" x2=\"1600\" y2=\"280\"/><line x1=\"0\" y1=\"320\" x2=\"1600\" y2=\"320\"/><line x1=\"0\" y1=\"360\" x2=\"1600\" y2=\"360\"/><line x1=\"0\" y1=\"440\" x2=\"1600\" y2=\"440\"/><line x1=\"0\" y1=\"480\" x2=\"1600\" y2=\"480\"/><line x1=\"0\" y1=\"520\" x2=\"1600\" y2=\"520\"/><line x1=\"0\" y1=\"560\" x2=\"1600\" y2=\"560\"/><line x1=\"0\" y1=\"640\" x2=\"1600\" y2=\"640\"/><line x1=\"0\" y1=\"680\" x2=\"1600\" y2=\"680\"/><line x1=\"0\" y1=\"720\" x2=\"1600\" y2=\"720\"/><line x1=\"0\" y1=\"760\" x2=\"1600\" y2=\"760\"/><line x1=\"0\" y1=\"840\" x2=\"1600\" y2=\"840\"/><line x1=\"0\" y1=\"880\" x2=\"1600\" y2=\"880\"/><line x1=\"0\" y1=\"920\" x2=\"1600\" y2=\"920\"/><line x1=\"0\" y1=\"960\" x2=\"1600\" y2=\"960\"/></g><g stroke=\"rgba(160,210,255,0.14)\"><line x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1000\"/><line x1=\"200\" y1=\"0\" x2=\"200\" y2=\"1000\"/><line x1=\"400\" y1=\"0\" x2=\"400\" y2=\"1000\"/><line x1=\"600\" y1=\"0\" x2=\"600\" y2=\"1000\"/><line x1=\"800\" y1=\"0\" x2=\"800\" y2=\"1000\"/><line x1=\"1000\" y1=\"0\" x2=\"1000\" y2=\"1000\"/><line x1=\"1200\" y1=\"0\" x2=\"1200\" y2=\"1000\"/><line x1=\"1400\" y1=\"0\" x2=\"1400\" y2=\"1000\"/><line x1=\"1600\" y1=\"0\" x2=\"1600\" y2=\"1000\"/><line x1=\"0\" y1=\"0\" x2=\"1600\" y2=\"0\"/><line x1=\"0\" y1=\"200\" x2=\"1600\" y2=\"200\"/><line x1=\"0\" y1=\"400\" x2=\"1600\" y2=\"400\"/><line x1=\"0\" y1=\"600\" x2=\"1600\" y2=\"600\"/><line x1=\"0\" y1=\"800\" x2=\"1600\" y2=\"800\"/><line x1=\"0\" y1=\"1000\" x2=\"1600\" y2=\"1000\"/></g><g fill=\"none\" stroke=\"rgba(190,225,255,0.45)\" stroke-width=\"2\"><circle cx=\"1180\" cy=\"420\" r=\"210\"/><circle cx=\"1180\" cy=\"420\" r=\"120\"/><circle cx=\"1180\" cy=\"420\" r=\"30\"/><line x1=\"1300\" y1=\"420\" x2=\"1390\" y2=\"420\"/><line x1=\"1284\" y1=\"480\" x2=\"1362\" y2=\"525\"/><line x1=\"1240\" y1=\"524\" x2=\"1285\" y2=\"602\"/><line x1=\"1180\" y1=\"540\" x2=\"1180\" y2=\"630\"/><line x1=\"1120\" y1=\"524\" x2=\"1075\" y2=\"602\"/><line x1=\"1076\" y1=\"480\" x2=\"998\" y2=\"525\"/><line x1=\"1060\" y1=\"420\" x2=\"970\" y2=\"420\"/><line x1=\"1076\" y1=\"360\" x2=\"998\" y2=\"315\"/><line x1=\"1120\" y1=\"316\" x2=\"1075\" y2=\"238\"/><line x1=\"1180\" y1=\"300\" x2=\"1180\" y2=\"210\"/><line x1=\"1240\" y1=\"316\" x2=\"1285\" y2=\"238\"/><line x1=\"1284\" y1=\"360\" x2=\"1362\" y2=\"315\"/><path d=\"M120 760H520V600H760\"/><path d=\"M200 840H640V720H900\"/><circle cx=\"760\" cy=\"600\" r=\"8\"/><circle cx=\"900\" cy=\"720\" r=\"8\"/><rect x=\"180\" y=\"180\" width=\"360\" height=\"220\"/><line x1=\"180\" y1=\"250\" x2=\"540\" y2=\"250\"/></g></svg>\n"
].join("");
ANKETA_PAGE["bg/5.svg"] = [
"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1600 1000\" width=\"1600\" height=\"1000\" preserveAspectRatio=\"xMidYMid slice\"><defs><linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f3fbfa\"/><stop offset=\"0.5\" stop-color=\"#e3f4f2\"/><stop offset=\"1\" stop-color=\"#d5ece9\"/></linearGradient><filter id=\"b\" x=\"-50%\" y=\"-50%\" width=\"200%\" height=\"200%\"><feGaussianBlur stdDeviation=\"60\"/></filter></defs><rect width=\"1600\" height=\"1000\" fill=\"url(#g)\"/><g filter=\"url(#b)\"><circle cx=\"1300\" cy=\"250\" r=\"300\" fill=\"#bfe6e1\"/><circle cx=\"300\" cy=\"820\" r=\"320\" fill=\"#cfe9f7\"/></g><g fill=\"rgba(46,150,140,0.08)\"><rect x=\"117\" y=\"142\" width=\"5\" height=\"16\" rx=\"2\"/><rect x=\"112\" y=\"147\" width=\"16\" height=\"5\" rx=\"2\"/></g><g fill=\"rgba(46,150,140,0.11)\"><rect x=\"386\" y=\"139\" width=\"7\" height=\"22\" rx=\"2\"/><rect x=\"379\" y=\"146\" width=\"22\" height=\"7\" rx=\"2\"/></g><g fill=\"rgba(46,150,140,0.14)\"><rect x=\"655\" y=\"136\" width=\"9\" height=\"28\" rx=\"2\"/><rect x=\"646\" y=\"145\" width=\"28\" height=\"9\" rx=\"2\"/></g><g fill=\"rgba(46,150,140,0.17)\"><rect x=\"927\" y=\"142\" width=\"5\" height=\"16\" rx=\"2\"/><rect x=\"922\" y=\"147\" width=\"16\" height=\"5\" rx=\"2\"/></g><g fill=\"rgba(46,150,140,0.08)\"><rect x=\"1196\" y=\"139\" width=\"7\" height=\"22\" rx=\"2\"/><rect x=\"1189\" y=\"146\" width=\"22\" height=\"7\" rx=\"2\"/></g><g fill=\"rgba(46,150,140,0.11)\"><rect x=\"1465\" y=\"136\" width=\"9\" height=\"28\" rx=\"2\"/><rect x=\"1456\" y=\"145\" width=\"28\" height=\"9\" rx=\"2\"/></g><g fill=\"rgba(46,150,140,0.14)\"><rect x=\"117\" y=\"472\" width=\"5\" height=\"16\" rx=\"2\"/><rect x=\"112\" y=\"477\" width=\"16\" height=\"5\" rx=\"2\"/></g><g fill=\"rgba(46,150,140,0.17)\"><rect x=\"386\" y=\"469\" width=\"7\" height=\"22\" rx=\"2\"/><rect x=\"379\" y=\"476\" width=\"22\" height=\"7\" rx=\"2\"/></g><g fill=\"rgba(46,150,140,0.08)\"><rect x=\"655\" y=\"466\" width=\"9\" height=\"28\" rx=\"2\"/><rect x=\"646\" y=\"475\" width=\"28\" height=\"9\" rx=\"2\"/></g><g fill=\"rgba(46,150,140,0.11)\"><rect x=\"927\" y=\"472\" width=\"5\" height=\"16\" rx=\"2\"/><rect x=\"922\" y=\"477\" width=\"16\" height=\"5\" rx=\"2\"/></g><g fill=\"rgba(46,150,140,0.14)\"><rect x=\"1196\" y=\"469\" width=\"7\" height=\"22\" rx=\"2\"/><rect x=\"1189\" y=\"476\" width=\"22\" height=\"7\" rx=\"2\"/></g><g fill=\"rgba(46,150,140,0.17)\"><rect x=\"1465\" y=\"466\" width=\"9\" height=\"28\" rx=\"2\"/><rect x=\"1456\" y=\"475\" width=\"28\" height=\"9\" rx=\"2\"/></g><g fill=\"rgba(46,150,140,0.08)\"><rect x=\"117\" y=\"802\" width=\"5\" height=\"16\" rx=\"2\"/><rect x=\"112\" y=\"807\" width=\"16\" height=\"5\" rx=\"2\"/></g><g fill=\"rgba(46,150,140,0.11)\"><rect x=\"386\" y=\"799\" width=\"7\" height=\"22\" rx=\"2\"/><rect x=\"379\" y=\"806\" width=\"22\" height=\"7\" rx=\"2\"/></g><g fill=\"rgba(46,150,140,0.14)\"><rect x=\"655\" y=\"796\" width=\"9\" height=\"28\" rx=\"2\"/><rect x=\"646\" y=\"805\" width=\"28\" height=\"9\" rx=\"2\"/></g><g fill=\"rgba(46,150,140,0.17)\"><rect x=\"927\" y=\"802\" width=\"5\" height=\"16\" rx=\"2\"/><rect x=\"922\" y=\"807\" width=\"16\" height=\"5\" rx=\"2\"/></g><g fill=\"rgba(46,150,140,0.08)\"><rect x=\"1196\" y=\"799\" width=\"7\" height=\"22\" rx=\"2\"/><rect x=\"1189\" y=\"806\" width=\"22\" height=\"7\" rx=\"2\"/></g><g fill=\"rgba(46,150,140,0.11)\"><rect x=\"1465\" y=\"796\" width=\"9\" height=\"28\" rx=\"2\"/><rect x=\"1456\" y=\"805\" width=\"28\" height=\"9\" rx=\"2\"/></g></svg>\n"
].join("");
var ANKETA_LOGO_PNG = [
"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"
].join("");
