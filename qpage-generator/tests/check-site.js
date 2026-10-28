/*
 * Проверка готового сайта в браузере (Playwright + axe-core + jsQR).
 *   npm install            (один раз, в папке генератора)
 *   node tests/check-site.js <папка сайта> [папка для снимков]
 * Всё сверяется с данными самого сайта (assets/js/content.js), поэтому подходит для любого клиента.
 */
"use strict";
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), http = require("http"), vm = require("vm");
const jsQR = require("jsqr"); const { PNG } = require("pngjs");
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const ROOT = path.resolve(process.argv[2] || "");
const SHOTS = path.resolve(process.argv[3] || path.join(ROOT, "..", path.basename(ROOT) + "-check"));
if (!fs.existsSync(path.join(ROOT, "index.html"))) { console.error("Нет index.html в " + ROOT); process.exit(1); }
fs.mkdirSync(SHOTS, { recursive: true });

const sb = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "assets/js/content.js"), "utf8"), sb);
const D = sb.window.QPAGE, S = D.site;
const CSP = fs.readFileSync(path.join(ROOT, "_headers"), "utf8").match(/Content-Security-Policy: (.+)/)[1];
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

// Как хостинг без приёма форм: POST получает 404, значит форма обязана честно сообщить о неудаче.
const server = http.createServer((q, r) => {
  if (q.method !== "GET") { r.writeHead(404); return r.end("not found"); }
  let p = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end("nf"); }
  r.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream", "Content-Security-Policy": CSP });
  fs.createReadStream(f).pipe(r);
});

const results = [];
const ok = (name, cond, info = "") => results.push({ name, pass: !!cond, info });

(async () => {
  await new Promise((res) => server.listen(0, res));
  const BASE = "http://localhost:" + server.address().port + "/";
  const browser = await chromium.launch();
  const viewports = { phone: { width: 360, height: 740 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1366, height: 900 } };

  for (const lang of S.languages) {
    const T = D.text[lang];
    for (const [vpName, vp] of Object.entries(viewports)) {
      const ctx = await browser.newContext({ viewport: vp });
      const page = await ctx.newPage(); const errs = [];
      page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(m.text()); });
      page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message));
      await page.goto(BASE + "?lang=" + lang, { waitUntil: "networkidle" });
      const info = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir,
        h1: document.querySelector("h1 .hero-name").textContent, kind: document.querySelector("h1 .hero-kind").textContent, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
        logo: [...document.querySelectorAll("[data-logo]")].every((i) => i.naturalWidth > 0) }));
      ok(`${lang}/${vpName}: язык и направление`, info.lang === lang && info.dir === (lang === "he" ? "rtl" : "ltr"), JSON.stringify(info));
      ok(`${lang}/${vpName}: заголовок = вид деятельности + название`, info.h1 === T.hero.name && info.kind === T.hero.kind, info.kind + " | " + info.h1);
      ok(`${lang}/${vpName}: логотип загрузился`, info.logo);
      ok(`${lang}/${vpName}: нет горизонтальной прокрутки`, info.sw <= info.cw, `${info.sw} vs ${info.cw}`);
      if (S.languages.length > 1) {
        const ls = await page.evaluate(() => { const r = document.querySelector("#lang-switch").getBoundingClientRect(), b = document.querySelector(".brand").getBoundingClientRect(),
          n = [...document.querySelectorAll("#menu-toggle,#site-nav ul")].find((e) => e.offsetParent).getBoundingClientRect();
          const rtl = document.documentElement.dir === "rtl", ul = document.querySelector("#site-nav ul").getBoundingClientRect();
          return { mid: r.left + r.width / 2, w: document.documentElement.clientWidth, end: Math.round(rtl ? r.left - ul.left : ul.right - r.right), order: [...document.querySelectorAll("#lang-switch button:not([hidden])")].map((x) => x.dataset.lang).join(),
            overlap: [b, n].some((o) => r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top) }; });
        // Телефон: языки посередине шапки. Компьютер: у конца строки, на одной линии с концом меню.
        const placed = ls.w >= 900 ? Math.abs(ls.end) <= 1 : Math.abs(ls.mid - ls.w / 2) < 2;
        ok(`${lang}/${vpName}: кнопки языков на месте (телефон — посередине, компьютер — у края меню), порядок не меняется`, placed && ls.order === S.languages.join() && !ls.overlap, JSON.stringify(ls));
      }
      ok(`${lang}/${vpName}: нет ошибок в консоли`, errs.length === 0, errs.join(" | "));
      const wide = await page.evaluate(() => { const w = document.documentElement.clientWidth; return [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > w + 1 || r.left < -1) && !e.closest(".sprite,.hp,.skip-link,.visually-hidden"); }).map((e) => e.tagName + "." + e.className).slice(0, 5); });
      ok(`${lang}/${vpName}: ничего не вылезает за экран`, wide.length === 0, wide.join(","));
      await page.screenshot({ path: path.join(SHOTS, `${lang}-${vpName}.png`), fullPage: true });
      if (vpName !== "tablet") {
        await page.evaluate(AXE);
        const axe = await page.evaluate(async () => { const r = await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] }); return r.violations.map((v) => v.id + "(" + v.impact + "): " + v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" ; ")); });
        ok(`${lang}/${vpName}: доступность (axe)`, axe.length === 0, axe.join(" || "));
      }
      await ctx.close();
    }
  }

  // Языки, блоки, тексты
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(BASE, { waitUntil: "networkidle" });
    const btns = await page.evaluate(() => [...document.querySelectorAll(".lang-switch [data-lang]")].filter((b) => b.offsetParent).map((b) => b.dataset.lang));
    ok("видны кнопки только языков сайта", JSON.stringify(btns) === JSON.stringify(S.languages.length > 1 ? S.languages : []), btns.join());
    for (const l of S.languages) {
      if (S.languages.length > 1) await page.click(`[data-lang="${l}"]`);
      const r = await page.evaluate(() => ({
        empty: [...document.querySelectorAll("[data-i18n]")].filter((n) => !n.closest("[hidden]") && !n.textContent.trim()).map((n) => n.getAttribute("data-i18n")),
        services: document.querySelectorAll("#services-list li").length,
        offers: document.querySelectorAll("#offers-list details").length,
        prices: [...document.querySelectorAll(".card-price")].map((p) => p.textContent),
        leftovers: document.body.innerText.match(/Мастер Дом|מאסטר בית|Master Home|поломк/gi)
      }));
      ok(`${l}: все видимые тексты заполнены`, r.empty.length === 0, r.empty.join(","));
      ok(`${l}: услуги и вопросы из анкеты`, r.services === S.services.length && r.offers === D.text[l].offers.items.length, JSON.stringify(r));
      ok(`${l}: цены`, S.services.every((s, i) => s.price == null ? r.prices[i] === (D.text[l].services.items[i].priceText || D.text[l].ui.priceOnRequest) : /\d/.test(r.prices[i])), r.prices.join(" | "));
      ok(`${l}: не осталось текстов демо-сайта`, !r.leftovers, String(r.leftovers));
      // «Витрина»: фото с первого экрана в мозаике не повторяются (core.js, heroUsed).
      const skip = S.design === "showcase" && !S.mainPhoto ? Math.min(1, S.gallery.length) : 0, GAL = S.gallery.slice(skip);
      if (GAL.length) {
        // Фото с loading="lazy": прокручиваем к галерее и ждём загрузки.
        await page.locator("#gallery").scrollIntoViewIfNeeded();
        await page.waitForFunction(() => [...document.querySelectorAll("#gallery-list img")].every((i) => i.complete), null, { timeout: 5000 }).catch(() => {});
        const g = await page.evaluate(() => [...document.querySelectorAll("#gallery-list figure")].map((f) => ({
          src: f.querySelector("img").getAttribute("src"), w: f.querySelector("img").naturalWidth, alt: f.querySelector("img").alt,
          cap: f.querySelector("figcaption") ? f.querySelector("figcaption").textContent : null })));
        const items = D.text[l].gallery.items.slice(skip);
        ok(`${l}: фото в галерее загрузились`, g.length === GAL.length && g.every((x, i) => x.w > 0 && x.src === GAL[i].src), JSON.stringify(g));
        ok(`${l}: у фото есть описание (alt), подписи из анкеты`, g.every((x, i) => x.alt && x.alt === items[i].alt && x.alt !== x.cap && (x.cap || "").startsWith(items[i].caption || "")), JSON.stringify(g));
        const pp = await page.evaluate(() => [...document.querySelectorAll("#gallery-list figure")].map((f) => f.querySelector(".photo-price") ? f.querySelector(".photo-price").textContent : null));
        ok(`${l}: цена под фото, где она указана`, GAL.every((x, i) => x.price == null ? pp[i] === null : /\d/.test(pp[i] || "")), JSON.stringify(pp));
      }
      const T = D.text[l];
      const nb = await page.evaluate(() => ({
        rows: document.querySelectorAll("#price-rows tr").length, groups: document.querySelectorAll("#price-rows th[colspan]").length,
        priceLink: document.querySelector("#pricelist-link").hidden ? null : document.querySelector("#pricelist-link").getAttribute("href"),
        cred: document.querySelectorAll("#credentials-list li").length,
        credLink: document.querySelector("#credentials-link").hidden ? null : document.querySelector("#credentials-link").getAttribute("href"),
        docs: [...document.querySelectorAll("#credentials-docs img")].filter((i) => i.complete && i.naturalWidth > 0 && i.alt).length,
        portrait: (() => { const p = document.querySelector(".hero-portrait"); return p ? p.complete && p.naturalWidth > 0 && p.alt === document.querySelector(".hero-name").textContent : null; })(),
        steps: document.querySelectorAll("#steps-list li").length, reviews: document.querySelectorAll("#reviews-list details").length,
        areas: !document.querySelector('[data-contact-row="areas"]').hidden && document.querySelector('[data-contact-row="areas"]').textContent,
        a11y: document.querySelector("#accessibility-list").textContent
      }));
      if (S.blocks.pricelist) ok(`${l}: прайс-лист — все строки и группы, ссылка на файл`, nb.rows === S.pricelist.rows.length &&
        nb.groups === S.pricelist.rows.filter((r) => r.group).length && nb.priceLink === (S.pricelist.link || null), JSON.stringify(nb));
      if (S.blocks.pricelist) {
        const cells = await page.evaluate(() => [...document.querySelectorAll("#price-rows tr td")].map((td) => td.textContent));
        const want = S.pricelist.rows.map((r, i) => (r.group ? null : typeof r.price === "number" ? "num" : T.pricelist.items[i].priceText || T.ui.priceOnRequest)).filter((x) => x !== null);
        ok(`${l}: прайс-лист — цена числом или текстом после тире`, cells.length === want.length && cells.every((c, i) => want[i] === "num" ? /\d/.test(c) : c === want[i]), cells.join(" | "));
      }
      if (S.blocks.credentials) ok(`${l}: лицензии, фото документов и ссылка на документ`, nb.cred === T.credentials.items.length && nb.credLink === (S.credentials.link || null) &&
        nb.docs === ((S.credentials || {}).docs || []).length, JSON.stringify(nb));
      ok(`${l}: фото владельца на первом экране (если есть), подпись — название`, S.portrait ? nb.portrait === true : nb.portrait === null, JSON.stringify(nb.portrait));
      if (S.blocks.steps) ok(`${l}: шаги работы`, nb.steps === T.steps.items.length && nb.steps > 0);
      if (S.blocks.reviews) ok(`${l}: отзывы`, nb.reviews === T.reviews.items.length && nb.reviews > 0);
      ok(`${l}: районы работы`, T.contacts.areasText ? (nb.areas || "").includes(T.contacts.areasText) : nb.areas === false, String(nb.areas));
      const a11yLink = await page.evaluate(() => [...document.querySelectorAll("#accessibility-list a")].map((a) => a.getAttribute("href")));
      if (S.blocks.accessibility) ok(`${l}: заявление о доступности: связь ссылкой, без адреса почты в тексте, есть дата`, !nb.a11y.includes("{") &&
        a11yLink.includes(S.contacts.email ? "mailto:" + S.contacts.email : "tel:" + S.contacts.phone) && !(S.contacts.email && nb.a11y.includes(S.contacts.email)), nb.a11y);
      const ha = await page.evaluate(() => !document.querySelector("#hero-areas").hidden && document.querySelector("#hero-areas-text").textContent);
      ok(`${l}: районы выезда — на первом экране`, T.contacts.areasText ? ha === T.contacts.areasText : ha === false, String(ha));
    }
    const blocks = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("section[data-block]")].map((s) => [s.dataset.block, !s.hidden])));
    // Новые блоки (прайс, отзывы…) показываются только если включены явно — старые сайты их не получают.
    const OPT_IN = ["credentials", "pricelist", "steps", "video", "reviews", "accessibility"];
    const want = Object.fromEntries(Object.keys(blocks).map((b) => [b, OPT_IN.includes(b) ? S.blocks[b] === true : S.blocks[b] !== false]));
    ok("показаны именно выбранные блоки", JSON.stringify(blocks) === JSON.stringify(want), JSON.stringify(blocks));
    const navBad = await page.evaluate(() => [...document.querySelectorAll("#site-nav li")].filter((li) => !li.hidden && document.querySelector(li.querySelector("a").getAttribute("href")).hidden).length);
    ok("в меню нет ссылок на скрытые блоки", navBad === 0);
    ok("demo-плашка выключена", await page.evaluate(() => document.querySelector("#demo-notice").hidden) === !S.demoNotice);
    ok("языки/блоки: без ошибок", errs.length === 0, errs.join("|"));
    await ctx.close();
  }

  // Контакты, форма, карта, QR
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
    const reqs = []; page.on("request", (r) => reqs.push(r.method() + " " + r.url()));
    const L = S.defaultLang, T = D.text[L], C = S.contacts;
    await page.goto(BASE + "?lang=" + L, { waitUntil: "networkidle" });
    const links = await page.evaluate(() => [...document.querySelectorAll("[data-contact]")].map((a) => [a.dataset.contact, a.getAttribute("href"), a.hidden]));
    const has = (kind, href) => links.filter((x) => x[0] === kind).every((x) => href ? x[1] === href && !x[2] : x[2]);
    ok("ссылка «Позвонить»", has("phone", C.phone && "tel:" + C.phone), JSON.stringify(links));
    ok("WhatsApp", has("whatsapp", C.whatsapp && "https://wa.me/" + C.whatsapp));
    ok("Telegram", has("telegram", C.telegram && "https://t.me/" + C.telegram));
    ok("эл. почта", has("email", C.email && "mailto:" + C.email));
    const rows = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-contact-row]")].map((r) => [r.dataset.contactRow, !r.hidden])));
    ok("пустые строки контактов скрыты", rows.phone === !!C.phoneDisplay && rows.email === !!C.email && rows.hours === !!T.contacts.hoursText, JSON.stringify(rows));
    const broken = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].filter((a) => !a.closest("[hidden]")).map((a) => a.getAttribute("href")).filter((h) => h.length > 1 && !document.getElementById(h.slice(1))));
    ok("внутренние ссылки ведут на существующие блоки", broken.length === 0, broken.join(","));
    const contactHref = C.email ? "mailto:" + C.email : "tel:" + C.phone;
    const privacy = await page.evaluate(() => ({ text: document.querySelector("#privacy-list").textContent, links: [...document.querySelectorAll("#privacy-list a")].map((a) => a.getAttribute("href")) }));
    ok("в конфиденциальности способ связи — ссылкой, адрес не выставлен текстом", privacy.links.includes(contactHref) && !privacy.text.includes("{") && !(C.email && privacy.text.includes(C.email)), JSON.stringify(privacy));
    const consent = await page.evaluate(() => { const a = document.querySelector("#f-consent-text a"); return a && a.getAttribute("href"); });
    ok("согласие в форме: «Конфиденциальность» — ссылка на раздел", consent === "#privacy", String(consent));

    if (S.blocks.form) {
      await page.click("#f-submit");
      const e1 = await page.evaluate(() => [...document.querySelectorAll('[aria-invalid="true"]')].map((n) => n.name).join());
      ok("форма: пустая отправка → ошибки", e1 === "name,phone,message,consent", e1);
      await page.fill("#f-name", "Тест Тестов"); await page.fill("#f-phone", "050-123-4567");
      await page.fill("#f-message", "Проверочное сообщение для формы"); await page.check("#f-consent");
      await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });
      const waOnly = S.form.mode !== "demo" && S.form.channel === "whatsapp";
      ok("форма: надпись на кнопке по способу доставки", await page.textContent("#f-submit") === (waOnly ? T.form.submitWa : T.form.submit), await page.textContent("#f-submit"));
      await page.click("#f-submit"); await page.waitForTimeout(800);
      const r = await page.evaluate(() => ({ cls: document.querySelector("#form-result").className, text: document.querySelector("#form-result").textContent,
        opened: window.__opened, wa: !document.querySelector("#form-wa").hidden && document.querySelector("#form-wa-link").href, also: !document.querySelector("#form-wa-also").hidden }));
      if (S.form.mode === "demo") ok("форма (демо): честно «НЕ отправлена»", r.cls.includes("is-demo") && !r.opened.length && !r.wa, r.text);
      else if (waOnly) {
        const u = r.opened[0] || "", txt = decodeURIComponent(u.split("?text=")[1] || "");
        ok("форма без почты: открылся WhatsApp клиента с текстом заявки", u.startsWith("https://wa.me/" + C.whatsapp + "?text=") && txt.includes("Тест Тестов") && txt.includes("050-123-4567") && txt.includes("Проверочное сообщение"), u);
        ok("форма без почты: подсказка нажать «Отправить» и запасная кнопка", r.text === T.form.resultWa && r.wa === u && !r.also, JSON.stringify(r));
      } else {
        ok("форма: когда сервер не принял — честное «не удалось», не «отправлено»", r.cls.includes("is-error") && r.text === T.form.resultFail.replace("{phone}", "⁦" + C.phoneDisplay + "⁩") && !r.opened.length && !r.wa, r.text);
        // Сервер принял заявку → «отправлена» и, если есть WhatsApp, кнопка копии.
        await page.route("**/", (route) => route.request().method() === "POST" ? route.fulfill({ status: 200, body: "" }) : route.continue());
        await page.fill("#f-name", "Тест Тестов"); await page.fill("#f-phone", "050-123-4567");
        await page.fill("#f-message", "Проверочное сообщение для формы"); await page.check("#f-consent");
        await page.click("#f-submit"); await page.waitForTimeout(800);
        const r2 = await page.evaluate(() => ({ text: document.querySelector("#form-result").textContent, wa: !document.querySelector("#form-wa").hidden && document.querySelector("#form-wa-link").href, also: !document.querySelector("#form-wa-also").hidden, opened: window.__opened }));
        ok("форма с почтой: «отправлена», WhatsApp сам не открывается", r2.text === T.form.resultOk && !r2.opened.length, JSON.stringify(r2));
        ok("форма с почтой: кнопка «копия в WhatsApp» только при WhatsApp", C.whatsapp ? (r2.also && String(r2.wa).startsWith("https://wa.me/" + C.whatsapp)) : !r2.wa, JSON.stringify(r2));
        await page.unroute("**/");
      }
      ok("форма: настроен приём Netlify", S.form.mode !== "netlify" || await page.evaluate(() => document.querySelector("#contact-form").hasAttribute("data-netlify")));
    }
    if (S.blocks.map) {
      ok("карта: до нажатия нет запросов к чужим сайтам", !reqs.some((u) => !u.includes("localhost")), reqs.filter((u) => !u.includes("localhost")).join(","));
      const g = await page.getAttribute("#map-google", "href");
      if (S.map.lat != null) {
        ok("карта: ссылки по координатам", g.includes(S.map.lat + "," + S.map.lon), g);
        await page.click("#map-show");
        const src = await page.getAttribute("#map-frame", "src");
        ok("карта: по кнопке открывается OpenStreetMap", src && src.includes("marker=" + S.map.lat + "," + S.map.lon), src);
      } else {
        ok("карта без координат: ссылки по адресу, встроенной карты нет", g.includes(encodeURIComponent(T.map.address)) && await page.evaluate(() => document.querySelector("#map-box").hidden), g);
      }
    }
    if (S.blocks.video && !S.video.youtube) {
      const vl = await page.evaluate(() => ({ href: document.querySelector("#video-link").getAttribute("href"), shown: !document.querySelector("#video-link").hidden,
        btn: !document.querySelector("#video-show").hidden, note: document.querySelector("#video-link-note").textContent }));
      ok("видео не с YouTube: кнопка-ссылка на него, без встраивания", vl.shown && !vl.btn && vl.href === S.video.link && vl.note.includes(S.video.host), JSON.stringify(vl));
    }
    if (S.blocks.video && S.video.youtube) {
      ok("видео: до нажатия YouTube не загружается", !reqs.some((u) => /youtube/.test(u)));
      await page.click("#video-show");
      const src = await page.getAttribute("#video-box iframe", "src");
      ok("видео: по кнопке открывается youtube-nocookie", src && src.startsWith("https://www.youtube-nocookie.com/embed/" + S.video.youtube), src);
    }
    const legal = await page.evaluate(() => !document.querySelector("#footer-legal").hidden && document.querySelector("#footer-legal").textContent);
    ok("подвал: официальное название и номер", S.legal ? legal === S.legal : legal === false, String(legal));
    const made = await page.evaluate(() => ({ href: document.querySelector("#made-with").getAttribute("href"), text: document.querySelector("#made-with").textContent.replace(/\s+/g, " ").trim() }));
    ok("подпись QPage внизу: ссылка «Заказать сайт» на анкету", (S.madeBy && S.madeBy.url) ? made.href === S.madeBy.url && made.text.includes(T.footer.orderSite) : made.href === null, JSON.stringify(made));
    ok("главная кнопка: текст из анкеты", await page.evaluate(() => document.querySelector('[data-i18n="ui.writeUs"]').textContent) === T.ui.writeUs, T.ui.writeUs);
    if (S.blocks.qr) {
      ok("QR: есть кнопка «Поделиться»", await page.evaluate(() => !document.querySelector("#qr-share").hidden));
      await page.evaluate(() => { navigator.share = undefined; navigator.clipboard.writeText = (u) => { window.__copied = u; return Promise.resolve(); }; });
      await page.click("#qr-share");
      const sh = await page.evaluate(() => ({ copied: window.__copied, status: document.querySelector("#qr-share-status").textContent }));
      ok("QR: «Поделиться» без меню телефона копирует ссылку и сообщает", sh.copied === BASE + "?lang=" + L && sh.status === T.qr.copied, JSON.stringify(sh));
      await page.locator("#qr-code").scrollIntoViewIfNeeded();
      const png = PNG.sync.read(await page.locator("#qr-code").screenshot());
      const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
      ok("QR-код читается и ведёт на сайт", code && code.data === BASE + "?lang=" + L, code && code.data);
    }
    ok("контакты/форма/карта: без ошибок", errs.length === 0, errs.join("|"));
    await ctx.close();
  }

  // Для поисковиков и проверки HTML (W3C): страница читается из самого файла, без скрипта
  {
    const raw = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const M = D.text[S.defaultLang];
    ok("HTML: нет картинок с пустым src", !/\ssrc=""/.test(raw));
    const badA = (raw.match(/<a\s[^>]*>/g) || []).filter((a) => !/\shref=/.test(a) && /\s(target|rel|download)=/.test(a));
    ok("HTML: у ссылок без адреса нет target/rel/download", badA.length === 0, badA.slice(0, 3).join(" "));
    const h1s = raw.match(/<h1[\s>][\s\S]*?<\/h1>/g) || [];
    const strip = (x) => x.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
    ok("HTML: ровно один H1, в нём вид деятельности и название", h1s.length === 1 && strip(h1s[0]).includes(M.hero.name) && strip(h1s[0]).includes(M.hero.kind), h1s.join());
    const emptyH2 = (raw.match(/<h2[\s>][\s\S]*?<\/h2>/g) || []).filter((h) => !strip(h));
    ok("HTML: нет пустых H2", emptyH2.length === 0, emptyH2.slice(0, 3).join(" "));
    const desc = (raw.match(/<meta name="description" content="([^"]*)">/) || [])[1] || "";
    ok("HTML: описание есть и не длиннее 155 знаков", desc.length > 0 && strip(desc).length <= 155, desc.length + ": " + desc);
    let ld = null; try { ld = JSON.parse((raw.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1]); } catch (e) { /* нет или не JSON */ }
    ok("HTML: карточка бизнеса JSON-LD (LocalBusiness) с названием и телефоном", ld && ld["@type"] === "LocalBusiness" && ld.name === M.hero.name && ld.telephone === S.contacts.phone, JSON.stringify(ld));
    ok("HTML: Open Graph (og:title, og:description, og:type)", ["og:title", "og:description", "og:type", "og:locale"].every((p) => raw.includes('property="' + p + '"')));
    ok("robots.txt есть и разрешает сканирование", fs.existsSync(path.join(ROOT, "robots.txt")) && /Allow: \//.test(fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8")));
    const canon = (raw.match(/<link rel="canonical" href="([^"]+)">/) || [])[1];
    if (canon) {
      const sm = fs.existsSync(path.join(ROOT, "sitemap.xml")) ? fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8") : "";
      ok("sitemap.xml с адресом сайта, robots.txt на него ссылается", sm.includes("<loc>" + canon + "</loc>") && fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8").includes("Sitemap: " + canon + "sitemap.xml"), sm);
      ok("HTML: og:url и og:image — полные адреса", raw.includes('property="og:url" content="' + canon + '"') && (!raw.includes('property="og:image"') || raw.includes('property="og:image" content="' + canon)));
    }

    // Без JavaScript (так страницу видит простой поисковик): текст на месте.
    const ctx = await browser.newContext({ javaScriptEnabled: false }); const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "load" });
    const nojs = await page.evaluate(() => ({ h1: document.querySelector("h1 .hero-name").textContent, svc: document.querySelectorAll("#services-list li").length,
      tel: [...document.querySelectorAll('a[href^="tel:"]')].length, logo: [...document.querySelectorAll("[data-logo]")].every((i) => i.naturalWidth > 0) }));
    ok("без скрипта: название, услуги, кнопка звонка и логотип видны", nojs.h1 === M.hero.name && nojs.svc === S.services.length && nojs.tel > 0 && nojs.logo, JSON.stringify(nojs));
    await ctx.close();

    // Сдвиг вёрстки при загрузке (CLS): скрипт приходит с задержкой, как в медленной сети.
    const LOC = { ru: "ru-RU", he: "he-IL", en: "en-US" };
    const runs = [["phone", viewports.phone, S.defaultLang], ["desktop", viewports.desktop, S.defaultLang]]
      .concat(S.languages.slice(1).map((l) => ["desktop, браузер на " + l, viewports.desktop, l]));
    for (const [vpName, vp, bl] of runs) {
      const c2 = await browser.newContext({ viewport: vp, locale: LOC[bl] }); const p2 = await c2.newPage();
      await p2.route("**/*.js*", async (r) => { await new Promise((res) => setTimeout(res, 400)); r.continue(); });
      await p2.addInitScript(() => { window.__cls = 0; new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: "layout-shift", buffered: true }); });
      await p2.goto(BASE, { waitUntil: "networkidle" }); await p2.waitForTimeout(500);
      const cls = await p2.evaluate(() => window.__cls);
      if (bl !== S.defaultLang) ok(`браузер на ${bl}: сайт сам открылся на ${bl} и виден`, await p2.evaluate((l) => document.documentElement.lang === l && !document.documentElement.classList.contains("lang-wait"), bl));
      ok(`сдвиг вёрстки при загрузке (${vpName}) меньше 0.1`, cls < 0.1, "CLS " + cls.toFixed(3));
      await c2.close();
    }
  }

  // Двойной щелчок по index.html (без сервера)
  {
    const ctx = await browser.newContext(); const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    await page.goto("file://" + ROOT + "/index.html");
    ok("открывается с диска без ошибок", S.languages.map((l) => D.text[l].hero.name).includes(await page.textContent("h1 .hero-name")) && errs.length === 0, errs.join("|"));
    await ctx.close();
  }

  await browser.close(); server.close();
  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log((r.pass ? "PASS " : "FAIL ") + r.name + (r.pass ? "" : "  -> " + r.info)));
  console.log(`\n${results.length - failed.length}/${results.length} passed  (снимки: ${SHOTS})`);
  fs.writeFileSync(path.join(SHOTS, "results.json"), JSON.stringify(results, null, 1));
  process.exit(failed.length ? 1 : 0);
})();
