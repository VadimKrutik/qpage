/*
 * Своя анкета QPortall - вторая точка входа рядом с Google Формой (форма остаётся запасной).
 *
 *  - Страница анкеты лежит на Netlify (сайт qportall-anketa). Её выкладывает «QPortall → Опубликовать анкету QPortall»:
 *    вопросы берутся из questions() (Code.gs), фоны - с листа «Фоны анкеты» (дизайн N = строка N, ссылка …/?d=N).
 *  - Страница отправляет ответы в веб-приложение этого скрипта (doPost). doPost только проверяет и складывает:
 *    файлы — в папку «Анкеты — входящие» на Диске, ответы — строкой на лист «Анкеты QPortall», и ставит разовый
 *    триггер processAnketas. Сайт собирает processAnketas: триггер всегда работает на последней сохранённой версии
 *    кода, а веб-приложение - на версии своего развертывания.
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
var BG_SHEET_HEADER = ["№", "картинка: ссылка на файл в Google Диске (или «встроенный фон 1-5»)", "что на картинке", "кому подходит", "цвет кнопок (можно пусто), например #0b6e69", "ссылка на анкету"];
var BG = { num: 1, pic: 2, about: 3, who: 4, color: 5, link: 6 };
var ANKETA_SITE = "qportall-anketa";
// Первые фоны (лист «Фоны анкеты» создаётся с ними): картинка | что на картинке | кому подходит | цвет кнопок.
// «встроенный фон N» - картинка из самой анкеты (папка anketa/bg); свои фоны - ссылкой на картинку в Google Диске.
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
// (исправления его не меняют) и попадает на «Сайты» в колонку «канал». Счётчики на листе «Каналы» - формулы.
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
  "<li>Ссылка для клиентов - <b>QPortall → Ссылки</b>. Google Форма остаётся запасной и работает как раньше.</li>",
  "<li>Анкета с другим фоном: лист <b>«Фоны анкеты»</b>, дизайн N = строка N (ссылка …/?d=N). Свой фон - ссылка на картинку в Google Диске; ",
  "после изменения листа - <b>QPortall → Опубликовать анкету QPortall</b>.</li>",
  "<li>Ответы - лист <b>«Анкеты QPortall»</b> (статус сборки). «ошибка» - <b>QPortall → Анкеты QPortall: собрать ещё раз</b>.</li>",
  "<li>Правки клиента: на «Сайты» ссылка <b>Исправить анкету</b> (её можно переслать клиенту), сколько правок использовано, ",
  "<b>лимит правок</b> (впишите своё число). Число по умолчанию, лимит новых анкет в день и выключатель - лист <b>«Настройки анкеты»</b>.</li>",
  "<li>Каналы рекламы: лист <b>«Каналы»</b>, канал N = строка N (ссылка …/?r=N, фон - номер с листа «Фоны анкеты»). ",
  "Новую строку - <b>Опубликовать анкету QPortall</b> (появятся номер, ссылка и счётчики). Оплату отмечайте на «Сайты» в колонке <b>«оплачено»</b>: Да.</li>",
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

// Лимит новых анкет за день исчерпан - одно письмо владельцу в день, чтобы потолок не забылся.
function anketaLimitMail(props, day, perDay) {
  if (props.getProperty("ANKETA_DAY_MAIL") === day) return;
  props.setProperty("ANKETA_DAY_MAIL", day);
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), "QPortall: сегодня достигнут лимит анкет (" + perDay + ")",
      "Сегодня пришло " + perDay + " новых анкет - это лимит. Следующие люди видят «Сегодня анкет очень много. Попробуйте завтра».\n\n" +
      "Поднять лимит: таблица «QPage - анкеты», лист «" + ANKETA_SETTINGS_SHEET + "», строка «Новых анкет в день».\n" +
      "Таблица: " + anketaSs().getUrl());
  } catch (e) { Logger.log("письмо о лимите: " + e); }
}

// Ответы страницы: только известные вопросы, только текст (у вопросов с галочками - список).
// Длинное обрезается по ANKETA_LIMITS; ссылка в тексте - out.__links (анкету не принимаем).
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
    // Сборка сайта занимает 1-2 минуты, а запуск скрипта ограничен 6 минутами: остальное - следующим запуском.
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
    // Входящие файлы уже скопированы в папку «<лист> - фото».
    try { var it = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty("FOLDER_ID")).getFoldersByName("Анкеты — входящие");
      if (it.hasNext()) { var sub = it.next().getFoldersByName(key.slice(0, 12)); if (sub.hasNext()) sub.next().setTrashed(true); } } catch (e) { Logger.log(e); }
    cell(ANKETA_COL.status).setValues([[STATUS_DONE + " " + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "dd.MM HH:mm") +
      (r && r.pubError ? " (сайт не опубликован: " + r.pubError + ")" : "")]]);
  } catch (e) {
    Logger.log(e.stack || e);
    cell(ANKETA_COL.status).setValues([[STATUS_ERR + ": " + String(e.message || e).slice(0, 300)]]);
  }
}

// Ответы страницы → как e.namedValues из Google Формы: { "Название вопроса": ["ответ"] }; файлы - ссылками Диска.
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

// От каких ответов зависит строка листа клиента (по умолчанию - от ответа с тем же ключом).
var ANKETA_DEPS = { languages: ["languages", "formLang"], name: ["name", "nameHe", "nameEn", "languages", "formLang"],
  lat: ["address"], lon: ["address"], workHours: ["workFrom", "workTo"], fridayHours: ["workFrom", "workTo", "fridayTo"] };

// Исправленная анкета → тот же лист. Строку, ответ на который не менялся, оставляем как есть (там могут быть
// правки владельца, например перевод); изменённые строки - заново (с переводом). Свои строки владельца
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

// Новые и удалённые фото исправленной анкеты → папка «<лист> - фото».
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
  // Фото и документы - в конец, номером после последнего (по номеру в имени идёт порядок на сайте).
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

// Лимит правок клиента: число в колонке «лимит правок» на листе «Сайты», если пусто - из настроек.
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
    // Лист из прежней версии - без новых колонок (например «канал»).
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
  notify("Готово: собрано анкет - " + n + ". Статус - на листе «" + ANKETA_SHEET + "».");
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
    "\n\nЭто анкета с общим фоном. Ссылки на анкету с другим фоном (дизайн 1, 2, 3…) - на листе «" + BG_SHEET + "»." +
    (r.notes.length ? "\n\nПроверьте:\n" + r.notes.join("\n") : ""));
}

function anketaAskApi() {
  var html = HtmlService.createHtmlOutput(
    '<div style="font:14px/1.5 Arial,sans-serif">' +
    '<p>Анкета отправляет ответы в этот скрипт. Для этого его нужно один раз развернуть как веб-приложение:</p>' +
    '<ol style="padding-left:20px">' +
    '<li>Расширения → Apps Script → справа вверху <b>Начать развертывание → Новое развертывание</b>.</li>' +
    '<li>Шестерёнка «Выберите тип» → <b>Веб-приложение</b>. Запуск от имени: <b>Я</b>. У кого есть доступ: <b>Все</b>.</li>' +
    '<li><b>Начать развертывание</b> → если Google спросит разрешения - разрешить → скопировать <b>URL веб-приложения</b> и вставить сюда.</li></ol>' +
    '<input id="t" style="width:100%;padding:6px;font:13px monospace" placeholder="https://script.google.com/macros/s/.../exec" autocomplete="off">' +
    '<p><button id="b" style="padding:6px 16px">Сохранить и опубликовать</button> <span id="m"></span></p>' +
    '<script>document.getElementById("b").onclick=function(){var m=document.getElementById("m");m.textContent="Публикую, это займёт минуту…";' +
    'google.script.run.withSuccessHandler(function(r){m.innerHTML=r;}).withFailureHandler(function(e){m.textContent=e.message;})' +
    '.saveAnketaApi(document.getElementById("t").value);};</script></div>').setWidth(600).setHeight(420);
  SpreadsheetApp.getUi().showModalDialog(html, "QPortall - анкета");
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
// Колонки ищутся по заголовку - их можно двигать.
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

// Формулы с запятыми; в таблице с русскими настройками Google ждёт «;» (проверено 28.10: с запятыми - #ERROR!).
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
      else notes.push("«" + BG_SHEET + "», строка " + num + ": встроенного фона " + builtin[1] + " нет (есть 1-5)");
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
  // Каналы: фон канала - номер строки листа «Фоны анкеты».
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
  // Метка версии у файлов - чтобы браузер не взял старую анкету из кеша.
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
  // Номера строк и готовые ссылки - рядом с каждой картинкой.
  for (var i = 1; i < bgRows.length; i++) {
    var num = String(i);
    if (bgRows[i][BG.num - 1] !== num) bgSheet.getRange(i + 1, BG.num, 1, 1).setValues([[num]]);
    var link = groups[num] ? url + "/?d=" + num : "";
    var cellR = bgSheet.getRange(i + 1, BG.link);
    if (link) cellR.setRichTextValue(SpreadsheetApp.newRichTextValue().setText(link).setLinkUrl(link).build());
    else if (bgRows[i][BG.link - 1]) cellR.setValues([[""]]);
  }
  // Каналы: номер, ссылка …/?r=N и счётчики - у каждой строки с названием.
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
