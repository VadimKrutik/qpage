/*
 * Собирает файлы для Google Apps Script (большой файл редактор Apps Script молча не сохраняет;
 * 140 КБ сохранялся, 157 КБ — уже нет, поэтому каждый файл держим меньше ~100 КБ):
 *   dist/QPortall-1-kod.gs      = apps-script/Code.gs                             → файл Code.gs
 *   dist/QPortall-5-yadro.gs    = ядро генератора (core.js)                       → файл Yadro.gs
 *   dist/QPortall-6-stranica.gs = страница анкеты (anketa.js, стили)              → файл Stranica.gs
 *   (28.10: Code.gs с ядром — 144 КБ — редактор молча не сохранил, поэтому ядро отдельно)
 *   dist/QPortall-2-shablon.gs  = тексты шаблона, HTML и стили                    → файл Shablon.gs
 *   dist/QPortall-3-shablon2.gs = скрипты шаблона                                 → файл Shablon2.gs
 *   dist/QPortall-4-anketa.gs   = своя анкета: apps-script/Anketa.gs + страница (папка anketa) → файл Anketa.gs
 * Файлы одного проекта Apps Script видят переменные друг друга.
 *   node build-gs.js [папка шаблона]
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const Core = require("./core.js");
const tplDir = path.resolve(__dirname, process.argv[2] || "../QPage/site");

const files = {};
Core.COPY.forEach((rel) => { files[rel] = fs.readFileSync(path.join(tplDir, rel), "utf8"); });
const sb = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(tplDir, "assets/js/content.js"), "utf8"), sb);

const date = new Date().toISOString().slice(0, 10);
const kod = fs.readFileSync(path.join(__dirname, "apps-script/Code.gs"), "utf8");
const yadro = "// ===================== Ядро генератора (core.js, собрано build-gs.js " + date + ") =====================\n" +
  fs.readFileSync(path.join(__dirname, "core.js"), "utf8");
// Длинную строку режем на куски по 8000 знаков (каждый — своей строкой файла), не разрывая пары UTF-16.
const chunks = (str) => { const out = []; let i = 0; while (i < str.length) { let j = Math.min(i + 8000, str.length);
  if (j < str.length && /[\uD800-\uDBFF]/.test(str[j - 1])) j--; out.push(JSON.stringify(str.slice(i, j))); i = j; } return out.length ? out : ['""']; };
const assign = (lhs, str) => lhs + " = [\n" + chunks(str).join(",\n") + "\n].join(\"\");\n";
// Файлы видят переменные друг друга, порядок файлов в проекте неважен: объект создаёт тот, кто первый.
const head = (n) => "// ===================== Шаблон QPortall, часть " + n + " из 2 (собрано build-gs.js " + date + ") =====================\n" +
  "var TEMPLATE_FILES = typeof TEMPLATE_FILES === \"object\" && TEMPLATE_FILES ? TEMPLATE_FILES : {};\n";
const isScript = (rel) => /\.js$/.test(rel);
const shablon = head(1) + "var TEMPLATE_TEXT = JSON.parse([\n" + chunks(JSON.stringify(sb.window.QPAGE.text)).join(",\n") + "\n].join(\"\"));\n" +
  Object.keys(files).filter((rel) => !isScript(rel)).map((rel) => assign("TEMPLATE_FILES[" + JSON.stringify(rel) + "]", files[rel])).join("");
const shablon2 = head(2) +
  Object.keys(files).filter(isScript).map((rel) => assign("TEMPLATE_FILES[" + JSON.stringify(rel) + "]", files[rel])).join("");
const dist = path.join(__dirname, "dist");
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, "QPortall-1-kod.gs"), kod);
fs.writeFileSync(path.join(dist, "QPortall-5-yadro.gs"), yadro);
fs.writeFileSync(path.join(dist, "QPortall-2-shablon.gs"), shablon);
fs.writeFileSync(path.join(dist, "QPortall-3-shablon2.gs"), shablon2);
// Своя анкета QPortall: код (apps-script/Anketa.gs) и файлы страницы (папка anketa) → файл Anketa.gs.
const ank = path.join(__dirname, "anketa");
// Файлы страницы делим на два файла Apps Script: код анкеты с фонами и логотипом, и сама страница (скрипт, стили).
const pageHead = "var ANKETA_PAGE = typeof ANKETA_PAGE === \"object\" && ANKETA_PAGE ? ANKETA_PAGE : {};\n";
const pageFiles = (list) => list.map((rel) => assign("ANKETA_PAGE[" + JSON.stringify(rel) + "]", fs.readFileSync(path.join(ank, rel), "utf8"))).join("");
const anketa = "// ===================== Анкета QPortall, код (собрано build-gs.js " + date + ") =====================\n" +
  fs.readFileSync(path.join(__dirname, "apps-script/Anketa.gs"), "utf8") + "\n// Фоны и логотип анкеты (папка anketa).\n" + pageHead +
  pageFiles(["_headers"].concat(fs.readdirSync(path.join(ank, "bg")).sort().map((n) => "bg/" + n))) +
  assign("var ANKETA_LOGO_PNG", fs.readFileSync(path.join(ank, "logo.png")).toString("base64"));
const stranica = "// ===================== Анкета QPortall, страница (собрано build-gs.js " + date + ") =====================\n" + pageHead +
  pageFiles(["index.html", "anketa.css", "anketa.js"]);
fs.writeFileSync(path.join(dist, "QPortall-4-anketa.gs"), anketa);
fs.writeFileSync(path.join(dist, "QPortall-6-stranica.gs"), stranica);
if (fs.existsSync(path.join(dist, "QPage.gs"))) fs.unlinkSync(path.join(dist, "QPage.gs"));
const kb = (t) => Math.round(Buffer.byteLength(t) / 1024);
console.log("dist/QPortall-1-kod.gs: " + kb(kod) + " КБ, QPortall-2-shablon.gs: " + kb(shablon) + " КБ, QPortall-3-shablon2.gs: " + kb(shablon2) + " КБ, QPortall-4-anketa.gs: " + kb(anketa) + " КБ, QPortall-5-yadro.gs: " + kb(yadro) + " КБ, QPortall-6-stranica.gs: " + kb(stranica) + " КБ");
[kod, shablon, shablon2, anketa, yadro, stranica].forEach((t, i) => { if (Buffer.byteLength(t) > 140 * 1024) throw new Error("Файл " + (i + 1) + " больше 140 КБ — редактор Apps Script его не сохранит, разделите."); });
