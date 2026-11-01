/*
 * Своя анкета QPortall в имитации Google (та же, что в apps-script-mock.js, + файл QPortall-4-anketa.gs):
 * публикация страницы → новая анкета (doPost) → сборка (processAnketas) → лист и сайт;
 * личная ссылка (doGet) → исправление → тот же лист; лимиты и защита.
 *   node build-gs.js && node tests/anketa-mock.js
 */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os");
const src = fs.readFileSync(path.join(__dirname, "apps-script-mock.js"), "utf8");
let harness = src.slice(0, src.indexOf("const checks = [];"));
const list = '"QPortall-3-shablon2.gs"';
if (!harness.includes(list)) throw new Error("apps-script-mock.js изменился: не найден список файлов dist");
harness = harness.replace(list, list + ', "QPortall-4-anketa.gs"').replace('"QPortall-5-yadro.gs"', '"QPortall-5-yadro.gs", "QPortall-6-stranica.gs"');
const me = fs.readFileSync(__filename, "utf8");
const tests = me.slice(me.lastIndexOf("/* ===== ПРОВЕРКИ ===== */"));
const tmp = path.join(os.tmpdir(), "qp-anketa-mock-" + process.pid + ".js");
fs.writeFileSync(tmp, harness.replace(/__dirname/g, JSON.stringify(__dirname)) + "\n" + tests.replace(/__dirname/g, JSON.stringify(__dirname)));
const sample = path.join(__dirname, "sample");
process.argv = [process.argv[0], tmp, path.join(sample, "answers.json"), path.join(sample, "translations.json"), path.join(os.tmpdir(), "qp-anketa-out.json")];
try { require(tmp); } finally { fs.unlinkSync(tmp); }
return; // проверки ниже выполняются в собранном файле, рядом с имитацией

/* ===== ПРОВЕРКИ ===== */
const answers0 = answers;
{
  const checks = [];
  const ok = (name, cond, info = "") => checks.push({ name, pass: !!cond, info });
  process.on("exit", () => {
    const failed = checks.filter((c) => !c.pass);
    checks.forEach((c) => console.log((c.pass ? "PASS " : "FAIL ") + c.name + (c.pass ? "" : "\n     " + String(c.info).slice(0, 600))));
    console.log("\n" + (checks.length - failed.length) + "/" + checks.length + " passed");
    if (failed.length) process.exitCode = 1;
  });
  // Чего нет в общей имитации.
  ctx.Utilities.base64Decode = (s) => Int8Array.from(Buffer.from(s, "base64"));
  ctx.ScriptApp.getService = () => ({ getUrl: () => null });
  ctx.LockService.getUserLock = () => ({ tryLock: () => !lk.userBusy, releaseLock: () => {} });
  // Файл, созданный скриптом, тоже доступен по id (в общей имитации — только загруженные формой).
  const cf = Folder.prototype.createFile;
  Folder.prototype.createFile = function (b) { const f = cf.call(this, b); allFiles[f.id] = f; return f; };
  let uuids = 0;
  ctx.Utilities.getUuid = () => require("crypto").createHash("md5").update("u" + ++uuids).digest("hex").replace(/^(.{8})(.{4})(.{4})(.{4})/, "$1-$2-$3-$4-");
  const zips = [];
  const zip0 = ctx.Utilities.zip;
  ctx.Utilities.zip = (blobs, name) => { zips.push({ name, blobs }); return zip0(blobs, name); };
  let translations = 0;
  const tr0 = ctx.LanguageApp.translate;
  ctx.LanguageApp.translate = (...a) => { translations++; return tr0(...a); };
  const run = (fn, ...a) => ctx[fn](...a);
  const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).body);
  const get = (p) => JSON.parse(ctx.doGet({ parameter: p }).body);
  const sample = path.join(path.dirname(answersFile));
  const media = path.join(sample, "media");
  const file = (name, type) => ({ name, type, data: fs.readFileSync(path.join(media, name)).toString("base64") });

  uiAvailable = true;
  ctx.setup();
  uiAvailable = false;
  props.NETLIFY_TOKEN = "GOOD";

  // --- Публикация страницы ---
  uiAvailable = true; alerts.length = 0;
  ctx.publishAnketa();
  ok("публикация без веб-приложения: окно с шагами развертывания", alerts.length === 1 && alerts[0].includes("Новое развертывание") && alerts[0].includes("saveAnketaApi"), alerts[0]);
  ctx.ScriptApp.getService = () => ({ getUrl: () => "https://script.google.com/macros/s/OLD_DEPLOYMENT/exec" });
  alerts.length = 0; ctx.publishAnketa();
  ok("есть старое развертывание, но адрес не вставлен — всё равно спрашивает адрес (не берёт старое)", alerts.length === 1 && alerts[0].includes("saveAnketaApi") && !props.ANKETA_API, alerts[0]);
  ctx.ScriptApp.getService = () => ({ getUrl: () => null });
  uiAvailable = false;
  // --- Анкета на трёх языках: у каждого текста есть иврит и английский, без длинного тире ---
  {
    const win = {};
    new Function("window", ctx.ANKETA_PAGE["i18n.js"])(win);
    const cfg = { questions: ctx.questions().map((q) => Object.assign({}, q, q.gateOf ? { gatePage: q.gateOf.page } : {})), colors: ctx.COLORS,
      designs: ["showcase", "strict", "classic"].map((k) => ({ key: k, label: ctx.QPageCore.DESIGNS[k].label })) };
    const need = require(path.join(__dirname, "anketa-i18n-keys.js"))(cfg);
    ["he", "en"].forEach((l) => {
      const d = win.QP_I18N[l] || {};
      const miss = need.concat(l === "he" ? ["English"] : []).filter((k) => !d[k]);
      ok("анкета " + l + ": все тексты переведены (" + need.length + ")", !miss.length, miss.join(" | "));
      const dash = Object.keys(d).filter((k) => /\u2014/.test(d[k]));
      ok("анкета " + l + ": в переводах нет длинного тире", !dash.length, dash.join(" | "));
      const vars = Object.keys(d).filter((k) => (k.match(/\{\w+\}/g) || []).sort().join() !== (d[k].match(/\{\w+\}/g) || []).sort().join());
      ok("анкета " + l + ": подстановки {n} на месте", !vars.length, vars.join(" | "));
    });
    ok("страница анкеты подключает i18n.js до anketa.js", /i18n\.js\?v=dev[\s\S]*anketa\.js\?v=dev/.test(ctx.ANKETA_PAGE["index.html"]));
  }
  let err = null;
  try { ctx.saveAnketaApi("https://evil.example/exec"); } catch (e) { err = e.message; }
  ok("чужой адрес веб-приложения не принимается", err && err.includes("script.google.com"), err);
  // Лист фонов: строка 1 — картинка на Диске, строка 2 — сломанная ссылка.
  const bgFile = driveFile("fon.jpg", fs.readFileSync(path.join(media, "photo1.jpg")), "image/jpeg"); allFiles[bgFile.id] = bgFile;
  const bgId = bgFile.id.padEnd(25, "x"); allFiles[bgId] = bgFile; bgFile.id = bgId;
  const bgSheet = ctx.anketaBgSheet(ss);
  bgSheet.getRange(2, 1, 2, 5).setValues([["", "https://drive.google.com/file/d/" + bgId + "/view?usp=sharing", "строгий", "юрист", "#1d5fa6"],
    ["7", "https://drive.google.com/file/d/NOPE_NOPE_NOPE_NOPE_NOPE/view", "яркий", "брови", "розовый"]]);
  // Каналы: 1 — фон 3, 2 — несуществующий фон 9, 3 — без названия (пусто).
  const chSheet = ctx.anketaChannelSheet(ss);
  ok("лист «Каналы» создан с примером", chSheet.cells.length === 2 && chSheet.cells[1][1].startsWith("Пример"), JSON.stringify(chSheet.cells));
  chSheet.getRange(2, 1, 3, 3).setValues([["", "Instagram", "3"], ["", "Facebook", "9"], ["", "", ""]]);
  const html = ctx.saveAnketaApi("https://script.google.com/macros/s/AKfyc_TEST-1/exec");
  const nsite = Object.values(nl.sites).find((s) => s.name === "qportall-anketa");
  const z = zips[zips.length - 1];
  const names = z ? z.blobs.map((b) => b.name) : [];
  ok("анкета выложена на Netlify (сайт qportall-anketa)", nsite && nsite.deploys.length === 1 && props.ANKETA_URL === nsite.ssl_url && html.includes(nsite.ssl_url), html);
  ok("в выкладке страница, стили, переводы, скрипт, настройки, логотип, заголовки, фон 1", ["index.html", "anketa.css", "i18n.js", "anketa.js", "config.js", "logo.png", "_headers", "bg/1.jpg", "bg/1.svg", "bg/5.svg"].every((n) => names.includes(n)) && names.length === 13, names.join());
  const cfgText = String(z.blobs.find((b) => b.name === "config.js").data);
  const cfg = JSON.parse(cfgText.replace(/^window\.QP_ANKETA = /, "").replace(/;\s*$/, ""));
  ok("config.js: адрес веб-приложения, все вопросы анкеты, цвета, варианты вида", cfg.api === "https://script.google.com/macros/s/AKfyc_TEST-1/exec" &&
    cfg.questions.filter((q) => q.key).length === ctx.questions().filter((q) => q.key).length && cfg.colors.length === 6 && cfg.designs.length === 3, cfgText.slice(0, 200));
  ok("config.js: фон 1 (Диск) с цветом, сломанного 2 нет, 3–5 встроенные", JSON.stringify(cfg.groups) === '{"1":{"img":"bg/1.jpg","color":"#1d5fa6"},"3":{"img":"bg/3.svg","color":"#c2185b"},"4":{"img":"bg/4.svg","color":"#0e5a9c"},"5":{"img":"bg/5.svg","color":"#1f7a72"}}', JSON.stringify(cfg.groups));
  ok("лист фонов создан с 5 встроенными фонами и описаниями", ss.getSheetByName("Фоны анкеты").cells.length === 6 && bgSheet.cells[5][1] === "встроенный фон 5" && bgSheet.cells[5][3].includes("медицина"), JSON.stringify(bgSheet.cells[5]));
  ok("config.js: канал 1 → фон 3, канал с несуществующим фоном пропущен", JSON.stringify(cfg.channels) === '{"1":"3"}', JSON.stringify(cfg.channels));
  ok("«Каналы»: номера, ссылки …/?r=N и формулы-счётчики у строк с названием", chSheet.cells[1][0] === "1" && chSheet.cells[2][0] === "2" && chSheet.cells[3][0] === "3" &&
    chSheet.links[1][3] === nsite.ssl_url + "/?r=1" && chSheet.links[2][3] === nsite.ssl_url + "/?r=2" && !chSheet.cells[3][3] &&
    /^=IFERROR\(ARRAYFORMULA\(SUM\(--\(TO_TEXT\(INDEX\('Анкеты QPortall'!A2:AZ,0,MATCH\("канал",'Анкеты QPortall'!A1:AZ1,0\)\)\)=TO_TEXT\(\$A2\)\)\)\),0\)$/.test(chSheet.cells[1][4]) &&
    chSheet.cells[1][5].includes("MATCH(\"оплачено\",'Сайты'!A1:AZ1,0)") && chSheet.cells[2][4].includes("$A3") && !chSheet.cells[3][4], JSON.stringify(chSheet.cells));
  const fake = { set: null, setFormulas(v) { this.set = v[0]; return this; }, getDisplayValues() { return [this.set.map((f) => (/,/.test(f.replace(/"[^"]*"/g, "")) ? "#ERROR!" : "0"))]; } };
  ctx.anketaSetFormulas(fake, ctx.anketaChannelFormulas(2));
  ok("таблица с русскими настройками: формулы переписаны с «;», запятые в строках не тронуты", fake.set.every((f) => !/,/.test(f.replace(/"[^"]*"/g, "")) && f.includes(";0;MATCH(")), JSON.stringify(fake.set));
  ok("про несуществующий фон канала сказано", html.includes("«Каналы», строка 2: фона 9 нет"), html);
  ok("неверный цвет — замечание", html.includes("строка 2: цвет пишется так"), html);
  const idx = String(z.blobs.find((b) => b.name === "index.html").data);
  ok("index.html: метка версии вместо ?v=dev", !idx.includes("?v=dev") && /config\.js\?v=\w{6,}/.test(idx), idx.match(/config\.js[^"]*/));
  ok("лист фонов: номера строк и готовая ссылка …/?d=1; у сломанной строки ссылки нет и номер исправлен", bgSheet.cells[1][0] === "1" && bgSheet.cells[2][0] === "2" &&
    bgSheet.links[1][5] === nsite.ssl_url + "/?d=1" && !(bgSheet.cells[2][5]), JSON.stringify(bgSheet.cells));
  ok("публикация: про сломанную картинку сказано", html.includes("строка 2: картинку не удалось взять"), html);
  ctx.saveAnketaApi("https://script.google.com/macros/s/AKfyc_TEST-1/exec");
  ok("повторная публикация без изменений не тратит кредиты Netlify", nsite.deploys.length === 1, nsite.deploys.length);
  ok("«Заказать сайт» на сайтах клиентов → анкета без фона", ctx.orderUrl() === nsite.ssl_url + "/", ctx.orderUrl());
  ok("служебные листы созданы", ["Анкеты QPortall", "Настройки анкеты", "Фоны анкеты"].every((n) => ss.getSheetByName(n)), ss.sheets.map((s) => s.name).join());

  // --- Новая анкета ---
  const qs = ctx.questions().filter((q) => q.key);
  const answers = {};
  qs.forEach((q) => { if (answers0[q.key] != null) answers[q.key] = q.type === "checkbox" ? String(answers0[q.key]).split(", ") : answers0[q.key]; });
  const filesNew = { logo: [file("logo.png", "image/png")], main: [file("photo2.jpg", "image/jpeg")], portrait: [file("photo1.jpg", "image/jpeg")],
    photos: [file("photo1.jpg", "image/jpeg"), file("photo2.jpg", "image/jpeg"), file("photo3.jpg", "image/jpeg")] };
  ok("робот (заполнена ловушка) — отказ", post({ hp: "http://spam", t: 60000, answers, files: {} }).error === "bot");
  ok("слишком быстро (меньше 20 с) — отказ", post({ t: 3000, answers, files: {} }).error === "fast");
  const ank = ss.getSheetByName("Анкеты QPortall");
  ok("отказы не оставили строк", ank.getLastRow() === 1, ank.getLastRow());
  const r1 = post({ t: 95000, design: "1", ref: "2x", answers, files: filesNew });
  ok("новая анкета принята: личный ключ, осталось 3 правки", r1.ok && /^[0-9a-f]{40}$/.test(r1.key) && r1.editsLeft === 3, JSON.stringify(r1));
  const row1 = () => ank.cells.find((r) => r[0] === r1.key);
  ok("строка на листе «Анкеты QPortall»: ждёт сборки, дизайн 1, ответы JSON", row1() && row1()[5] === "ждёт сборки" && row1()[6] === "1" && JSON.parse(row1()[7]).name === answers.name, JSON.stringify(row1()).slice(0, 300));
  ok("канал 2 записан с анкетой", row1()[10] === "2" && ank.cells[0][10] === "канал", JSON.stringify(row1().slice(10)));
  ok("поставлен разовый триггер сборки (один)", triggers.filter((t) => t.fn === "processAnketas").length === 1);
  const inbox = driveRoot.folders.find((f) => f.name === "QPage — сайты").folders.find((f) => f.name === "Анкеты — входящие");
  ok("файлы анкеты — во «входящих» на Диске", inbox && inbox.folders[0].files.length === 6, inbox && inbox.folders[0].files.map((f) => f.name).join());
  const sheetsBefore = ss.sheets.length;
  run("processAnketas");
  ok("сборка: триггер снят", !triggers.some((t) => t.fn === "processAnketas"));
  const tab = row1()[1];
  ok("сборка: лист клиента создан, статус «готово»", tab && ss.getSheetByName(tab) && ss.sheets.length === sheetsBefore + 1 && /^готово /.test(row1()[5]), JSON.stringify(row1().slice(0, 7)));
  // Лист такой же, как из Google Формы.
  const named = {};
  qs.forEach((q) => { if (answers0[q.key] != null) named[q.title] = [answers0[q.key]]; });
  ok("лист клиента из анкеты = лист из Google Формы", JSON.stringify(ctx.siteRows(ctx.answersByKey(named))) === JSON.stringify(ss.getSheetByName(tab).getDataRange().getDisplayValues().slice(1)), "");
  const sitesRoot = driveRoot.folders.find((f) => f.name === "QPage — сайты");
  const photoDir = () => sitesRoot.folders.find((f) => f.name === tab + " — фото");
  const mediaNames = () => photoDir().files.filter((f) => !f.trashed).map((f) => f.name).join();
  ok("фото клиента в папке «<лист> — фото» под теми же именами, что из Google Формы", mediaNames() === "logo.png,photo-01-photo1.jpg,photo-02-photo2.jpg,photo-03-photo3.jpg,main.jpg,portrait.jpg", mediaNames());
  ok("«входящие» этой анкеты — в корзине", inbox.folders[0].trashed);
  const tabSite = Object.values(nl.sites).find((s) => s.name === tab);
  ok("сайт клиента собран и выложен", tabSite && tabSite.deploys.length === 1 && sitesRoot.folders.some((f) => f.name === tab && !f.trashed));
  const sites = ss.getSheetByName("Сайты");
  const head = sites.cells[0];
  const sRow = () => sites.cells.find((r) => r[0] === tab);
  const sIdx = () => sites.cells.findIndex((r) => r[0] === tab);
  const cE = head.indexOf("анкета: исправить"), cU = head.indexOf("правок использовано"), cL = head.indexOf("лимит правок");
  const cC = head.indexOf("канал"), cP = head.indexOf("оплачено");
  ok("«Сайты»: колонки «анкета: исправить», «правок использовано», «лимит правок», «канал», «оплачено» после колонок сайта", cE === 9 && cU === 10 && cL === 11 && cC === 12 && cP === 13, head.join(" | "));
  ok("«Сайты»: канал 2, «оплачено» пусто (ставит владелец)", sRow()[cC] === "2" && !sRow()[cP], JSON.stringify(sRow()));
  ok("«Сайты»: ссылка «Исправить анкету» с личным ключом, 0 правок, лимит 3", sRow()[cE] === "Исправить анкету" && sites.links[sIdx()][cE] === nsite.ssl_url + "/?edit=" + r1.key &&
    sRow()[cU] === "0" && sRow()[cL] === "3", JSON.stringify(sRow()));

  // --- Личная ссылка ---
  const l1 = get({ anketa: "load", edit: r1.key });
  ok("личная ссылка: ответы, фото с миниатюрами, осталось 3", l1.ok && l1.answers.phone === answers.phone && l1.editsLeft === 3 &&
    l1.media.map((m) => m.kind).join() === "logo,main,photos,photos,photos,portrait" && l1.media.every((m) => /^data:image\/(png|jpeg);base64,/.test(m.thumb)), JSON.stringify(l1.media.map((m) => [m.kind, m.name, String(m.thumb).slice(0, 30)])) + l1.editsLeft);
  ok("неверный ключ — отказ", get({ anketa: "load", edit: "0".repeat(40) }).error === "key" && post({ edit: "abc", answers }).error === "key");
  ok("без ключа генератор (token) по-прежнему закрыт", get({}).error === "bad token");

  // Владелец поправил лист: перевод одной строки и своя строка siteUrl.
  const sh = ss.getSheetByName(tab);
  const rowOf = (k) => sh.cells.findIndex((r) => r[0] === k);
  sh.cells[rowOf("kind")][4] = "ИВРИТ ОТ ВЛАДЕЛЬЦА";
  sh.cells[rowOf("about")][4] = "ПЕРЕВОД ВЛАДЕЛЬЦА";
  sh.cells.push(["siteUrl", "свой домен", "https://lana.co.il", "", "", "", ""]);
  const rowsBefore = sh.cells.length;

  // --- Исправление 1: новый телефон, без второго фото, новое фото, новый логотип ---
  const photo2 = l1.media.find((m) => m.name === "photo-02-photo2.jpg").id;
  const oldLogo = l1.media.find((m) => m.kind === "logo").id;
  const a2 = Object.assign({}, answers, { phone: "052-999-8877" });
  translations = 0;
  const r2 = post({ edit: r1.key, ref: "7", answers: a2, files: { photos: [file("photo3.jpg", "image/jpeg")], logo: [file("logo.png", "image/png")] }, remove: [photo2, oldLogo] });
  ok("исправление принято, осталось 2", r2.ok && r2.key === r1.key && r2.editsLeft === 2, JSON.stringify(r2));
  run("processAnketas");
  ok("исправление → тот же лист, нового листа нет", ss.sheets.length === sheetsBefore + 1 && row1()[1] === tab && /^готово /.test(row1()[5]), row1()[5]);
  ok("исправление: телефон заменён", sh.cells[rowOf("phone")][2] === "052-999-8877", sh.cells[rowOf("phone")]);
  ok("исправление: правки владельца в неизменённых строках и своя строка siteUrl на месте", sh.cells[rowOf("kind")][4] === "ИВРИТ ОТ ВЛАДЕЛЬЦА" &&
    sh.cells[rowOf("about")][4] === "ПЕРЕВОД ВЛАДЕЛЬЦА" && sh.cells[rowOf("siteUrl")][2] === "https://lana.co.il" && sh.cells.length === rowsBefore, sh.cells.length + " / " + rowsBefore);
  ok("исправление: неизменённые тексты заново не переводятся", translations === 0, translations);
  ok("исправление: фото 2 убрано, новое — в конец, логотип заменён", mediaNames() === "photo-01-photo1.jpg,photo-03-photo3.jpg,main.jpg,portrait.jpg,logo.png,photo-04-photo3.jpg", mediaNames());
  ok("исправление: сайт выложен заново по тому же адресу", tabSite.deploys.length === 2, tabSite.deploys.length);
  ok("«Сайты»: правок использовано 1", sRow()[cU] === "1", sRow()[cU]);
  ok("исправление: канал остался 2", row1()[10] === "2" && sRow()[cC] === "2", row1()[10] + " " + sRow()[cC]);

  // --- Исправление 2: другой текст «Коротко о вас», прайс выключен ---
  const a3 = Object.assign({}, a2, { about: "Новый текст о студии.", wantPrices: "Нет" });
  ok("до: строка прайса есть", rowOf("pricelist") > 0, answers.wantPrices);
  translations = 0;
  ok("исправление 2 принято, осталось 1", post({ edit: r1.key, answers: a3 }).editsLeft === 1);
  run("processAnketas");
  ok("изменённый текст переведён заново (правка владельца в нём заменена)", sh.cells[rowOf("about")][3] === "Новый текст о студии." && sh.cells[rowOf("about")][4] !== "ПЕРЕВОД ВЛАДЕЛЬЦА" && translations === 2, translations + " " + sh.cells[rowOf("about")]);
  ok("прайс выключен — строки прайса больше нет, лишние строки внизу пустые", rowOf("pricelist") === -1 && sh.cells.slice(-1)[0].every((c) => c === ""), "");

  // --- Лимит правок ---
  sites.cells[sIdx()][cL] = "2";
  ok("лимит 2 исчерпан — отказ, данные не тронуты", post({ edit: r1.key, answers: a3 }).error === "edits" && row1()[4] === "2", row1()[4]);
  ok("личная ссылка: осталось 0", get({ anketa: "load", edit: r1.key }).editsLeft === 0);
  sites.cells[sIdx()][cL] = "5";
  ok("владелец поставил 5 — правка снова принимается", post({ edit: r1.key, answers: a3 }).editsLeft === 2);
  run("processAnketas");
  sites.cells[sIdx()][cL] = "";
  ok("пустой лимит — по умолчанию из настроек (3): правок больше нет", post({ edit: r1.key, answers: a3 }).error === "edits");

  // --- Лимит в день и выключатель ---
  const set = ss.getSheetByName("Настройки анкеты");
  const setRow = (label) => set.cells.findIndex((r) => String(r[0]).startsWith(label));
  set.cells[setRow("Новых анкет в день")][1] = "1";
  const mails = [];
  ctx.MailApp = { sendEmail: (to, subj, body) => mails.push(typeof to === "object" ? { to: to.to, subj: to.subject, body: to.body, replyTo: to.replyTo } : { to, subj, body }) };
  ctx.Session = { getEffectiveUser: () => ({ getEmail: () => "owner@example.com" }) };
  ok("лимит новых анкет в день", post({ t: 60000, answers, files: {} }).error === "limit");
  post({ t: 60000, answers, files: {} });
  ok("лимит: одно письмо владельцу за день (не на каждую попытку)", mails.length === 1 && mails[0].to === "owner@example.com" && mails[0].subj.includes("лимит анкет (1)") && mails[0].body.includes("Настройки анкеты"), JSON.stringify(mails));
  set.cells[setRow("Новых анкет в день")][1] = "20";
  set.cells[setRow("Анкета принимает ответы")][1] = "Нет";
  ok("выключатель: анкета не принимает ответы", post({ t: 60000, answers, files: {} }).error === "closed");
  set.cells[setRow("Анкета принимает ответы")][1] = "Да";
  lk.busy = true;
  const rb = post({ t: 60000, answers: Object.assign({}, answers, { name: "Пока собирается" }), files: {} });
  ok("пока идёт сборка (общий замок занят), анкета всё равно принимается", rb.ok, JSON.stringify(rb));
  lk.busy = false;
  ank.cells = ank.cells.filter((r) => r[0] !== rb.key);
  lk.userBusy = true;
  ok("замок приёма занят 30 с — «busy», страница попросит повторить", post({ t: 60000, answers, files: {} }).error === "busy");
  lk.userBusy = false;
  ok("ссылка в тексте — отказ «links»", post({ t: 60000, answers: Object.assign({}, answers, { tagline: "Лучшие цены на spam-shop.com" }), files: {} }).error === "links");
  ok("ссылка в поле-ссылке (видео) и почта — можно", (() => { const c = ctx.anketaClean({ video: "https://youtu.be/x", email: "a@b.com", facts: "1\n2\n3\n4\n5\n6", tagline: "x".repeat(400) }); return !c.__links && c.facts.split("\n").length === 3 && c.tagline.length === 150; })());
  ok("без названия и телефона — отказ", post({ t: 60000, answers: { name: "X" } }).error === "bad");
  ok("мусор вместо JSON — отказ", JSON.parse(ctx.doPost({ postData: { contents: "<html>" } }).body).error === "bad");

  // --- Ошибка сборки и «собрать ещё раз» ---
  const namedRows = sites.cells.filter((r) => String(r[0] || "").trim()).length;
  for (let i = 0; i < 25; i++) sites.cells[i] ||= [];
  sites.cells[25] = ["", "", " "]; // невидимый пробел далеко внизу (так было у Vadim в C28)
  const r4 = post({ t: 60000, answers: Object.assign({}, answers, { name: "Вторая студия", nameEn: "Second", email: "client@example.com", whatsapp: "052-111-2233" }), files: {} });
  const row4 = () => ank.cells.find((r) => r[0] === r4.key);
  const bs = ctx.buildSiteSheet;
  ctx.buildSiteSheet = () => { throw new Error("Диск недоступен"); };
  run("processAnketas");
  ok("сбой сборки: статус «ошибка: …», анкета не потеряна", row4()[5] === "ошибка: Диск недоступен", row4()[5]);
  ctx.buildSiteSheet = bs;
  uiAvailable = true; alerts.length = 0;
  ctx.retryAnketas();
  uiAvailable = false;
  ok("«Сайты»: новая строка сразу под последней, а не под пробелом внизу", sites.cells.findIndex((r) => r[0] === "second") === namedRows, sites.cells.findIndex((r) => r[0] === "second") + " / " + namedRows);
  const m4 = mails.filter((m) => m.subj.includes("новая анкета - Вторая студия"));
  ok("письмо владельцу о новой анкете: телефон, сайт, ссылка исправлений, лист", m4.length === 1 && m4[0].to === "owner@example.com" &&
    m4[0].body.includes("Новая анкета: Вторая студия") && m4[0].body.includes("Сайт: ") && m4[0].body.includes("/?edit=" + r4.key) && m4[0].body.includes("лист «second»") && !m4[0].body.includes("—"), JSON.stringify(m4));
  // --- Письмо клиенту уходит само после первой публикации ---
  const auto = mails.filter((m) => m.to === "client@example.com");
  const sAuto = ss.getSheetByName("Сайты"), aRow = sAuto.cells.findIndex((r) => r[0] === "second"), aCol = sAuto.cells[0].indexOf("ссылка клиенту");
  ok("письмо клиенту ушло само сразу после сборки, отметка «письмо само <дата>»", auto.length === 1 && /^Ваш сайт готов/.test(auto[0].subj) &&
    auto[0].body.includes("/?edit=" + r4.key) && aCol > 0 && /^письмо само \d\d\.\d\d/.test(sAuto.cells[aRow][aCol]), JSON.stringify(auto) + " " + (sAuto.cells[aRow] || [])[aCol]);
  // --- Ссылка клиенту: окно с письмом и WhatsApp, письмо клиенту, отметка на «Сайты» ---
  const savedAlerts = alerts.slice();
  ss.setActiveSheet(ss.getSheetByName("second"));
  uiAvailable = true; alerts.length = 0; ctx.sendLinkToClient(); uiAvailable = false;
  const dlg = alerts[0] || "";
  const sitesNow = ss.getSheetByName("Сайты");
  const cRow = sitesNow.cells.findIndex((r) => r[0] === "second");
  const siteLink = sitesNow.links[cRow][7];
  ok("ссылка клиенту: окно с адресом сайта, личной ссылкой, кнопкой письма и WhatsApp", !!siteLink && dlg.includes(siteLink) &&
    dlg.includes("/?edit=" + r4.key) && dlg.includes("sendClientEmail") && /https:\/\/wa\.me\/9725\d+\?text=/.test(dlg) && !dlg.includes("—"), dlg.slice(0, 600));
  const nm = mails.length;
  const res = ctx.sendClientEmail("second");
  const cm = mails[nm] || {};
  ok("письмо клиенту: на его почту, тема «Ваш сайт готов», ссылки внутри", mails.length === nm + 1 && cm.to === "client@example.com" &&
    /^Ваш сайт готов/.test(cm.subj) && cm.body.includes(siteLink) && cm.body.includes("/?edit=" + r4.key) && /отправлено/.test(res), JSON.stringify(cm));
  const cCol = sitesNow.cells[0].indexOf("ссылка клиенту");
  ok("повторное письмо дописывается строкой «письмо <дата>»", cCol > 0 && /\nписьмо \d\d\.\d\d/.test(sitesNow.cells[cRow][cCol]), sitesNow.cells[cRow][cCol]);
  ctx.markClientSent("second", "WhatsApp");
  ok("WhatsApp дописывается второй строкой", /\nWhatsApp \d/.test(sitesNow.cells[cRow][cCol]), sitesNow.cells[cRow][cCol]);
  ss.setActiveSheet(sitesNow); sitesNow.activeRow = 1;
  uiAvailable = true; alerts.length = 0; ctx.sendLinkToClient(); uiAvailable = false;
  ok("без выбранного клиента - подсказка", /Откройте лист клиента/.test(alerts[0] || ""), alerts[0]);
  // --- Пауза отправки: письмо ждёт, после снятия паузы уходит; исправление анкеты письмо не повторяет ---
  uiAvailable = true; alerts.length = 0; ctx.toggleClientPause(); uiAvailable = false;
  ok("пауза включена: окно и пункт меню «снять»", props.CLIENT_PAUSE === "1" && /Пауза включена/.test(alerts[0] || "") && !(alerts[0] || "").includes("—"), alerts[0]);
  {
    const cc = sitesNow.cells[0].indexOf("ссылка клиенту") + 1;
    ok("пауза видна: вкладка «Сайты» красная, заголовок колонки писем красный с заметкой", sitesNow.tab === "#d32f2f" && sitesNow.bg["1:" + cc] === "#ffcdd2" && /ПАУЗА ВКЛЮЧЕНА/.test(sitesNow.notes["1:" + cc]), sitesNow.tab + " " + JSON.stringify(sitesNow.bg));
    ctx.arrangeSheets(ss);
    ok("пауза видна и после упорядочивания вкладок", sitesNow.tab === "#d32f2f", sitesNow.tab);
  }
  const r5 = post({ t: 60000, answers: Object.assign({}, answers, { name: "Третья студия", nameEn: "Third", email: "third@example.com" }), files: {} });
  run("processAnketas");
  const pRow = sitesNow.cells.findIndex((r) => r[0] === "third");
  ok("пауза: письмо третьему клиенту не ушло, отметка «ждёт (пауза)»", pRow > 0 && !mails.some((m) => m.to === "third@example.com") && sitesNow.cells[pRow][cCol] === "ждёт (пауза)", (sitesNow.cells[pRow] || [])[cCol]);
  uiAvailable = true; alerts.length = 0; ctx.toggleClientPause(); uiAvailable = false;
  const third = mails.filter((m) => m.to === "third@example.com");
  ok("пауза снята: письмо ушло, отметка «письмо после паузы <дата>»", !props.CLIENT_PAUSE && third.length === 1 && /Отправлено писем клиентам: 1/.test(alerts[0] || "") &&
    /^письмо после паузы \d\d\.\d\d/.test(sitesNow.cells[pRow][cCol]), (alerts[0] || "") + " | " + sitesNow.cells[pRow][cCol]);
  ok("пауза снята: вкладка снова тёмная, заголовок обычный", sitesNow.tab === "#37474f" && !sitesNow.bg["1:" + (sitesNow.cells[0].indexOf("ссылка клиенту") + 1)], sitesNow.tab);
  post({ edit: r5.key, answers: Object.assign({}, answers, { name: "Третья студия", nameEn: "Third", email: "third@example.com", phone: "052-000-1111" }) });
  run("processAnketas");
  ok("исправление анкеты: письмо «сайт готов» не повторяется", mails.filter((m) => m.to === "third@example.com").length === 1);
  // Письмо на основном языке сайта: иврит
  const shT = ss.getSheetByName("third"), lr = shT.cells.findIndex((r) => r[0] === "languages");
  const keepLang = shT.cells[lr][2]; shT.cells[lr][2] = "he,ru";
  const heMsg = ctx.clientMessage(ctx.clientInfo(ss, "third"));
  ok("письмо клиенту с сайтом на иврите - на иврите, ссылка для исправлений с &lang=he", heMsg.startsWith("שלום!") && heMsg.includes("&lang=he") && !heMsg.includes("Здравствуйте"), heMsg);
  shT.cells[lr][2] = keepLang;
  alerts.length = 0; alerts.push(...savedAlerts);

  // --- Бесплатный год: дата при первой публикации, письмо за 30 дней, один раз ---
  const fCol = sitesNow.cells[0].indexOf("бесплатно до");
  const inYear = new Date(); inYear.setFullYear(inYear.getFullYear() + 1);
  const fmt = (d) => String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear();
  ok("«бесплатно до» = через год после первой публикации", fCol > 0 && sitesNow.cells[cRow][fCol] === fmt(inYear), sitesNow.cells[cRow][fCol]);
  const nf = mails.length;
  ctx.checkHostingEnds();
  ok("до конца больше 30 дней - писем нет", mails.length === nf);
  const soon = new Date(); soon.setDate(soon.getDate() + 10);
  sitesNow.cells[cRow][fCol] = fmt(soon);
  ctx.checkHostingEnds(); ctx.checkHostingEnds();
  ok("за 10 дней - одно письмо владельцу (второй раз не пишет)", mails.length === nf + 1 && mails[nf].subj.includes("бесплатный год") &&
    mails[nf].body.includes("second - до " + fmt(soon)) && mails[nf].body.includes("осталось 10 дн."), JSON.stringify(mails.slice(nf)));
  const nEdit = mails.length;
  post({ edit: r4.key, answers: Object.assign({}, answers, { name: "Вторая студия" }) });
  run("processAnketas");
  ok("письмо владельцу об исправлении анкеты", mails.length === nEdit + 1 && mails[nEdit].subj.includes("анкету исправили") && mails[nEdit].body.startsWith("Анкету исправили"), JSON.stringify(mails.slice(nEdit)));
  ok("«собрать ещё раз»: собрано, лист second", /^готово/.test(row4()[5]) && row4()[1] === "second" && alerts[0].includes("собрано анкет - 1"), row4()[5] + " " + alerts[0]);

  // --- Google Форма работает как раньше ---
  const n0 = ss.sheets.length;
  ctx.onFormSubmit({ namedValues: named });
  ok("Google Форма (запасная) по-прежнему делает лист и сайт", ss.sheets.length === n0 + 1);
  uiAvailable = true; alerts.length = 0; ctx.showLinks(); uiAvailable = false;
  ok("«Ссылки»: адрес анкеты QPortall первым, Google Форма — запасная", alerts[0].includes("Анкета QPortall для клиента: <a href=\"" + nsite.ssl_url) && alerts[0].includes("Google Форма (запасная)"), alerts[0]);
  ok("меню: «Опубликовать анкету» и «собрать ещё раз»", (ctx.addMenu(), true));

  // --- Свой домен клиента: Netlify получает домен, окно с записями DNS, статус на «Сайты» ---
  {
    ok("домен: очистка https://www. и пути", ctx.cleanDomain(" https://WWW.Studio-Lana.co.il/about ") === "studio-lana.co.il");
    ok("домен: проверка формата", ctx.validDomain("studio-lana.co.il") && ctx.validDomain("lana.com") && !ctx.validDomain("lana") && !ctx.validDomain("lana .com") && !ctx.validDomain("-lana.com"));
    const site = nl.sites[props["NETLIFY_SITE:third"]];
    const realFetch = ctx.UrlFetchApp.fetch, realUi = ctx.SpreadsheetApp.getUi;
    let dns = {}, patched = null, sslCalls = 0, answer = "https://www.Lana-Test.co.il/";
    ctx.UrlFetchApp.fetch = (url, opt) => {
      opt = opt || {};
      const d = url.match(/^https:\/\/dns\.google\/resolve\?name=([^&]+)&type=(\w+)/);
      if (d) return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ Answer: (dns[decodeURIComponent(d[1]) + " " + d[2]] || []).map((x) => ({ data: x })) }) };
      if (url.endsWith("/sites/" + site.id) && opt.method === "patch") {
        patched = JSON.parse(opt.payload); site.custom_domain = patched.custom_domain;
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify(site) };
      }
      if (url.endsWith("/sites/" + site.id + "/ssl")) { sslCalls++; return { getResponseCode: () => 200, getContentText: () => "{}" }; }
      return realFetch(url, opt);
    };
    ctx.SpreadsheetApp.getUi = () => Object.assign(realUi(), { prompt: () => ({ getSelectedButton: () => "OK", getResponseText: () => answer }), Button: { OK: "OK" }, ButtonSet: { OK_CANCEL: 1 } });
    uiAvailable = true; ss.setActiveSheet(ss.getSheetByName("third"));
    alerts.length = 0; ctx.clientDomain();
    const sl = ss.getSheetByName("Сайты"), dc = sl.cells[0].indexOf("свой домен"), tr = sl.cells.findIndex((r) => r[0] === "third");
    ok("домен: Netlify получил домен и www, окно с двумя записями, статус «ждёт записей DNS»",
      patched && patched.custom_domain === "lana-test.co.il" && patched.domain_aliases[0] === "www.lana-test.co.il" &&
      alerts[0].includes("75.2.60.5") && alerts[0].includes(site.name + ".netlify.app") && sslCalls === 0 &&
      dc > 0 && sl.cells[tr][dc] === "lana-test.co.il - ждёт записей DNS", alerts[0] + " | " + JSON.stringify(patched) + " | " + (dc > 0 && sl.cells[tr][dc]));
    dns = { "lana-test.co.il A": ["75.2.60.5"], "www.lana-test.co.il CNAME": [site.name + ".netlify.app."] };
    patched = null; alerts.length = 0; ctx.clientDomain();
    ok("домен: записи на месте - домен не спрашивает заново, https запрошен, статус «готово»",
      !patched && sslCalls === 1 && alerts[0].includes("https://lana-test.co.il") && sl.cells[tr][dc] === "lana-test.co.il - готово", alerts[0] + " | " + sl.cells[tr][dc]);
    delete site.custom_domain; answer = "не домен";
    alerts.length = 0; ctx.clientDomain();
    ok("домен: не домен - понятное сообщение, Netlify не трогаем", !patched && alerts[0].includes("Это не похоже на домен"), alerts[0]);
    ok("домен: пока ждём DNS - адрес netlify.app, после «готово» - свой домен", (() => {
      site.custom_domain = "lana-test.co.il"; site.ssl_url = "https://lana-test.co.il";
      props["DOMAIN_WAIT:third"] = "lana-test.co.il|" + site.name + ".netlify.app";
      const w = ctx.siteAddress("third", site);
      delete props["DOMAIN_WAIT:third"];
      const r = ctx.siteAddress("third", site);
      delete site.custom_domain; site.ssl_url = "https://" + site.name + ".netlify.app";
      return w === "https://" + site.name + ".netlify.app" && r === "https://lana-test.co.il";
    })());

    // Домен из анкеты: сборка сама подключает его, письмо клиенту с записями DNS, ночью - проверка и пересборка.
    dns = {}; patched = null; sslCalls = 0;
    const th = ss.getSheetByName("third");
    th.cells = th.cells.filter((r) => r[0] !== "domain").concat([["domain", "свой домен", "WWW.Lana-Auto.co.il", "", "", "", ""]]);
    ctx.makeSite(ss, "third");
    const row3 = sl.cells.findIndex((r) => r[0] === "third");
    ok("домен из анкеты: сборка подключила его в Netlify, статус «ждёт записей DNS», сайт на адресе netlify.app",
      patched && patched.custom_domain === "lana-auto.co.il" && props["DOMAIN_WAIT:third"] === "lana-auto.co.il|" + site.name + ".netlify.app" &&
      sl.cells[row3][dc] === "lana-auto.co.il - ждёт записей DNS" && ctx.clientInfo(ss, "third").siteUrl.includes(site.name + ".netlify.app"),
      JSON.stringify(patched) + " | " + sl.cells[row3][dc] + " | " + sl.cells[row3][7]);
    const msg = ctx.clientMessage(ctx.clientInfo(ss, "third"));
    ok("домен из анкеты: в письме клиенту две записи DNS и обещание проверить", msg.includes("lana-auto.co.il") && msg.includes("A, имя @, значение 75.2.60.5") &&
      msg.includes("CNAME, имя www, значение " + site.name + ".netlify.app") && msg.includes("каждую ночь"), msg);
    patched = null; ctx.makeSite(ss, "third");
    ok("домен из анкеты: повторная сборка не подключает заново", !patched);
    ok("ночная проверка: записей нет - ничего не пересобираем", ctx.checkDomains().length === 0 && props["DOMAIN_WAIT:third"]);
    dns = { "lana-auto.co.il A": ["75.2.60.5"], "www.lana-auto.co.il CNAME": [site.name + ".netlify.app."] };
    site.ssl_url = "https://lana-auto.co.il";
    const done = ctx.checkDomains();
    ok("ночная проверка: записи появились - «готово», пересборка отдельным запуском",
      done.join() === "third" && !props["DOMAIN_WAIT:third"] && props.DOMAIN_REBUILD === "third" && triggers.some((t) => t.fn === "rebuildDomainSites") &&
      sl.cells[row3][dc] === "lana-auto.co.il - готово", done.join() + " | " + sl.cells[row3][dc]);
    const nm2 = mails.length;
    ctx.rebuildDomainSites();
    const dm = mails.slice(nm2);
    ok("пересборка: сайт с новым адресом, письмо клиенту и владельцу, триггер снят",
      ctx.clientInfo(ss, "third").siteUrl.includes("lana-auto.co.il") && dm.some((m) => m.to === "third@example.com" && m.body.includes("https://lana-auto.co.il")) &&
      dm.some((m) => m.subj === "QPortall: свой домен заработал") && !triggers.some((t) => t.fn === "rebuildDomainSites") && !props.DOMAIN_REBUILD,
      JSON.stringify(dm) + " | " + sl.cells[row3][7]);
    th.cells = th.cells.filter((r) => r[0] !== "domain");
    delete site.custom_domain; site.ssl_url = "https://" + site.name + ".netlify.app";
    ctx.UrlFetchApp.fetch = realFetch; ctx.SpreadsheetApp.getUi = realUi; uiAvailable = false;
  }

}
