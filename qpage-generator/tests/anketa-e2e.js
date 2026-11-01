/*
 * Анкета QPortall в настоящем браузере (Chromium) против имитации Google:
 * заполнить все шаги (с ошибками ввода), фото, перезагрузить посередине, отправить → лист и сайт в «таблице»;
 * открыть личную ссылку → исправить телефон и фото → тот же лист; фон по номеру дизайна.
 *   node build-gs.js && node tests/anketa-e2e.js
 */
"use strict";
const path = require("path"), fs = require("fs");
const { chromium } = require("playwright");
const start = require("./anketa-server");
const media = path.join(__dirname, "sample/media");
const checks = [];
const ok = (name, cond, info = "") => checks.push({ name, pass: !!cond, info });

(async () => {
  const s = await start(8093, { prepare: (m) => {
    const f = m.driveFile("fon.jpg", fs.readFileSync(path.join(media, "photo1.jpg")), "image/jpeg");
    f.id = "BG" + "x".repeat(28); m.allFiles[f.id] = f;
    const bg = m.ctx.anketaBgSheet(m.ss);
    bg.getRange(2, 1, 1, 5).setValues([["", "https://drive.google.com/file/d/" + f.id + "/view", "строгий", "юрист", "#1d5fa6"]]);
    m.ctx.anketaChannelSheet(m.ss).getRange(2, 1, 2, 3).setValues([["", "Instagram", "1"], ["", "Facebook", ""]]);
  } });
  const m = s.m;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (c) => { if (c.type() === "error") errors.push(c.text()); });
  const next = () => page.click(".nav .btn-main");
  const title = () => page.textContent("h1");

  await page.goto(s.url + "?r=2");
  await page.click("text=Начать");
  ok("шаг 1: языки, русский выбран заранее", (await title()) === "Языки" && await page.isChecked("input[value='Русский'][type=radio]"));
  await next();
  await next();
  ok("пустое обязательное поле — ошибка, дальше не пускает", (await title()) === "О вас" && (await page.textContent(".field.bad .err")).includes("Заполните"));
  await page.fill("[data-key=name] input", "Студия Лана");
  await page.fill("[data-key=kind] input", "Маникюр и педикюр в Ашдоде");
  await page.fill("[data-key=nameEn] input", "Studio Lana");
  await next();
  await page.fill("[data-key=tagline] textarea", "Аккуратный маникюр в уютной студии.");
  await page.fill("[data-key=tagline] textarea", "Скидки на www.spam-shop.com");
  await page.fill("[data-key=facts] textarea", "1\n2\n3\n4");
  await next();
  ok("ссылка в тексте и 6 преимуществ — ошибки, дальше не пускает", (await title()) === "Главное предложение" &&
    (await page.textContent("[data-key=tagline] .err")).includes("Без ссылок") && (await page.textContent("[data-key=facts] .err")).includes("Не больше 3 строк"));
  await page.fill("[data-key=tagline] textarea", "Аккуратный маникюр в уютной студии.");
  await page.fill("[data-key=facts] textarea", "Опыт 8 лет\nСтерильные инструменты");
  await next();
  await next(); // «Подробнее» — пропустить
  await page.fill("[data-key=phone] input", "12");
  await next();
  ok("телефон с ошибкой — подсказка", (await title()) === "Контакты" && (await page.textContent("[data-key=phone] .err")).includes("9 цифр"));
  await page.fill("[data-key=phone] input", "050-123-4567");
  await page.fill("[data-key=whatsapp] input", "050-123-4567");
  await next();
  for (const d of ["Пн", "Вт", "Ср", "Чт"]) await page.click(`.days .opt:has-text("${d}")`);
  await page.selectOption("[data-key=workFrom] select", "9:00");
  await page.selectOption("[data-key=workTo] select", "18:00");
  await next();
  await page.fill("[data-key=address] input", "Ашдод, ул. Герцля 1");
  await next();
  ok("шаг «Услуги и цены»", (await title()) === "Услуги и цены");
  await page.fill("[data-key=service1Name] input", "Маникюр");
  await page.fill("[data-key=service1Price] input", "сто");
  await next();
  ok("цена не числом — подсказка", (await page.textContent("[data-key=service1Price] .err")).includes("число"));
  await page.fill("[data-key=service1Price] input", "120");
  await page.click("text=+ Добавить услугу");
  await page.fill("[data-key=service2Name] input", "Педикюр");
  await page.fill("[data-key=service2Text] textarea", "С покрытием");
  await next();
  await page.fill("[data-key=faq1Q] input", "Сколько длится?");
  await page.fill("[data-key=faq1A] textarea", "Около часа.");
  await next();
  ok("шаг «Фото»: три загрузки", (await title()) === "Фото" && (await page.$$(".drop")).length === 3);
  await page.setInputFiles(".up-logo input[type=file]", path.join(media, "logo.png"));
  await page.setInputFiles(".up-main input[type=file]", path.join(media, "photo2.jpg"));
  await page.setInputFiles(".up-portrait input[type=file]", path.join(media, "photo1.jpg"));
  await page.waitForFunction(() => document.querySelectorAll(".th img").length === 3);
  ok("фото: предпросмотр у каждой загрузки", (await page.$$(".th img")).length === 3);
  ok("фото: маленькое главное фото — предупреждение", (await page.textContent(".up-main")).includes("Маленькое фото"));
  await next();
  await page.setInputFiles(".up-photos input[type=file]", ["photo1.jpg", "photo2.jpg", "photo3.jpg", "IMG_0004.HEIC"].map((n) => path.join(media, n)));
  await page.waitForFunction(() => document.querySelectorAll(".up-photos .th").length === 4);
  ok("фото работ: 4 штуки с номерами, HEIC — без картинки, но принят", (await page.$$eval(".up-photos .num", (e) => e.map((x) => x.textContent).join())) === "1,2,3,4" &&
    (await page.$$(".up-photos .th img")).length === 3);
  await page.fill("[data-key=captions] textarea", "Маникюр — 120\nПедикюр\nДизайн");
  await next();
  await page.click(".gate:has-text('Прайс-лист') .switch");
  await page.fill("[data-key=pricelist] textarea", "Маникюр — 120\nПедикюр — 150");
  await page.click(".gate:has-text('Лицензии') .switch");
  await page.fill("[data-key=license] textarea", "Диплом мастера");
  await page.setInputFiles(".up-docs input[type=file]", path.join(media, "photo3.jpg"));
  await page.waitForSelector(".up-docs .th");
  await next();
  await next();
  ok("цвет не выбран — ошибка", (await title()) === "Вид сайта" && !!(await page.$("[data-key=color].bad")));
  await page.click(".sw:has-text('Синий')");
  await page.click(".dz:has-text('Фото-витрина')");
  await next();
  await page.click(".opt:has-text('Записаться')");
  await page.click(".opt:has-text('Карта')");
  await next();
  ok("последний шаг — «Проверьте и отправьте»", (await title()) === "Проверьте и отправьте" && (await page.textContent(".count")) === "Шаг 15 из 15");
  // Закрыли страницу и вернулись: всё на месте (заодно «начали» минуту назад — иначе сервер сочтёт роботом).
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem("qp-anketa:new")); d.started -= 60000; localStorage.setItem("qp-anketa:new", JSON.stringify(d)); });
  await page.reload();
  await page.click("text=Продолжить");
  const review = await page.textContent(".step");
  ok("после перезагрузки: снова «Проверьте», ответы и фото сохранились", (await title()) === "Проверьте и отправьте" && review.includes("Студия Лана") &&
    review.includes("050-123-4567") && review.includes("4 фото") && review.includes("Педикюр"), review.slice(0, 400));
  await page.click(".sum:has-text('Контакты') .link");
  ok("«Изменить» открывает шаг, кнопка «К проверке»", (await title()) === "Контакты" && (await page.textContent(".nav .btn-main")) === "К проверке");
  await page.fill("[data-key=email] input", "lana@example.com");
  await next();
  ok("«К проверке» возвращает на последний шаг", (await title()) === "Проверьте и отправьте" && (await page.textContent(".step")).includes("lana@example.com"));
  await page.click("#send");
  ok("без согласия не отправляется", !!(await page.$("[data-key=consent].bad")) && m.requests.length === 0);
  await page.click("[data-key=consent] .opt");
  await page.click("#send");
  await page.waitForSelector("text=Анкета отправлена", { timeout: 20000 });
  const link = await page.inputValue(".keybox input");
  ok("отправлено: экран «Анкета отправлена» с личной ссылкой", /\?edit=[0-9a-f]{40}$/.test(link) && !(await page.textContent(".hero")).includes("изменить ещё"), link);
  ok("отправка одним запросом text/plain (без лишнего запроса к Google)", m.requests.length === 1 && /^text\/plain/.test(m.requests[0].type), JSON.stringify(m.requests.map((r) => r.type)));
  const sent = JSON.parse(m.requests[0].body);
  ok("фото уходят уменьшенными JPG/PNG, HEIC — как есть", sent.files.photos.length === 4 && sent.files.logo[0].type === "image/png" && sent.files.docs.length === 1 &&
    sent.files.photos[3].name === "IMG_0004.HEIC", JSON.stringify(Object.keys(sent.files).map((k) => k + ":" + sent.files[k].map((f) => f.name + "/" + f.type).join("|"))));
  ok("ловушка пустая, время заполнения больше минуты", !sent.hp && sent.t > 60000, sent.t);
  ok("канал из ссылки ?r=2 отправлен", sent.ref === "2", sent.ref);

  // Что получилось в «таблице».
  const ank = m.ss.getSheetByName("Анкеты QPortall");
  const row = ank.cells[1];
  const sh = m.ss.getSheetByName(row[1]);
  ok("канал 2 — на «Анкеты QPortall»", row[10] === "2", row[10]);
  const val = (k, c = 2) => { const r = sh && sh.cells.find((x) => x[0] === k); return r ? r[c] : undefined; };
  ok("лист клиента создан и сайт собран", sh && /^готово/.test(row[5]), row.slice(0, 7).join(" | "));
  ok("лист: телефон, часы, цвет, вид, кнопка, блоки", val("phone") === "050-123-4567" && val("workHours") === "9:00-18:00" && val("color") === "#1d5fa6" &&
    val("design").startsWith("Фото-витрина") && val("cta") === "Записаться" && val("blocks") === "map" && val("workDays") === "Понедельник, Вторник, Среда, Четверг",
    JSON.stringify(sh && sh.cells.filter((r) => ["phone", "workHours", "color", "design", "cta", "blocks", "workDays"].includes(r[0]))));
  ok("лист: услуги, прайс, лицензия, вопросы", val("service1Name", 3) === "Маникюр" && val("service1Price") === "120" && val("service2Name", 3) === "Педикюр" &&
    (val("pricelist", 3) || "").includes("Педикюр — 150") && val("license", 3) === "Диплом мастера" && val("faq1Q", 3) === "Сколько длится?");
  const sitesRoot = m.driveRoot.folders.find((f) => f.name === "QPage — сайты");
  const photoDir = sitesRoot.folders.find((f) => f.name === row[1] + " — фото");
  const names = () => photoDir.files.filter((f) => !f.trashed).map((f) => f.name).join();
  ok("фото на Диске: логотип, главное, ваше, 4 работы, документ", names() === "logo.png,photo-01-photo1.jpg,photo-02-photo2.jpg,photo-03-photo3.jpg,photo-04-IMG_0004.HEIC,main.jpg,portrait.jpg,doc-01-photo3.jpg", names());

  // --- Личная ссылка ---
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  p2.on("pageerror", (e) => errors.push(e.message));
  await p2.goto(link);
  await p2.waitForSelector("text=Исправить анкету");
  ok("личная ссылка: «Исправить анкету», имя, осталось 3", (await p2.textContent(".hero")).includes("«Студия Лана»") && !(await p2.textContent(".hero")).includes("изменить ещё"));
  await p2.click("text=Открыть анкету");
  ok("открывается сразу «Проверьте», ответы на месте", (await p2.textContent("h1")) === "Проверьте и отправьте" && (await p2.textContent(".step")).includes("lana@example.com") &&
    (await p2.textContent(".banner")).trim() === "Вы меняете анкету.");
  await p2.click(".sum:has-text('Контакты') .link");
  await p2.fill("[data-key=phone] input", "052-999-8877");
  await p2.click(".nav .btn-main");
  await p2.click(".sum:has-text('Ваши работы') .link");
  ok("фото работ с Диска показаны миниатюрами", (await p2.$$(".up-photos .th")).length === 4);
  await p2.click(".up-photos .th:nth-child(2) .x");
  await p2.setInputFiles(".up-photos input[type=file]", path.join(media, "photo3.jpg"));
  await p2.waitForFunction(() => document.querySelectorAll(".up-photos .th").length === 4);
  await p2.click(".nav .btn-main");
  await p2.click("[data-key=consent] .opt").catch(() => {});
  if (!(await p2.isChecked("[data-key=consent] input"))) await p2.click("[data-key=consent] .opt");
  await p2.click("#send");
  await p2.waitForSelector("text=Исправления сохранены", { timeout: 20000 });
  ok("исправление: «Исправления сохранены», осталось 2", !(await p2.textContent(".hero")).includes("изменить ещё"));
  ok("исправление: тот же лист, телефон новый, нового листа нет", m.ss.getSheetByName("Анкеты QPortall").cells.length === 2 && val("phone") === "052-999-8877" && /^готово/.test(ank.cells[1][5]), ank.cells[1][5]);
  const sitesSh = m.ss.getSheetByName("Сайты"), sh0 = sitesSh.cells[0];
  ok("исправление: канал остался 2 (лист анкет и «Сайты»)", ank.cells[1][10] === "2" && sitesSh.cells.find((r) => r[0] === row[1])[sh0.indexOf("канал")] === "2");
  ok("исправление: фото 2 убрано, новое в конце", names() === "photo-01-photo1.jpg,photo-03-photo3.jpg,photo-04-IMG_0004.HEIC,main.jpg,portrait.jpg,doc-01-photo3.jpg,photo-05-photo3.jpg" ||
    names() === "logo.png,photo-01-photo1.jpg,photo-03-photo3.jpg,photo-04-IMG_0004.HEIC,main.jpg,portrait.jpg,doc-01-photo3.jpg,photo-05-photo3.jpg", names());

  // --- Анкета на иврите (?lang=he): справа налево, тексты на иврите, ответы уходят с теми же русскими значениями ---
  const ctxHe = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const ph = await ctxHe.newPage();
  ph.on("pageerror", (e) => errors.push("he: " + e.message));
  const nh = () => ph.click(".nav .btn-main");
  await ph.goto(s.url + "?lang=he");
  ok("иврит: dir=rtl, lang=he, заголовок и кнопка на иврите", (await ph.getAttribute("html", "dir")) === "rtl" && (await ph.getAttribute("html", "lang")) === "he" &&
    (await ph.textContent("h1")) === "שאלון לאתר" && (await ph.title()).startsWith("שאלון לאתר"));
  await ph.click("text=להתחיל");
  ok("иврит: язык анкеты - иврит, сайт - на иврите (выбрано заранее)", (await ph.textContent("h1")) === "שפות" &&
    await ph.isChecked("input[type=radio][value='Иврит (עברית)']") && await ph.isChecked("input[type=checkbox][value='Иврит (עברית)']") &&
    (await ph.textContent(".count")) === "שלב 1 מתוך 15", await ph.textContent(".step"));
  await nh();
  await nh();
  ok("иврит: ошибка обязательного поля на иврите", (await ph.textContent(".field.bad .err")) === "נא למלא");
  await ph.fill("[data-key=name] input", "סטודיו לנה");
  await ph.fill("[data-key=kind] input", "מניקור ופדיקור באשדוד");
  await nh();
  await ph.fill("[data-key=tagline] textarea", "מניקור מוקפד בסטודיו נעים.");
  await nh(); await nh();
  await ph.fill("[data-key=phone] input", "050-765-4321");
  await nh();
  ok("иврит: дни недели коротко на иврите", (await ph.$$eval(".days .opt span", (e) => e.map((x) => x.textContent).join(" "))) === "א׳ ב׳ ג׳ ד׳ ה׳ ו׳ ש׳");
  await ph.click(`.days .opt:has-text("ב׳")`);
  // Переключение на английский посреди анкеты: всё на английском, ответы на месте.
  await ph.click(".lng[lang=en]");
  ok("переключение на EN: слева направо, тексты на английском, язык анкеты стал English", (await ph.getAttribute("html", "dir")) === "ltr" && (await ph.textContent("h1")) === "Opening hours" &&
    (await ph.evaluate(() => JSON.parse(localStorage.getItem("qp-anketa:new")).answers.formLang)) === "English");
  await ph.click(".lng[lang=he]");
  for (let i = 0; i < 12 && (await ph.textContent("h1")) !== "עיצוב האתר"; i++) {
    if ((await ph.textContent("h1")) === "שירותים ומחירים") await ph.fill("[data-key=service1Name] input", "מניקור");
    await nh();
  }
  ok("иврит: шаг «Вид сайта», цвета на иврите", (await ph.textContent("h1")) === "עיצוב האתר" && (await ph.textContent("[data-key=color]")).includes("כחול"), (await ph.textContent("h1")) + " / " + (await ph.textContent(".step")).slice(0, 300));
  await ph.click(".sw:has-text('כחול')");
  await ph.click(".dz:has-text('חלון תמונות')");
  await nh(); await nh();
  const rv = await ph.textContent(".step");
  ok("иврит: в проверке варианты ответа на иврите", (await ph.textContent("h1")) === "בדקו ושלחו" && rv.includes("כחול") && rv.includes("חלון תמונות") && rv.includes("שני") && !rv.includes("Синий"), rv.slice(0, 500));
  await ph.evaluate(() => { const d = JSON.parse(localStorage.getItem("qp-anketa:new")); d.started -= 60000; localStorage.setItem("qp-anketa:new", JSON.stringify(d)); });
  await ph.reload();
  await ph.click("text=להמשיך");
  await ph.click("[data-key=consent] .opt");
  const nReq = m.requests.length;
  await ph.click("#send");
  await ph.waitForSelector("text=השאלון נשלח", { timeout: 20000 });
  const sentHe = JSON.parse(m.requests[nReq].body).answers;
  ok("иврит: ответы уходят русскими значениями (язык, цвет, вид, дни, согласие)", sentHe.formLang === "Иврит (עברית)" && sentHe.languages.join() === "Иврит (עברית)" &&
    sentHe.color === "Синий" && sentHe.design === "Фото-витрина" && sentHe.workDays.join() === "Понедельник" && /^Я согласен/.test(sentHe.consent[0]), JSON.stringify(sentHe));
  const linkHe = await ph.inputValue(".keybox input");
  ok("иврит: личная ссылка с &lang=he", /\?edit=[0-9a-f]{40}&lang=he$/.test(linkHe), linkHe);
  // Ссылка без &lang (например, из письма клиенту) - язык берётся из анкеты.
  const ph2 = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await ph2.goto(linkHe.replace(/&lang=he$/, "").replace(/^https?:\/\/[^/]+\//, s.url));
  await ph2.waitForSelector(".hero h1");
  ok("ссылка без &lang: анкета на иврите (язык анкеты клиента)", (await ph2.textContent(".hero h1")) === "תיקון השאלון" && (await ph2.getAttribute("html", "dir")) === "rtl");
  // На 360 px шапка с RU / עב / EN не вылезает за край.
  await ph.goto(s.url + "?lang=he");
  await ph.click(".hero .btn-main");
  const over = await ph.evaluate(() => [...document.querySelectorAll(".top *")].filter((e) => { const r = e.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth; }).length + (document.documentElement.scrollWidth > innerWidth ? 100 : 0));
  ok("360 px, иврит: шапка шага (логотип, шаг, языки) в пределах экрана", over === 0, over);
  await ctxHe.close();

  // --- Фон по номеру дизайна ---
  const p3 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await p3.goto(s.url + "?d=1");
  await p3.waitForSelector(".bg.has-img", { timeout: 5000 }).catch(() => {});
  ok("?d=1: фон-картинка и цвет кнопок из строки 1", await p3.$(".bg.has-img") && (await p3.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--btn").trim())) === "#1d5fa6");
  await p3.goto(s.url + "?r=1");
  await p3.waitForSelector(".bg.has-img", { timeout: 5000 }).catch(() => {});
  ok("?r=1: фон канала (строка 1 «Фоны анкеты»)", await p3.$(".bg.has-img") && (await p3.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--btn").trim())) === "#1d5fa6");
  await p3.goto(s.url + "?d=99");
  await p3.waitForTimeout(300);
  ok("?d=99 (нет такой строки): обычная анкета", !(await p3.$(".bg.has-img")));
  await p3.route("**/bg/1.jpg", (r) => r.abort());
  await p3.goto(s.url + "?d=1");
  await p3.waitForTimeout(500);
  ok("?d=1, картинка не загрузилась: обычная анкета и обычный цвет", !(await p3.$(".bg.has-img")) && (await p3.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--btn").trim())) === "#17171c");
  ok("без ошибок в консоли", !errors.length, errors.join("\n"));

  await browser.close();
  s.server.close();
  const failed = checks.filter((c) => !c.pass);
  checks.forEach((c) => console.log((c.pass ? "PASS " : "FAIL ") + c.name + (c.pass ? "" : "\n     " + String(c.info).slice(0, 700))));
  console.log("\n" + (checks.length - failed.length) + "/" + checks.length + " passed");
  if (failed.length) process.exitCode = 1;
})().catch((e) => { console.error(e); checks.forEach((c) => console.log((c.pass ? "PASS " : "FAIL ") + c.name + (c.pass ? "" : "\n     " + String(c.info).slice(0, 700)))); process.exit(1); });
