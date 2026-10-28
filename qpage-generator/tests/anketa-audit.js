/*
 * Проверка вида анкеты: каждый шаг (заполненный, с фото) на 360/390/768/1280/1440, Pixel 7 с крупным шрифтом (130%),
 * иврит в полях, фон по номеру дизайна. Ищет: прокрутку вбок, вылезание за карточку, наложения, мелкие кнопки,
 * обрезанный текст. Снимки — в папку из аргумента.
 *   node build-gs.js && node tests/anketa-audit.js <папка для снимков>
 */
"use strict";
const path = require("path"), fs = require("fs");
const { chromium, devices } = require("playwright");
const start = require("./anketa-server");
const out = process.argv[2] || path.join(require("os").tmpdir(), "anketa-audit");
fs.mkdirSync(out, { recursive: true });
const media = path.join(__dirname, "sample/media");

const FILLED = {
  formLang: "Русский", languages: ["Русский", "Иврит (עברית)", "English"], name: "Студия Лана — маникюр, педикюр и наращивание ресниц", kind: "סטודיו לציפורניים באשדוד",
  nameHe: "סטודיו לנה", nameEn: "Studio Lana", tagline: "Аккуратный маникюр и педикюр в уютной студии. Стерильные инструменты и запись в удобное время.",
  facts: "Опыт 8 лет\nСтерильные инструменты\nЗапись онлайн", about: "Меня зовут Лана.\nРаботаю с 2016 года.", phone: "050-123-4567", whatsapp: "050-123-4567",
  email: "очень.длинный.адрес.почты.studio-lana-ashdod@example-very-long-domain.co.il", workDays: ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница"],
  workFrom: "9:00", workTo: "19:00", fridayTo: "14:00", address: "Ашдод, ул. Герцля 25", areas: "Ашдод, Ашкелон, Явне",
  service1Name: "Маникюр", service1Text: "Классический или аппаратный", service1Price: "120", service2Name: "Педикюр", service2Price: "150",
  faq1Q: "Сколько длится процедура?", faq1A: "Около часа.", wantPrices: "Да", pricelist: "Маникюр — 120", wantReviews: "Нет", wantSteps: "Нет",
  wantLicense: "Да", license: "Диплом мастера", wantVideo: "Нет", color: "Бордовый", design: "Фото-витрина", cta: "Записаться", blocks: ["Карта", "Форма заявки"], a11y: "Да",
  captions: "Маникюр — 120\nПедикюр — 150"
};

(async () => {
  const s = await start(8094, { prepare: (m) => {
    const f = m.driveFile("fon.jpg", fs.readFileSync(path.join(media, "photo1.jpg")), "image/jpeg");
    f.id = "BG" + "x".repeat(28); m.allFiles[f.id] = f;
    m.ctx.anketaBgSheet(m.ss).getRange(2, 1, 1, 5).setValues([["", "https://drive.google.com/file/d/" + f.id + "/view", "строгий", "юрист", "#9b2335"]]);
  } });
  const browser = await chromium.launch();
  const configs = [
    { name: "360", viewport: { width: 360, height: 740 } },
    { name: "390", viewport: { width: 390, height: 844 } },
    { name: "768", viewport: { width: 768, height: 1024 } },
    { name: "1280", viewport: { width: 1280, height: 900 } },
    { name: "1440", viewport: { width: 1440, height: 900 } },
    { name: "pixel7-130", ...devices["Pixel 7"], big: true },
    { name: "galaxy360-130-d1", viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, big: true, query: "?d=1" }
  ];
  const problems = [];
  for (const cfg of configs) {
    const ctx = await browser.newContext(Object.assign({}, cfg, { name: undefined, big: undefined, query: undefined }));
    const page = await ctx.newPage();
    page.on("pageerror", (e) => problems.push(cfg.name + ": ошибка " + e.message));
    if (cfg.big) await page.addInitScript(() => {
      // Крупный шрифт Android (130%): все размеры шрифта и высоты строк из стилей — в 1,3 раза больше.
      addEventListener("DOMContentLoaded", () => {
        const big = (v) => v.replace(/([\d.]+)px/g, (m, n) => (n * 1.3).toFixed(1) + "px");
        for (const sh of document.styleSheets) {
          const walk = (rules) => { for (const r of rules) {
            if (r.cssRules) walk(r.cssRules);
            if (!r.style) continue;
            if (r.style.fontSize) r.style.fontSize = big(r.style.fontSize);
            if (r.style.lineHeight && /px/.test(r.style.lineHeight)) r.style.lineHeight = big(r.style.lineHeight);
            if (r.style.font) r.style.font = r.style.font.replace(/^(\S*\s*)?([\d.]+px)/, (m) => big(m));
          } };
          walk(sh.cssRules);
        }
      });
    });
    await page.goto(s.url + (cfg.query || ""));
    await page.evaluate((a) => localStorage.setItem("qp-anketa:new", JSON.stringify({ answers: a, step: 0, started: Date.now(), shown: {} })), FILLED);
    await page.reload();
    await page.waitForTimeout(cfg.query ? 400 : 50);
    await page.screenshot({ path: path.join(out, cfg.name + "-00-intro.png") });
    await page.click(".hero .btn-main");
    for (let i = 0; i < 15; i++) {
      const h = await page.textContent("h1");
      if (h === "Фото") {
        await page.setInputFiles(".up-logo input[type=file]", path.join(media, "logo.png"));
        await page.setInputFiles(".up-main input[type=file]", path.join(media, "photo2.jpg"));
        await page.setInputFiles(".up-portrait input[type=file]", path.join(media, "photo1.jpg"));
        await page.waitForFunction(() => document.querySelectorAll(".th").length === 3);
      }
      if (h === "Ваши работы" && !(await page.$(".up-photos .th"))) {
        await page.setInputFiles(".up-photos input[type=file]", ["photo1.jpg", "photo2.jpg", "photo3.jpg", "IMG_0004.HEIC", "photo1.jpg"].map((n) => path.join(media, n)));
        await page.waitForFunction(() => document.querySelectorAll(".up-photos .th").length === 5);
      }
      if (h === "Что ещё показать" && !(await page.$(".up-docs .th"))) {
        await page.setInputFiles(".up-docs input[type=file]", path.join(media, "photo3.jpg"));
        await page.waitForSelector(".up-docs .th");
      }
      const found = await page.evaluate(() => {
        const bad = [];
        const W = document.documentElement.clientWidth;
        if (document.documentElement.scrollWidth > W + 1) bad.push("прокрутка вбок: " + document.documentElement.scrollWidth + " > " + W);
        const card = document.querySelector(".card").getBoundingClientRect();
        const vis = (el) => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.opacity !== "0" && !el.closest(".hp"); };
        const name = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(" ").join(".") : "") + " «" + (el.textContent || "").trim().slice(0, 30) + "»";
        document.querySelectorAll(".card *").forEach((el) => {
          if (!vis(el) || el.matches("input[type=radio],input[type=checkbox]:not([role=switch]),.drop input,option")) return;
          const r = el.getBoundingClientRect();
          if (r.left < card.left - 0.5 || r.right > card.right + 0.5) bad.push("за карточкой: " + name(el) + " " + Math.round(r.left) + "–" + Math.round(r.right));
          if (el.matches("button,.btn,.opt span,.sw span,.dz > span,input:not([role=switch]),select,textarea,.drop,.switch") && r.height < 40 && !el.matches(".link")) bad.push("мелко для пальца (" + Math.round(r.height) + "px): " + name(el));
          if (el.matches(".link") && r.height < 28) bad.push("мелкая ссылка (" + Math.round(r.height) + "px): " + name(el));
          if (el.matches("button,.btn,b,label,legend,.count,h1") && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== "visible") bad.push("текст обрезан: " + name(el));
        });
        // Наложения: соседние блоки внутри шага и кнопки внизу.
        const boxes = [...document.querySelectorAll(".step > *, .field > *, .gate > *, .item > *, .opts > *, .swatches > *, .designs > *, .thumbs > *, .nav > *, .top > *, .sum > *, .dz-t > *")].filter(vis);
        for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
          if (boxes[a].parentElement !== boxes[b].parentElement) continue;
          const x = boxes[a].getBoundingClientRect(), y = boxes[b].getBoundingClientRect();
          const ix = Math.min(x.right, y.right) - Math.max(x.left, y.left), iy = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top);
          if (ix > 1 && iy > 1) bad.push("наложение: " + name(boxes[a]) + " и " + name(boxes[b]));
        }
        // Шрифт меньше 12px.
        document.querySelectorAll(".card *").forEach((el) => { if (vis(el) && el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12) bad.push("шрифт меньше 12px: " + name(el)); });
        return bad;
      });
      found.forEach((f) => problems.push(cfg.name + " · " + h + ": " + f));
      await page.screenshot({ path: path.join(out, cfg.name + "-" + String(i + 1).padStart(2, "0") + ".png"), fullPage: !cfg.big });
      if (i < 14) {
        await page.click(".nav .btn-main");
        const now = await page.textContent("h1");
        if (now === h) { problems.push(cfg.name + " · " + h + ": не пускает дальше: " + (await page.$$eval(".err", (e) => e.map((x) => x.textContent).join("; ")))); break; }
      }
    }
    await ctx.close();
  }
  await browser.close();
  s.server.close();
  const uniq = [...new Set(problems)];
  console.log(uniq.length ? uniq.join("\n") : "замечаний нет");
  console.log("\nснимки: " + out);
  if (uniq.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
