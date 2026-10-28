#!/usr/bin/env node
/*
 * QPage — генератор сайтов из анкеты.
 *
 *   node generate.js --list                 список анкет в Google Таблице
 *   node generate.js <лист>                 сделать сайт по листу таблицы (например master-dom)
 *   node generate.js --csv файл.csv         то же из скачанного листа (Файл → Скачать → CSV)
 *   node generate.js --json файл.json       то же из сохранённого ответа (для проверки)
 *   --name <папка>   имя папки сайта (по умолчанию — имя листа или файла)
 *   --media <папка>  логотип и фото клиента: logo.png (или .jpg/.svg/.webp) — логотип,
 *                    остальные картинки по алфавиту — галерея (до 8)
 *   --url <адрес>    адрес сайта в интернете (https://…): для карты сайта, canonical и превью ссылок
 *   --force          перезаписать уже существующую папку сайта
 *
 * Сайт появляется в папке outDir (config.json) и содержит только файлы сайта —
 * генератор, анкета и ключи туда не попадают.
 * Нужен только Node.js 18+, без установки пакетов.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const HERE = __dirname;
const Core = require("./core.js");

// ---------- Параметры запуска ----------

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--force" || x === "--list") a[x.slice(2)] = true;
    else if (x.startsWith("--")) a[x.slice(2)] = argv[++i];
    else a._.push(x);
  }
  return a;
}

function loadConfig() {
  const file = path.join(HERE, "config.json");
  const cfg = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  return {
    url: cfg.url || "",
    token: cfg.token || "",
    templateDir: path.resolve(HERE, cfg.templateDir || "../QPage/site"),
    outDir: path.resolve(HERE, cfg.outDir || "../QPage-sites")
  };
}

function fail(msg) {
  console.error("Ошибка: " + msg);
  process.exit(1);
}

// ---------- Получение анкеты ----------

async function fetchJson(cfg, params) {
  if (!cfg.url || !cfg.token) fail("в config.json не указаны url и token (см. README.md).");
  const u = new URL(cfg.url);
  u.searchParams.set("token", cfg.token);
  Object.keys(params).forEach((k) => u.searchParams.set(k, params[k]));
  const res = await fetch(u, { redirect: "follow" });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) {
    fail("Google вернул не JSON (HTTP " + res.status + "). Проверьте, что веб-приложение развёрнуто с доступом «Все».");
  }
  if (!data.ok) fail("таблица ответила: " + data.error);
  return data;
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function loadTemplate(templateDir) {
  const files = {};
  Core.COPY.forEach((rel) => {
    const f = path.join(templateDir, rel);
    if (fs.existsSync(f)) files[rel] = fs.readFileSync(f, "utf8");
  });
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(templateDir, "assets/js/content.js"), "utf8"), sandbox);
  return { files, text: sandbox.window.QPAGE.text };
}

function writeSite(files, outDir, folder, force) {
  const out = path.join(outDir, folder);
  if (fs.existsSync(out)) {
    if (!force) fail("папка " + out + " уже есть. Добавьте --force, чтобы перезаписать.");
    fs.rmSync(out, { recursive: true, force: true });
  }
  Object.keys(files).forEach((rel) => {
    fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
    fs.writeFileSync(path.join(out, rel), files[rel]);
  });
  return out;
}

const EXT_MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", svg: "image/svg+xml", gif: "image/gif" };

// Картинки из папки клиента — так же, как в Google: logo.* — логотип, main.* — главное фото, portrait.* — фото владельца,
// doc-* — фото документов, остальные — галерея.
function collectMedia(dir) {
  const out = { logo: null, main: null, portrait: null, photos: [], docs: [], notes: [] };
  if (!dir) return out;
  if (!fs.existsSync(dir)) fail("нет папки " + dir);
  fs.readdirSync(dir).sort().forEach((name) => {
    const full = path.join(dir, name);
    if (!fs.statSync(full).isFile()) return;
    const ext = Core.IMAGE_EXT[EXT_MIME[name.split(".").pop().toLowerCase()]];
    const isLogo = /^logo\./i.test(name), isPortrait = /^portrait\./i.test(name), isDoc = /^doc-/i.test(name);
    if (!ext) { out.notes.push("не картинка или формат не для сайта (например HEIC): " + name); return; }
    const size = fs.statSync(full).size;
    if (size > 1500000) out.notes.push("большой файл, сайт будет грузиться медленно: " + name + " (" + Math.round(size / 1e5) / 10 + " МБ)");
    if (isLogo && !out.logo) {
      out.logo = { file: full, path: "assets/img/logo." + ext };
      out.logoSize = Core.imageSize(fs.readFileSync(full));
    }
    else if (/^main\./i.test(name)) { if (!out.main) out.main = { file: full, path: "assets/img/main." + ext }; }
    else if (isPortrait) { if (!out.portrait) out.portrait = { file: full, path: "assets/img/portrait." + ext }; }
    else if (isDoc) {
      if (out.docs.length < Core.MAX_PHOTOS) out.docs.push({ file: full, path: "assets/img/doc-" + (out.docs.length + 1) + "." + ext });
      else out.notes.push("больше " + Core.MAX_PHOTOS + " фото документов, лишнее не вошло: " + name);
    }
    else if (!isLogo && out.photos.length < Core.MAX_PHOTOS) out.photos.push({ file: full, path: "assets/img/photo-" + (out.photos.length + 1) + "." + ext });
    else if (!isLogo) out.notes.push("больше " + Core.MAX_PHOTOS + " фото, лишнее не вошло: " + name);
  });
  return out;
}

// ---------- main ----------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = loadConfig();

  if (args.list) {
    const data = await fetchJson(cfg, {});
    console.log(data.sites.length ? "Анкеты в таблице:\n  " + data.sites.join("\n  ") : "В таблице пока нет анкет.");
    return;
  }

  let rows, source;
  if (args.csv) { rows = parseCsv(fs.readFileSync(args.csv, "utf8")); source = path.basename(args.csv, ".csv"); }
  else if (args.json) { rows = JSON.parse(fs.readFileSync(args.json, "utf8")).rows; source = path.basename(args.json, ".json"); }
  else if (args._[0]) { rows = (await fetchJson(cfg, { site: args._[0] })).rows; source = args._[0]; }
  else {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^#!.*\n\/\*\n?/, "").replace(/^ \* ?/gm, ""));
    return;
  }

  const folder = (args.name || source).replace(/[^\w.-]+/g, "-");
  const tpl = loadTemplate(cfg.templateDir);
  const media = collectMedia(args.media);
  const fields = Core.rowsToFields(rows);
  if (args.url) fields.siteUrl = { value: args.url };
  const r = Core.siteFiles(fields, tpl.files, tpl.text, source, {
    logo: media.logo ? media.logo.path : null,
    logoSize: media.logoSize || null,
    photos: media.photos.map((p) => p.path),
    main: media.main ? media.main.path : null,
    portrait: media.portrait ? media.portrait.path : null,
    docs: media.docs.map((p) => p.path)
  });
  (media.logo ? [media.logo] : []).concat(media.main ? [media.main] : [], media.portrait ? [media.portrait] : [], media.photos, media.docs).forEach((m) => { r.files[m.path] = fs.readFileSync(m.file); });
  r.notes = media.notes.concat(r.notes);
  const out = writeSite(r.files, cfg.outDir, folder, !!args.force);

  console.log("Сайт создан: " + out);
  console.log("Языки: " + r.data.site.languages.join(", ") + "; блоки: " +
    Object.keys(r.data.site.blocks).filter((b) => r.data.site.blocks[b]).join(", "));
  if (r.notes.length) console.log("\nПроверьте перед публикацией (правки — в листе таблицы, затем запустить заново с --force):\n  " + r.notes.join("\n  "));
  if (r.problems.length) {
    console.log("\nПРОБЛЕМЫ:\n  " + r.problems.join("\n  "));
    process.exit(2);
  }
  console.log("\nПроверка: тексты заполнены на всех языках.");
}

main().catch((e) => fail(e.message));
