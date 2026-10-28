// Проверка дизайна глазами дизайнера: края сетки, кнопки, шрифты, контраст, переполнение, подписи, заголовки.
// Запуск: node tests/design-audit.js <папка сайта> [ширины через запятую] [языки через запятую]
// Печатает по каждой ширине и языку найденные замечания и сводку цифр; код выхода 1, если есть замечания.
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const dir = process.argv[2];
const widths = (process.argv[3] || "360,390,768,1280,1440").split(",").map(Number);
const langs = (process.argv[4] || "ru,he").split(",");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };
const srv = http.createServer((q, r) => { let f = path.join(dir, decodeURIComponent(q.url.split("?")[0])); if (f.endsWith("/")) f += "index.html";
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); r.end(d); } }); });

function audit() {
  const W = document.documentElement.clientWidth, rtl = document.documentElement.dir === "rtl";
  const issues = [], stats = {};
  const vis = el => { if (!el || el.closest("[hidden],.visually-hidden,.sprite,.hp,noscript")) return false; const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const name = el => { const s = el.closest("section,header,footer"); const h = s && s.querySelector("h2,h1"); return (s ? (h ? h.textContent.trim().split("\n")[0].slice(0, 30) : "#" + s.id || s.tagName) : "?") + " › " + el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""); };
  // Линии сетки: внутренние края контейнера.
  const c = document.querySelector("main .container") || document.querySelector(".container"); const cr = c.getBoundingClientRect(), cs = getComputedStyle(c);
  const L = Math.round(cr.left + parseFloat(cs.paddingLeft)), R = Math.round(cr.right - parseFloat(cs.paddingRight)); stats.grid = [L, W - R];
  const S = rtl ? (r => [Math.round(W - r.right), Math.round(r.left)]) : (r => [Math.round(r.left), Math.round(W - r.right)]); // [от начала строки, от конца]
  const start = rtl ? W - R : L, end = rtl ? L : W - R; // в координатах «от начала»/«от конца»
  // 1. Горизонтальная прокрутка.
  if (document.documentElement.scrollWidth > W + 1) issues.push(`страница шире экрана: ${document.documentElement.scrollWidth} > ${W}`);
  // 2. Края: у каждой полосы первое слово/картинка начинается на линии, коробки не вылезают за линии, крупные коробки доходят до конца.
  const bands = [["Шапка", document.querySelector(".header-inner")], ["Цветной блок", document.querySelector(".hero-banner .container")], ["Под цветным блоком", document.querySelector(".hero-body")]];
  document.querySelectorAll("main section.section").forEach(s => vis(s) && bands.push([(s.querySelector("h2") || { textContent: "#" + s.id }).textContent.trim().split("\n")[0].slice(0, 30), s.querySelector(".container")]));
  bands.push(["Подвал", document.querySelector("footer .container")]);
  const edges = [];
  bands.forEach(([n, root]) => { if (!vis(root)) return; let a = 1e9, b = 1e9, bigEnd = null;
    const take = (r, box) => { const [x, y] = S(r); a = Math.min(a, x); b = Math.min(b, y); };
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let t;
    while ((t = tw.nextNode())) if (t.textContent.trim() && vis(t.parentElement)) { const rg = document.createRange(); rg.selectNodeContents(t);
      // Текст, обрезанный многоточием, виден только в пределах своего элемента.
      const pe = t.parentElement, clip = getComputedStyle(pe).overflowX !== "visible" ? pe.getBoundingClientRect() : null;
      [...rg.getClientRects()].filter(x => x.width > 0).forEach(r => take(clip ? new DOMRect(Math.max(r.left, clip.left), r.top, Math.min(r.right, clip.right) - Math.max(r.left, clip.left), r.height) : r)); }
    root.querySelectorAll("img,svg,input,select,textarea,iframe,button,a.btn,.card,.review,details,.video-box,.price-row,.qr-code,.map-box,.demo-box,.lang-switch,.hero-portrait,li").forEach(el => { if (!vis(el)) return; let r = el.getBoundingClientRect();
      // Картинка внутри рамки с overflow: hidden (размытый фон главного фото) видна только в пределах рамки.
      const pc = el.parentElement && getComputedStyle(el.parentElement).overflowX !== "visible" ? el.parentElement.getBoundingClientRect() : null;
      if (pc) r = new DOMRect(Math.max(r.left, pc.left), Math.max(r.top, pc.top), Math.min(r.right, pc.right) - Math.max(r.left, pc.left), Math.min(r.bottom, pc.bottom) - Math.max(r.top, pc.top));
      take(r, true);
      const [x, y] = S(r); if (r.width > (R - L) * 0.5 && y > end + 1 && !el.closest(".hero-banner,.video-box,.map-box,.hero-facts") && !el.matches(".qr-code,.qr-code *")) bigEnd = bigEnd || `${el.tagName.toLowerCase()}.${(el.className.baseVal ?? el.className).split(" ")[0]} кончается в ${y}`; });
    edges.push([n, a, b]);
    if (a < start - 1 && n !== "Цветной блок") issues.push(`${n}: заходит за левую линию (${a} < ${start})`);
    if (b < end - 1) issues.push(`${n}: заходит за правую линию (${b} < ${end})`);
    if (Math.abs(a - start) > 1 && n !== "Цветной блок") issues.push(`${n}: начинается не на линии (${a}, линия ${start})`);
    if (bigEnd) issues.push(`${n}: широкий элемент не доходит до правой линии (${bigEnd}, линия ${end})`); });
  stats.edges = edges;
  // 3. Кнопки и ссылки: область нажатия.
  document.querySelectorAll("a.btn,button,.site-nav a,summary,.lang-switch button,input[type=checkbox],.menu-toggle").forEach(el => { if (!vis(el)) return; const r = el.getBoundingClientRect();
    const min = el.type === "checkbox" ? 24 : 44; if (r.height < min - 0.5 && !(el.closest(".site-nav") && W >= 900)) issues.push(`мала область нажатия ${Math.round(r.width)}×${Math.round(r.height)}: ${name(el)} «${el.textContent.trim().slice(0, 20)}»`); });
  // Кнопки одного ряда одинаковой высоты.
  document.querySelectorAll(".hero-actions,.qr-actions").forEach(g => { const hs = [...g.children].filter(vis).map(x => Math.round(x.getBoundingClientRect().height)); if (new Set(hs).size > 1) issues.push(`кнопки в ряду разной высоты: ${hs.join("/")} (${name(g)})`); });
  // 4. Шрифты и 5. контраст.
  const lum = c => { const m = c.match(/[\d.]+/g).map(Number); const [r, g, b] = m.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return [0.2126 * r + 0.7152 * g + 0.0722 * b, m[3] ?? 1]; };
  const bgOf = el => { for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.backgroundImage !== "none") return null; const [l, a] = lum(s.backgroundColor); if (a > 0.9) return l; } return 1; };
  const sizes = new Map(); const seen = new Set();
  const tw2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n2;
  while ((n2 = tw2.nextNode())) { const p = n2.parentElement; if (!n2.textContent.trim() || !vis(p) || seen.has(p)) continue; seen.add(p); const s = getComputedStyle(p); const fs = parseFloat(s.fontSize);
    sizes.set(fs, (sizes.get(fs) || 0) + 1);
    if (fs < 13.5) issues.push(`мелкий шрифт ${fs}px: ${name(p)} «${n2.textContent.trim().slice(0, 25)}»`);
    const bg = bgOf(p); if (bg !== null) { const [fl] = lum(s.color); const ratio = (Math.max(fl, bg) + 0.05) / (Math.min(fl, bg) + 0.05); const large = fs >= 24 || fs >= 18.6 && +s.fontWeight >= 700;
      if (ratio < (large ? 3 : 4.5)) issues.push(`слабый контраст ${ratio.toFixed(2)}: ${name(p)} «${n2.textContent.trim().slice(0, 25)}»`); }
    // Переполнение: текст обрезан.
    if (p.scrollWidth > p.clientWidth + 1 && s.overflowX !== "visible" && s.textOverflow !== "ellipsis") issues.push(`текст обрезан: ${name(p)}`); }
  stats.fontSizes = [...sizes.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}px×${v}`).join(" ");
  // 6. Длина строки обычного текста.
  document.querySelectorAll("main p").forEach(p => { if (!vis(p) || p.closest(".card,.review,figcaption")) return; const fs = parseFloat(getComputedStyle(p).fontSize); const ch = p.getBoundingClientRect().width / (fs * 0.5);
    if (ch > 95 && p.textContent.length > 120) issues.push(`слишком длинная строка ~${Math.round(ch)} знаков: ${name(p)}`); });
  // 7. Заголовки: один h1, без пропусков уровней.
  const hs = [...document.querySelectorAll("h1,h2,h3,h4")].filter(vis); if (hs.filter(h => h.tagName === "H1").length !== 1) issues.push("h1 должен быть один");
  hs.forEach((h, i) => { if (i && +h.tagName[1] > +hs[i - 1].tagName[1] + 1) issues.push(`пропуск уровня заголовка: ${h.tagName} после ${hs[i - 1].tagName} «${h.textContent.trim().slice(0, 20)}»`); });
  // 8. Картинки: загружены, с alt, не растянуты.
  document.querySelectorAll("img").forEach(im => { if (!vis(im)) return; if (!im.complete || !im.naturalWidth) issues.push(`картинка не загрузилась: ${im.getAttribute("src")}`);
    if (!im.hasAttribute("alt")) issues.push(`нет alt: ${im.getAttribute("src")}`);
    const r = im.getBoundingClientRect(), fit = getComputedStyle(im).objectFit; if (fit === "fill" && im.naturalWidth && Math.abs(r.width / r.height - im.naturalWidth / im.naturalHeight) > 0.04) issues.push(`картинка растянута: ${im.getAttribute("src")}`); });
  // 9. Подписи к фото — не длиннее двух строк (на узкой плитке телефона две строки допустимы).
  document.querySelectorAll(".gallery figcaption > span").forEach(f => { if (!vis(f)) return; const lh = parseFloat(getComputedStyle(f.parentElement).lineHeight) || 20; if (f.getBoundingClientRect().height > lh * 2.25) issues.push(`подпись к фото длиннее двух строк: «${f.textContent.trim().slice(0, 30)}»`); });
  // 10. Карточки одного ряда одной высоты.
  document.querySelectorAll(".cards,.reviews").forEach(g => { const rows = {}; [...g.children].filter(vis).forEach(x => { const r = x.getBoundingClientRect(); (rows[Math.round(r.top)] ||= []).push(Math.round(r.height)); });
    Object.values(rows).forEach(h => new Set(h).size > 1 && issues.push(`карточки одного ряда разной высоты: ${h.join("/")}`)); });
  // 11. Вертикальный ритм: отступы секций.
  const pads = new Set(); document.querySelectorAll("main section.section").forEach(s => vis(s) && pads.add(getComputedStyle(s).paddingTop + "/" + getComputedStyle(s).paddingBottom)); stats.sectionPadding = [...pads].join(" ");
  if (pads.size > 2) issues.push(`разные отступы секций: ${[...pads].join(", ")}`);
  // 12. Наложения: кнопки и блоки первого экрана не налезают друг на друга.
  const firsts = [".hero-banner", ".hero-more", ".hero-tagline", ".hero-photo-box"].map(q => document.querySelector(q)).filter(vis);
  for (let i = 1; i < firsts.length; i++) { const a = firsts[i - 1].getBoundingClientRect(), b = firsts[i].getBoundingClientRect(); if (b.top < a.bottom - 1) issues.push(`наложение: ${firsts[i].className} налезает на ${firsts[i - 1].className}`); }
  return { issues, stats };
}

srv.listen(0, async () => {
  const b = await chromium.launch(); let total = 0;
  for (const lang of langs) for (const w of widths) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } }); const errs = [];
    p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
    await p.goto(`http://localhost:${srv.address().port}/?lang=${lang}`, { waitUntil: "networkidle" }); await p.waitForTimeout(300);
    // Прокрутить до конца, чтобы догрузились «ленивые» картинки.
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } scrollTo(0, 0); });
    await p.waitForLoadState("networkidle"); await p.waitForTimeout(200);
    const { issues, stats } = await p.evaluate(audit); errs.forEach(e => issues.push("ошибка в консоли: " + e));
    const uniq = [...new Set(issues)]; total += uniq.length;
    console.log(`\n== ${lang} ${w}px: линии сетки ${stats.grid[0]}/${stats.grid[1]}, отступы секций ${stats.sectionPadding}, замечаний ${uniq.length}`);
    console.log("   края (от начала/от конца): " + stats.edges.map(([n, a, z]) => `${n} ${a}/${z}`).join("; "));
    console.log("   шрифты: " + stats.fontSizes);
    uniq.forEach(i => console.log("   ✗ " + i));
    await p.close(); }
  await b.close(); srv.close(); console.log(`\nВсего замечаний: ${total}`); process.exit(total ? 1 : 0); });
