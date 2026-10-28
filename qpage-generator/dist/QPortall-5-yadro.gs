// ===================== Ядро генератора (core.js, собрано build-gs.js 2026-10-28) =====================
/*
 * QPage - ядро генератора: из листа анкеты делает файлы сайта.
 * Один и тот же код работает в Node (generate.js) и в Google Apps Script (сборка build-gs.js).
 */
var QPageCore = (function () {
  "use strict";

  function fail(msg) { throw new Error(msg); }

  const LANGS = ["ru", "he", "en"];
  const MAX_SERVICES = 6;
  const MAX_FAQ = 4;
  const MAX_REVIEWS = 4;
  const MAX_LINES = 40; // строк прайса

  // Тексты шаблона, которые в демо написаны под «Мастер Дом», заменяем на общие.
  const GENERIC = {
    ru: {
      "ui.navOffers": "Вопросы",
      "offers.title": "Вопросы и ответы",
      "map.frameTitle": "Карта: наш адрес",
      "form.demoText": "Форма работает в демонстрационном режиме: введённые данные никуда не отправляются и не сохраняются. Чтобы связаться с нами, позвоните или напишите.",
      "form.intro": "Оставьте контакты, и мы свяжемся с вами.",
      "form.message": "Сообщение",
      "form.messageHint": "Коротко: что вам нужно",
      "form.errMessage": "Напишите сообщение (от 10 символов).",
      "form.resultDemo": "Заявка НЕ отправлена: это демонстрационная форма. Данные проверены и сразу удалены из памяти страницы. Чтобы связаться с нами, позвоните по телефону {phone}.",
      "form.resultOk": "Заявка отправлена. Мы свяжемся с вами в рабочее время.",
      "form.submit": "Отправить",
      "credentials.title": "Лицензии и дипломы",
      "pricelist.note": "",
      "video.frameTitle": "Видео",
      logoAlt: "Логотип «{name}»",
      photoAlt: "{name}: фото {n}",
      privacyContact: "Чтобы узнать, изменить или удалить свои данные, свяжитесь с нами: {contact}."
    },
    he: {
      "ui.navOffers": "שאלות",
      "offers.title": "שאלות ותשובות",
      "map.frameTitle": "מפה: הכתובת שלנו",
      "form.demoText": "הטופס פועל במצב הדגמה: הפרטים שתזינו לא נשלחים ולא נשמרים. כדי ליצור איתנו קשר, התקשרו או כתבו לנו.",
      "form.intro": "השאירו פרטים ונחזור אליכם.",
      "form.message": "הודעה",
      "form.messageHint": "בקצרה: במה נוכל לעזור",
      "form.errMessage": "נא לכתוב הודעה (10 תווים לפחות).",
      "form.resultDemo": "הפנייה לא נשלחה: זהו טופס הדגמה. הפרטים נבדקו ונמחקו מיד מזיכרון הדף. כדי ליצור איתנו קשר, התקשרו למספר {phone}.",
      "form.resultOk": "הפנייה נשלחה. נחזור אליכם בשעות הפעילות.",
      "form.submit": "שליחה",
      "credentials.title": "רישיונות ותעודות",
      "pricelist.note": "",
      "video.frameTitle": "סרטון",
      logoAlt: "הלוגו של {name}",
      photoAlt: "{name}: תמונה {n}",
      privacyContact: "כדי לעיין בפרטים שלכם, לתקן או למחוק אותם, פנו אלינו: {contact}."
    },
    en: {
      "ui.navOffers": "FAQ",
      "offers.title": "Questions and answers",
      "map.frameTitle": "Map: our address",
      "form.demoText": "This form is in demo mode: what you enter is not sent or stored anywhere. To reach us, call or message us.",
      "form.intro": "Leave your details and we will get back to you.",
      "form.message": "Message",
      "form.messageHint": "Briefly: how can we help?",
      "form.errMessage": "Please write a message (at least 10 characters).",
      "form.resultDemo": "Your request was NOT sent: this is a demo form. The data was checked and immediately discarded from the page. To reach us, call {phone}.",
      "form.resultOk": "Your request has been sent. We will get back to you during business hours.",
      "form.submit": "Send",
      "credentials.title": "Licences and qualifications",
      "pricelist.note": "",
      "video.frameTitle": "Video",
      logoAlt: "{name} logo",
      photoAlt: "{name}: photo {n}",
      privacyContact: "To see, correct or delete your data, contact us: {contact}."
    }
  };

  // Главная кнопка: [текст кнопки, заголовок формы] на каждом языке. В листе - русское название варианта.
  const CTA = {
    request: { label: "Оставить заявку", ru: ["Оставить заявку", "Оставить заявку"], he: ["השאירו פנייה", "השארת פנייה"], en: ["Send a request", "Send a request"] },
    order: { label: "Заказать", ru: ["Заказать", "Заказ"], he: ["להזמנה", "הזמנה"], en: ["Order", "Place an order"] },
    book: { label: "Записаться", ru: ["Записаться", "Запись"], he: ["לקביעת תור", "קביעת תור"], en: ["Book", "Book an appointment"] }
  };
  function ctaKey(v) {
    v = String(v || "").trim().toLowerCase();
    return Object.keys(CTA).find((k) => k === v || CTA[k].label.toLowerCase() === v) || "request";
  }

  // Версии внешнего вида. Ядро (блоки, тексты, форма, языки) общее; версия меняет оформление (style.css,
  // html[data-design]) и порядок блоков. order - все блоки после первого экрана, сверху вниз.
  // В анкете вариант пишется «Витрина - …», поэтому узнаём его по первому слову.
  // Сколько фото галереи занято первым экраном: без «Главного фото» крупно идёт 1-е фото работ.
  // Так же в app.js (renderHero, renderGallery).
  function heroUsed(main, n) { return main ? 0 : Math.min(1, n); }

  // Главное предложение рядом с фото владельца - коротко (подсказка в анкете, предупреждение в «проверить»).
  const TAGLINE_MAX = 400;

  // Порядок блоков после первого экрана - одинаковый во всех версиях.
  // story («Ваш главный текст») виден только в «Строгом».
  const ORDER = ["story", "about", "credentials", "services", "pricelist", "gallery", "steps", "video", "reviews", "offers", "contacts", "map", "form", "qr", "accessibility", "privacy"];
  const DESIGNS = {
    classic: { label: "Классический вариант", old: "Классика", order: ORDER },
    // Отличие только одно: сразу после первого экрана - мозаика фото работ (без того, что уже крупно вверху).
    showcase: { label: "Фото-витрина", old: "Витрина", order: ["story", "gallery"].concat(ORDER.filter((id) => id !== "gallery" && id !== "story")) },
    // Отличие только одно: сразу после первого экрана - «Ваш главный текст».
    strict: { label: "Текстовый блок", old: "Строгий", order: ORDER }
  };
  function designKey(v) {
    v = String(v || "").trim().toLowerCase();
    // old - как вариант назывался раньше («Витрина - …»): старые ответы продолжают работать.
    return Object.keys(DESIGNS).find((k) => k === v || [DESIGNS[k].label, DESIGNS[k].old].some((x) => v.indexOf(x.toLowerCase()) === 0)) || "classic";
  }

  // «Торт Наполеон - 120», «Маникюр: от 150 ₪» → { name, price }; без числа в конце - price: null.
  const PRICE_RE = /^(.*?)\s*[—–:-]\s*(?:от|from|החל מ־?|מ־)?\s*(?:₪\s*)?(\d[\d\s]*(?:[.,]\d+)?)\s*(?:₪|шек\.?|ש["״]ח|nis|ils)?\s*$/i;
  function splitPrice(line) {
    const m = String(line || "").match(PRICE_RE);
    if (!m || !m[1].trim()) return { name: String(line || "").trim(), price: null };
    return { name: m[1].trim(), price: parseFloat(m[2].replace(/\s/g, "").replace(",", ".")) };
  }
  // Строка прайса: как splitPrice, но без числа «Доставка - бесплатно» (тире с пробелами) → priceText: "бесплатно".
  // Только для прайса: в подписях к фото тире - часть текста.
  function splitPriceLine(line) {
    const r = splitPrice(line);
    if (r.price != null) return r;
    const t = r.name.match(/^(.+?)\s+[—–-]\s+(.+)$/);
    return t ? { name: t[1].trim(), price: null, priceText: t[2].trim() } : r;
  }

  // Код ролика YouTube из ссылки любого вида (или сам код).
  function youtubeId(s) {
    s = String(s || "").trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    const m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
    return m ? m[1] : "";
  }
  const isUrl = (s) => /^https?:\/\/\S+$/i.test(String(s || "").trim());

  // Видео не с YouTube (Instagram, TikTok…) показываем кнопкой-ссылкой: название сайта для текста.
  const VIDEO_HOSTS = { "instagram.com": "Instagram", "tiktok.com": "TikTok", "facebook.com": "Facebook", "fb.watch": "Facebook", "vimeo.com": "Vimeo" };
  function videoHost(url) {
    const h = (String(url).match(/^https?:\/\/([^/?#]+)/i) || [])[1] || "";
    const host = h.toLowerCase().replace(/^(www|m)\./, "");
    return VIDEO_HOSTS[host] || host;
  }

  // «Всё сделали за день - Анна К.» → { text, name }: имя после последнего тире с пробелами.
  function splitReview(line) {
    const m = String(line || "").match(/^(.*\S)\s+[—–-]\s+([^—–]+?)\s*$/);
    return m && m[2].length <= 40 ? { text: m[1], name: m[2] } : { text: String(line || "").trim(), name: "" };
  }

  // Часы работы из анкеты: дни галочками + «8-19» → «Вс–Чт 8:00-19:00, Пт 8:00-13:00» на каждом языке.
  const DAY_NAMES = {
    ru: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
    he: ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"],
    en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  };
  const DAY_PREFIX = [/^(вс|вос|sun|א)/i, /^(пн|пон|mon|ב)/i, /^(вт|tue|ג)/i, /^(ср|wed|ד)/i, /^(чт|чет|thu|ה)/i, /^(пт|пят|fri|ו)/i, /^(сб|суб|sat|ש)/i];
  function parseDays(s) {
    const out = [];
    String(s || "").split(/[,;\s]+/).filter(Boolean).forEach((w) => {
      const d = DAY_PREFIX.findIndex((re) => re.test(w));
      if (d !== -1 && !out.includes(d)) out.push(d);
    });
    return out.sort((a, b) => a - b);
  }
  // «8-19», «8:30 - 19», «08.00-13.00» → «8:00-19:00»; иначе null.
  function normHours(s) {
    const m = String(s || "").trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*[-–—]\s*(\d{1,2})(?:[:.](\d{2}))?$/);
    if (!m || +m[1] > 24 || +m[3] > 24) return null;
    return +m[1] + ":" + (m[2] || "00") + "–" + +m[3] + ":" + (m[4] || "00");
  }
  function dayRanges(days, names) {
    const parts = [];
    for (let i = 0; i < days.length; i++) {
      let j = i;
      while (j + 1 < days.length && days[j + 1] === days[j] + 1) j++;
      parts.push(j - i >= 2 ? names[days[i]] + "–" + names[days[j]] : days.slice(i, j + 1).map((d) => names[d]).join(", "));
      i = j;
    }
    return parts.join(", ");
  }
  function hoursText(daysStr, hours, fridayHours, lang) {
    const days = parseDays(daysStr), main = normHours(hours), fri = normHours(fridayHours);
    if (!days.length || !main) return "";
    const names = DAY_NAMES[lang];
    const t = (x) => (lang === "he" ? ltr(x) : x);
    const separate = fri && fri !== main && days.includes(5);
    const usual = separate ? days.filter((d) => d !== 5) : days;
    return [usual.length ? dayRanges(usual, names) + " " + t(main) : "", separate ? names[5] + " " + t(fri) : ""].filter(Boolean).join(", ");
  }

  // Лист таблицы → { key: { value, ru, he, en, check } }
  function rowsToFields(rows) {
    const head = rows[0].map((h) => String(h).trim());
    const col = (name) => head.indexOf(name);
    const need = ["поле", "значение", "ru", "he", "en"];
    need.forEach((n) => { if (col(n) === -1) fail("в листе нет колонки «" + n + "». Это лист анкеты?"); });
    const out = {};
    rows.slice(1).forEach((r) => {
      const key = String(r[col("поле")] || "").trim();
      if (!key) return;
      out[key] = {
        value: String(r[col("значение")] || "").trim(),
        ru: String(r[col("ru")] || "").trim(),
        he: String(r[col("he")] || "").trim(),
        en: String(r[col("en")] || "").trim(),
        check: col("проверить перевод") === -1 ? "" : String(r[col("проверить перевод")] || "").trim()
      };
    });
    return out;
  }

  function setPath(obj, p, v) {
    const keys = p.split(".");
    let o = obj;
    keys.slice(0, -1).forEach((k) => { o = o[k]; });
    o[keys[keys.length - 1]] = v;
  }

  const lines = (s) => String(s || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  const ltr = (s) => "⁦" + s + "⁩";

  function digits(s) { return String(s || "").replace(/\D/g, ""); }

  // 050-123-4567 → +972501234567; номера с кодом страны оставляем как есть.
  function intlPhone(s) {
    const d = digits(s);
    if (!d) return "";
    if (/^\s*\+/.test(s) || d.startsWith("972")) return "+" + d;
    if (d.startsWith("0")) return "+972" + d.slice(1);
    return "+" + d;
  }

  function hexToRgb(h) {
    const n = parseInt(h.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(c) { return "#" + c.map((x) => Math.round(x).toString(16).padStart(2, "0")).join(""); }
  function mix(a, b, t) { const x = hexToRgb(a), y = hexToRgb(b); return rgbToHex(x.map((v, i) => v + (y[i] - v) * t)); }

  // media - файлы клиента, уже положенные в сайт: { logo: "assets/img/logo.png" | null, photos: ["assets/img/photo-1.jpg", ...] }
  function buildData(f, tpl, media) {
    media = media || { logo: null, photos: [] };
    const v = (k) => (f[k] ? f[k].value : "");
    const tx = (k, lang) => (f[k] ? f[k][lang] : "");

    let langs = v("languages").split(",").map((s) => s.trim()).filter((l) => LANGS.includes(l));
    if (!langs.length) fail("в поле languages нет ни одного языка (ru, he, en).");
    langs = langs.filter((l, i) => langs.indexOf(l) === i);
    const main = langs[0];
    ["name", "kind", "tagline"].forEach((k) => {
      langs.forEach((l) => { if (!tx(k, l)) fail("пусто поле «" + k + "» на языке " + l + "."); });
    });
    if (!v("phone")) fail("не указан телефон.");

    const extra = v("blocks").split(",").map((s) => s.trim());
    const lat = parseFloat(v("lat")), lon = parseFloat(v("lon"));
    const hasCoords = isFinite(lat) && isFinite(lon);
    const hasAddress = langs.every((l) => tx("address", l));

    const services = [];
    for (let i = 1; i <= MAX_SERVICES; i++) {
      if (!tx("service" + i + "Name", main)) continue;
      // Цена - число («1000») или текст («Включено в стоимость»; переводы в колонках ru/he/en).
      const price = parseFloat(String(v("service" + i + "Price")).replace(",", "."));
      services.push({ i, price: isFinite(price) ? price : null });
    }
    const faq = [];
    for (let i = 1; i <= MAX_FAQ; i++) {
      if (tx("faq" + i + "Q", main) && tx("faq" + i + "A", main)) faq.push(i);
    }

    const warnings = [];
    // Прайс: строки основного языка задают цены и группы («Стрижки:»), остальные языки - только названия.
    const priceLines = lines(tx("pricelist", main)).slice(0, MAX_LINES);
    // Заголовков разделов в прайсе нет (28.10 Vadim: «Сантехника:» в конце строки только путало клиентов).
    const priceRows = priceLines.map((l) => ({ price: splitPrice(l).price }));
    const priceLink = isUrl(v("priceLink")) ? v("priceLink").trim() : "";
    if (String(tx("tagline", main) || v("tagline") || "").length > TAGLINE_MAX) warnings.push("главное предложение длиннее " + TAGLINE_MAX + " знаков - лучше сократить, большой текст - в «Ваш главный текст»");
    if (v("priceLink") && !priceLink) warnings.push("ссылка на прайс не начинается с https:// - кнопки нет: " + v("priceLink"));
    const licenseLink = isUrl(v("licenseLink")) ? v("licenseLink").trim() : "";
    if (v("licenseLink") && !licenseLink) warnings.push("ссылка на документ не начинается с https:// - кнопки нет: " + v("licenseLink"));
    const video = youtubeId(v("video"));
    const videoLink = !video && isUrl(v("video")) ? v("video").trim() : "";
    if (v("video") && !video && !videoLink) warnings.push("видео: ссылка не начинается с https:// - блока нет: " + v("video"));
    // Отзывы: новое поле reviews (по строке «текст - имя») или старые review1Text/review1Name.
    const reviewsOf = (l) => (f.reviews
      ? lines(tx("reviews", l)).slice(0, MAX_REVIEWS).map(splitReview)
      : Array.from({ length: MAX_REVIEWS }, (x, i) => i + 1).filter((i) => tx("review" + i + "Text", main))
        .map((i) => ({ text: tx("review" + i + "Text", l), name: v("review" + i + "Name") })));
    const nReviews = reviewsOf(main).length;
    if (f.reviews && lines(tx("reviews", main)).length > MAX_REVIEWS) warnings.push("отзывов больше " + MAX_REVIEWS + " - на сайте первые " + MAX_REVIEWS);
    const captionsMain = String(tx("captions", main) || "").split(/\r?\n/).map((x) => x.trim());
    const nCaptions = lines(tx("captions", main)).length;
    if (nCaptions > media.photos.length) {
      warnings.push(media.photos.length ? "подписей к фото больше, чем фото (" + nCaptions + " подписей, " + media.photos.length + " фото) - лишние не показаны"
        : "есть подписи к фото, но фото нет - подписи не показаны");
    }
    const noPrice = lines(tx("pricelist", main)).filter((l) => splitPrice(l).price == null && !splitPriceLine(l).priceText);
    if (noPrice.length) warnings.push("в прайсе строки без цены (цена пишется через тире: «Стрижка - 80»): " + noPrice.slice(0, 3).join(" | "));
    const hoursFromDays = !!(v("workDays") && normHours(v("workHours")));
    if (v("workHours") && !normHours(v("workHours"))) warnings.push("часы работы не по образцу 8:00-19:00 - не показаны: " + v("workHours"));
    if (v("fridayHours") && !normHours(v("fridayHours"))) warnings.push("часы в пятницу не по образцу 8:00-13:00 - не учтены: " + v("fridayHours"));
    const cta = ctaKey(v("cta"));
    const design = designKey(v("design"));

    const accent = /^#[0-9a-f]{6}$/i.test(v("color")) ? v("color") : "#0b6e69";
    const formOn = extra.includes("form");
    const mapOn = extra.includes("map") && hasAddress;
    if (formOn && !v("email") && !v("whatsapp")) warnings.push("форма заявки включена, но нет ни эл. почты, ни WhatsApp - заявки будут видны только в Netlify (Forms)");

    const site = {
      url: "",
      defaultLang: main,
      languages: langs,
      demoNotice: false,
      theme: { accent, accentDark: mix(accent, "#000000", 0.28), accentSoft: mix(accent, "#ffffff", 0.88) },
      design,
      order: DESIGNS[design].order,
      blocks: {
        about: langs.every((l) => lines(tx("about", l)).length > 0),
        services: services.length > 0,
        // В «Витрине» фото, которое уже крупно на первом экране, в мозаике не повторяется.
        gallery: media.photos.length > (design === "showcase" ? heroUsed(media.main, media.photos.length) : 0),
        story: design === "strict" && langs.every((l) => lines(tx("story", l)).length > 0),
        offers: faq.length > 0,
        contacts: true,
        map: mapOn,
        form: formOn,
        qr: extra.includes("qr"),
        privacy: true,
        credentials: langs.every((l) => lines(tx("license", l)).length > 0) || !!licenseLink || !!(media.docs || []).length,
        pricelist: priceRows.length > 0 || !!priceLink,
        steps: langs.every((l) => lines(tx("steps", l)).length > 0),
        video: !!(video || videoLink),
        reviews: nReviews > 0,
        accessibility: /^(да|yes|כן|1|true)$/i.test(v("a11y"))
      },
      logo: media.logo || "assets/img/logo.svg",
      mainPhoto: media.main || "",
      portrait: media.portrait || "",
      contacts: {
        phone: intlPhone(v("phone")),
        phoneDisplay: v("phone"),
        whatsapp: digits(intlPhone(v("whatsapp"))),
        telegram: v("telegram").replace(/^@/, ""),
        email: v("email")
      },
      map: { lat: hasCoords ? lat : null, lon: hasCoords ? lon : null, zoom: 16 },
      services: services.map((s) => ({ icon: "check", price: s.price })),
      gallery: media.photos.map((src, i) => ({ src, price: splitPrice(captionsMain[i]).price })),
      pricelist: { rows: priceRows, link: priceLink },
      credentials: { link: licenseLink, docs: media.docs || [] },
      video: { youtube: video, link: videoLink, host: videoLink ? videoHost(videoLink) : "" },
      accessibilityDate: new Date().toISOString().slice(0, 10),
      legal: v("legal"),
      madeBy: { url: isUrl(v("madeByUrl")) ? v("madeByUrl").trim() : "" },
      // Заявки: на почту (письмо от Netlify), без почты - в WhatsApp.
      form: { mode: formOn ? "netlify" : "demo", endpoint: "",
        channel: !formOn ? "" : v("email") ? "email" : v("whatsapp") ? "whatsapp" : "" }
    };

    const text = {};
    langs.forEach((l) => {
      const t = JSON.parse(JSON.stringify(tpl.text[l]));
      const g = GENERIC[l];
      Object.keys(g).forEach((k) => { if (k.includes(".")) setPath(t, k, g[k]); });
      const name = tx("name", l);
      t.meta.title = name + " - " + tx("kind", l);
      t.meta.description = metaDescription([tx("tagline", l)].concat(lines(tx("about", l)), [tx("areas", l), tx("address", l)]));
      t.hero = {
        name,
        kind: tx("kind", l),
        tagline: tx("tagline", l),
        facts: lines(tx("facts", l)).slice(0, 3),
        logoAlt: fill(g.logoAlt, { name })
      };
      t.about.text = lines(tx("about", l));
      t.story.text = lines(tx("story", l));
      t.services.items = services.map((s) => ({
        name: tx("service" + s.i + "Name", l),
        text: tx("service" + s.i + "Text", l),
        priceText: s.price == null ? tx("service" + s.i + "Price", l) || v("service" + s.i + "Price") : ""
      }));
      const captions = String(tx("captions", l) || "").split(/\r?\n/).map((x) => x.trim());
      t.gallery.items = media.photos.map((src, i) => ({
        // alt не повторяет подпись (иначе программа чтения прочтёт её дважды).
        alt: fill(g.photoAlt, { name, n: i + 1 }),
        // Цена из подписи («Торт - 120») показывается отдельно, в подписи остаётся название.
        caption: splitPrice(captions[i]).name
      }));
      const c = CTA[cta][l];
      t.ui.writeUs = c[0];
      t.form.title = c[1];
      const pl = lines(tx("pricelist", l));
      t.pricelist.items = priceRows.map((r, i) => ({ name: splitPriceLine(pl[i]).name || "", priceText: splitPriceLine(pl[i]).priceText || "" }));
      t.credentials.items = lines(tx("license", l));
      t.steps.items = lines(tx("steps", l)).slice(0, 8);
      t.reviews.items = reviewsOf(l);
      t.contacts.areasText = tx("areas", l) || "";
      t.offers.items = faq.map((i) => ({ title: tx("faq" + i + "Q", l), text: tx("faq" + i + "A", l) }));
      // В иврите время «10:00-20:00» должно читаться слева направо.
      t.contacts.hoursText = hoursFromDays ? hoursText(v("workDays"), v("workHours"), v("fridayHours"), l) : l === "he"
        ? tx("hours", l).replace(/[\u2066\u2069]/g, "").replace(/\d[\d:.]*(\s*[–-]\s*\d[\d:.]*)?/g, (m) => ltr(m))
        : tx("hours", l);
      t.map.address = tx("address", l);
      // Пункты о конфиденциальности: про форму и карту - только если они есть на сайте.
      const p = tpl.text[l].privacy.items;
      t.privacy.items = [p[0], p[1]]
        .concat(formOn ? [p[2]] : [])
        .concat(mapOn ? [p[3]] : [])
        .concat(video ? [p[4]] : [])
        .concat([g.privacyContact]); // {contact} сайт показывает ссылкой «написать нам», без адреса почты в тексте
      t.footer.rights = "© {year} " + name;
      text[l] = t;
    });
    const seo = {
      url: isUrl(v("siteUrl")) ? v("siteUrl").trim().replace(/\/*$/, "/") : "",
      days: hoursFromDays ? parseDays(v("workDays")) : [],
      hours: normHours(v("workHours")), friday: normHours(v("fridayHours"))
    };
    return { site, text, warnings, seo };
  }

  // Описание для поисковиков: 120-155 знаков (короче - Google дописывает своё, длиннее - обрезает).
  // Слоган, дальше пункты «О нас» и районы/адрес, пока не наберётся 120.
  function metaDescription(parts) {
    let out = "";
    for (let i = 0; i < parts.length && out.length < 120; i++) {
      const p = String(parts[i] || "").replace(/\s+/g, " ").trim().replace(/[.;:,]+$/, "");
      if (!p) continue;
      const add = (out ? ". " : "") + p;
      if (out.length + add.length <= 155) { out += add; continue; }
      if (out.length >= 100) break;
      // Не влезает целиком - обрезаем по слову.
      const cut = add.slice(0, 154 - out.length).replace(/\s+\S*$/, "");
      if (cut.replace(/^\. /, "").length > 15) out += cut + "…";
      break;
    }
    return out && !/[.!?…]$/.test(out) ? out + "." : out;
  }

  function contentJs(data, sourceName) {
    return "/*\n * QPage - данные сайта. Создано генератором из анкеты «" + sourceName + "».\n" +
      " * Если править руками - правьте здесь; при повторной генерации файл перезапишется.\n */\n" +
      "window.QPAGE = " + JSON.stringify(data, null, 2) + ";\n";
  }

  function escXml(s) {
    return String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  }

  // Простой логотип: круг цвета сайта и одна-две первые буквы названия.
  function logoSvg(name, accent) {
    const words = name.replace(/[«»"'״׳]/g, "").split(/\s+/).filter(Boolean);
    const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "Q").slice(0, 2)).toUpperCase();
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">' +
      '<circle cx="60" cy="60" r="60" fill="' + accent + '"/>' +
      '<text x="60" y="61" text-anchor="middle" dominant-baseline="central" fill="#fff" ' +
      'font-family="system-ui, -apple-system, \'Segoe UI\', Arial, sans-serif" font-size="46" font-weight="700">' +
      escXml(initials) + "</text></svg>\n";
  }

  // ---------- Страница в HTML без скрипта ----------
  // Скрипт сайта (app.js) наполняет страницу при открытии, а поисковики и проверки HTML читают сам файл.
  // Поэтому тот же текст основного языка вписываем в index.html заранее - той же разметкой, что строит
  // app.js (иначе при открытии страница «прыгает»). Сайт без скрипта тоже читается целиком.

  // Атрибут в открывающем теге: value - строка, true (без значения) или null (убрать).
  function tagAttr(tag, name, value) {
    const re = new RegExp("\\s" + name + '(?:="[^"]*")?(?=[\\s/>])');
    const put = value == null || value === false ? "" : " " + name + (value === true ? "" : '="' + escXml(value) + '"');
    if (re.test(tag)) return tag.replace(re, put);
    return put ? tag.replace(/\s*(\/?>)$/, put + "$1") : tag;
  }
  // Все открывающие теги, где есть attr (attr - кусок текста тега, например 'id="x"').
  function eachTag(html, test, fn) {
    return html.replace(/<[a-zA-Z][^<>]*>/g, (tag) => (typeof test === "string" ? tag.indexOf(test) !== -1 : test.test(tag)) ? fn(tag) : tag);
  }
  // Содержимое пустого элемента с этим id.
  function inner(html, id, content) {
    return html.replace(new RegExp('(<(\\w+)\\b[^<>]*\\sid="' + id + '"[^<>]*>)(</\\2>)'), (m, open, tag, close) => open + content + close);
  }
  const ICON = (n) => '<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-' + n + '"></use></svg>';
  const DOT = '<span class="dot" aria-hidden="true"></span>';
  const LOCALES = { ru: "ru-RU", he: "he-IL", en: "en-IL" };
  function getPath(obj, p) { return p.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj); }
  function money(v, lang) {
    try { return new Intl.NumberFormat(LOCALES[lang] || lang, { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v); }
    catch (e) { return "₪" + v; }
  }

  // Версия сайта: порядок блоков (и пунктов меню), чередование фона, фото на первом экране «Витрины».
  // То же делает app.js в браузере - здесь, чтобы страница сразу была в нужном виде.
  function arrange(html, S) {
    const order = S.order || [];
    const SEC = /(?:<!--(?:(?!-->)[\s\S])*-->\s*)?<section\b[^<>]*\sid="(\w+)"[\s\S]*?<\/section>/g;
    const mainM = html.match(/(<main\b[^<>]*>)([\s\S]*?)(<\/main>)/);
    if (mainM && order.length) {
      const body = mainM[2], parts = {}, ids = [];
      let m, first = -1, last = 0, gaps = "";
      SEC.lastIndex = 0;
      while ((m = SEC.exec(body))) {
        if (first < 0) first = m.index; else gaps += body.slice(last, m.index);
        parts[m[1]] = m[0]; ids.push(m[1]); last = m.index + m[0].length;
      }
      // Переставляем, только если между блоками нет ничего, кроме пробелов (иначе что-то потеряли бы).
      if (first >= 0 && !gaps.trim()) {
        const rest = ids.filter((id) => id !== "top" && order.indexOf(id) === -1);
        const seq = (parts.top ? ["top"] : []).concat(order.filter((id) => parts[id]), rest);
        html = html.replace(mainM[0], mainM[1] + body.slice(0, first) + seq.map((id) => parts[id]).join("\n\n    ") + body.slice(last) + mainM[3]);
      }
      const navM = html.match(/(<nav class="site-nav"[\s\S]*?<ul>)([\s\S]*?)(<\/ul>)/);
      if (navM) {
        const items = navM[2].match(/<li\b[\s\S]*?<\/li>/g) || [];
        const pos = (li) => { const h = (li.match(/href="#(\w+)"/) || [])[1]; const i = order.indexOf(h); return i < 0 ? 999 : i; };
        const sorted = items.map((li, i) => [li, i]).sort((a, b) => pos(a[0]) - pos(b[0]) || a[1] - b[1]).map((x) => x[0]);
        html = html.replace(navM[0], navM[1] + "\n          " + sorted.join("\n          ") + "\n        " + navM[3]);
      }
    }
    // Чередование фона по видимым блокам: соседние блоки не сливаются, даже если часть выключена.
    let n = 0;
    html = eachTag(html, /<section\b[^<>]*class="section[ "]/, (tag) => {
      const soft = !/\shidden\b/.test(tag) && n++ % 2 === 1;
      return tag.replace(/class="section( section-soft)?"/, 'class="section' + (soft ? " section-soft" : "") + '"');
    });
    return html;
  }

  function prerender(html, data, media) {
    const S = data.site, lang = S.defaultLang, t = data.text[lang], c = S.contacts, blocks = S.blocks;
    const e = escXml;

    // Блоки: выключенные - скрыты (то же правило, что в app.js).
    const OPT_IN = ["credentials", "pricelist", "steps", "video", "reviews", "accessibility", "story"];
    html = eachTag(html, "data-block=", (tag) => {
      const b = tag.match(/data-block="(\w+)"/)[1];
      return tagAttr(tag, "hidden", OPT_IN.includes(b) ? blocks[b] !== true : blocks[b] === false);
    });
    html = arrange(html, S);
    const demoForm = blocks.form && S.form.mode === "demo";
    html = eachTag(html, "data-form-demo", (tag) => tagAttr(tag, "hidden", !demoForm));
    const waOnly = S.form.mode !== "demo" && S.form.channel === "whatsapp" && !!c.whatsapp;
    if (waOnly) html = html.replace('id="f-submit" data-i18n="form.submit"', 'id="f-submit" data-i18n="form.submitWa"');
    html = eachTag(html, /data-lang="(\w+)"/, (tag) => {
      const l = tag.match(/data-lang="(\w+)"/)[1];
      return tagAttr(tagAttr(tag, "hidden", !S.languages.includes(l)), "aria-pressed", String(l === lang));
    });
    html = eachTag(html, 'id="lang-switch"', (tag) => tagAttr(tag, "hidden", S.languages.length < 2));
    const hasCoords = typeof S.map.lat === "number" && typeof S.map.lon === "number";
    html = eachTag(html, 'id="map-box"', (tag) => tagAttr(tag, "hidden", !hasCoords));
    const bar = !!(c.phone || c.whatsapp) && blocks.contacts !== false;
    html = eachTag(html, 'id="mobile-bar"', (tag) => tagAttr(tag, "hidden", !bar));
    if (bar) html = html.replace("<body>", '<body class="has-mobile-bar">');

    // Тексты с data-i18n и подписи-атрибуты (aria-label, alt).
    html = html.replace(/(<(\w+)\b[^<>]*\sdata-i18n="([\w.]+)"[^<>]*>)(<\/\2>)/g, (m, open, tag, key, close) => {
      const v = getPath(t, key);
      return typeof v === "string" ? open + e(v) + close : m;
    });
    html = eachTag(html, "data-i18n-attr=", (tag) => {
      tag.match(/data-i18n-attr="([^"]*)"/)[1].split(";").forEach((pair) => {
        const p = pair.split(":"), v = getPath(t, p[1]);
        if (typeof v === "string") tag = tagAttr(tag, p[0], v);
      });
      return tag;
    });
    html = inner(html, "menu-toggle-label", e(t.ui.menuOpen));

    // Логотип: файл, а если известен размер - сразу правильная форма (широкий логотип-надпись).
    const ls = media && media.logoSize;
    const wide = !!(ls && ls.w / Math.max(1, ls.h) >= 1.6);
    html = eachTag(html, "data-logo", (tag) => {
      tag = tagAttr(tag, "src", S.logo);
      if (ls) tag = tagAttr(tagAttr(tag, "width", String(ls.w)), "height", String(ls.h));
      return wide ? tag.replace('class="', 'class="is-wide ') : tag;
    });
    if (wide) html = html.replace(/<body( class="([^"]*)")?>/, (m, a, cls) => '<body class="' + (cls ? cls + " " : "") + 'logo-wide">');

    // Первый экран (одинаковый во всех версиях): в цветной заливке - фото владельца слева, по центру три строки;
    // под «Где работаем» и кнопками - предложение, под ним главное фото крупно
    // (нет «Главного фото» - 1-е фото работ). См. app.js renderHero.
    const ph = S.gallery || [], bigSrc = S.mainPhoto || (ph[0] || {}).src;
    if (bigSrc) {
      const alt = S.mainPhoto ? t.hero.name : t.gallery.items[0].alt;
      html = html.replace(/(<div class="container hero-body">[\s\S]*?)(\s*<\/div>\s*<\/section>)/,
        '$1\n        <div class="hero-photo-box"><img class="hero-photo-bg" src="' + e(bigSrc) + '" alt="" aria-hidden="true">' +
        '<img class="hero-photo" src="' + e(bigSrc) + '" alt="' + e(alt) + '" width="1280" height="720" fetchpriority="high"></div>$2');
    }
    if (S.portrait) {
      html = html.replace(/(<div class="hero-banner">\s*<div class="container">)/,
        '$1\n          <img class="hero-portrait" src="' + e(S.portrait) + '" alt="' + e(t.hero.name) + '" width="160" height="160">');
    }
    // Класс сразу в HTML: раскладка «фото слева, текст справа» видна до скрипта, без сдвига при загрузке.
    if (S.portrait) html = eachTag(html, 'id="top"', (tag) => tag.replace(/class="([^"]*)"/, (m, c) => 'class="' + c + ' has-portrait"'));
    // Длинное название - мельче (как app.js), класс сразу в HTML, без сдвига при загрузке.
    if ((t.hero.name || "").length > 30) html = eachTag(html, 'id="top"', (tag) => tag.replace(/class="([^"]*)"/, (m, c) => 'class="' + c + ' long-name"'));
    const areas = t.contacts.areasText || "";
    html = eachTag(html, 'id="hero-areas"', (tag) => tagAttr(tag, "hidden", !areas));
    html = inner(html, "hero-areas-text", e(areas));
    const facts = t.hero.facts.map((f) => "<li>" + ICON("check") + "<span>" + e(f) + "</span></li>").join("");
    html = inner(inner(html, "hero-facts", facts), "hero-facts-below", facts);
    html = inner(html, "story-text", (t.story.text || []).map((p) => "<p>" + e(p) + "</p>").join(""));
    html = eachTag(html, 'id="story"', (tag) => tagAttr(tag, "aria-label", t.story.title));
    html = inner(html, "about-text", t.about.text.map((p) => '<p class="dot-item">' + ICON("check") + "<span>" + e(p) + "</span></p>").join(""));

    // Услуги, прайс, лицензии, шаги, отзывы, вопросы.
    html = inner(html, "services-list", S.services.map((sv, i) => {
      const x = t.services.items[i];
      if (!x) return "";
      const price = sv.price == null ? x.priceText || t.ui.priceOnRequest : fill(t.ui.priceFrom, { price: money(sv.price, lang) });
      return '<li class="card"><h3 class="dot-item">' + DOT + "<span>" + e(x.name) + "</span></h3><p>" + e(x.text) +
        '</p><p class="card-price">' + e(price) + "</p></li>";
    }).join(""));
    const rows = S.pricelist.rows || [];
    const priceHtml = (t.pricelist.items || []).map((it, i) => {
      const r = rows[i] || {};
      return '<tr><th scope="row"><span class="dot-item">' + DOT + "<span>" + e(it.name) + "</span></span></th><td>" +
        e(typeof r.price === "number" ? money(r.price, lang) : it.priceText || t.ui.priceOnRequest) + "</td></tr>";
    }).join("");
    html = inner(html, "price-rows", priceHtml);
    html = eachTag(html, 'id="price-table"', (tag) => tagAttr(tag, "hidden", !priceHtml));
    html = eachTag(html, 'id="pricelist-note"', (tag) => tagAttr(tag, "hidden", !t.pricelist.note));
    const linkBtn = (id, href) => { html = eachTag(html, 'id="' + id + '"', (tag) => tagAttr(tagAttr(tag, "href", href || null), "hidden", !href)); };
    linkBtn("pricelist-link", S.pricelist.link);
    linkBtn("credentials-link", (S.credentials || {}).link);
    const docs = (S.credentials || {}).docs || [];
    html = inner(html, "credentials-docs", docs.map((src, i) => '<li><a href="' + e(src) + '" target="_blank" rel="noopener"><img src="' + e(src) +
      '" alt="' + e(t.credentials.title + " - " + (i + 1)) + '" loading="lazy" width="240" height="320"></a></li>').join(""));
    html = eachTag(html, 'id="credentials-docs"', (tag) => tagAttr(tag, "hidden", !docs.length));
    html = inner(html, "credentials-list", (t.credentials.items || []).map((x) => "<li>" + ICON("check") + "<span>" + e(x) + "</span></li>").join(""));
    html = inner(html, "steps-list", (t.steps.items || []).map((x) => "<li>" + e(x) + "</li>").join(""));
    html = inner(html, "reviews-list", (t.reviews.items || []).map((r) => '<details class="review"><summary>' +
      (r.name ? '<bdi class="review-name">' + e(r.name) + "</bdi>" : "") + '<span class="review-preview">' + e(r.text) + "</span></summary>" +
      '<div class="details-body"><blockquote><p>' + e(r.text) + "</p></blockquote></div></details>").join(""));
    html = inner(html, "offers-list", t.offers.items.map((o) => "<details><summary>" + e(o.title) +
      '</summary><div class="details-body"><p>' + e(o.text) + "</p></div></details>").join(""));
    // «Витрина»: фото с первого экрана в мозаике не повторяем.
    const skip = S.design === "showcase" ? heroUsed(S.mainPhoto, S.gallery.length) : 0;
    html = inner(html, "gallery-list", S.gallery.map((g, i) => {
      const x = t.gallery.items[i];
      if (!x || i < skip) return "";
      const hasPrice = typeof g.price === "number";
      return '<li><figure><img src="' + e(g.src) + '" alt="' + e(x.alt) + '" loading="lazy" width="640" height="420">' +
        (x.caption ? "<figcaption><span>" + e(x.caption) + "</span></figcaption>" : "") +
        (hasPrice ? '<strong class="photo-price">' + e(money(g.price, lang)) + "</strong>" : "") + "</figure></li>";
    }).join(""));

    // Видео: YouTube - кнопка «показать», другое - ссылка на тот сайт.
    const vmode = S.video.youtube ? "youtube" : "link";
    html = eachTag(html, "data-video-mode=", (tag) => tagAttr(tag, "hidden", tag.indexOf('data-video-mode="' + vmode + '"') === -1));
    if (vmode === "link" && S.video.link) {
      html = eachTag(html, 'id="video-link"', (tag) => tagAttr(tag, "href", S.video.link));
      html = inner(html, "video-link-note", e((t.video.noteLink || "").replace("{host}", S.video.host || "")));
    }

    // Контакты: ссылки звонка, WhatsApp, почты; пустые строки скрыты.
    const links = {
      "phone": c.phone ? "tel:" + c.phone : "", "phone-text": c.phone ? "tel:" + c.phone : "",
      "email": c.email ? "mailto:" + c.email : "", "email-text": c.email ? "mailto:" + c.email : "",
      "whatsapp": c.whatsapp ? "https://wa.me/" + c.whatsapp : "", "telegram": c.telegram ? "https://t.me/" + c.telegram : ""
    };
    html = eachTag(html, "data-contact=", (tag) => {
      const href = links[tag.match(/data-contact="([\w-]+)"/)[1]];
      return tagAttr(tagAttr(tag, "href", href || null), "hidden", !href);
    });
    html = html.replace(/(<bdi dir="ltr" data-phone-display>)(<\/bdi>)/g, "$1" + e(c.phoneDisplay) + "$2")
      .replace(/(<bdi dir="ltr" data-email-display>)(<\/bdi>)/g, "$1" + e(c.email) + "$2");
    const rowOn = { phone: c.phoneDisplay, email: c.email, hours: t.contacts.hoursText, areas: t.contacts.areasText };
    html = eachTag(html, "data-contact-row=", (tag) => tagAttr(tag, "hidden", !rowOn[tag.match(/data-contact-row="(\w+)"/)[1]]));
    if (c.whatsapp) html = eachTag(html, 'id="form-wa-link"', (tag) => tagAttr(tag, "href", "https://wa.me/" + c.whatsapp));

    // Карта: кнопки Google Maps и Waze.
    const q = hasCoords ? S.map.lat + "," + S.map.lon : encodeURIComponent(t.map.address || "");
    html = eachTag(html, 'id="map-google"', (tag) => tagAttr(tag, "href", "https://www.google.com/maps/search/?api=1&query=" + q));
    html = eachTag(html, 'id="map-waze"', (tag) => tagAttr(tag, "href", hasCoords ? "https://waze.com/ul?ll=" + q + "&navigate=yes" : "https://waze.com/ul?q=" + q + "&navigate=yes"));

    // Тексты со ссылками: {contact} - «написать нам» (почта) или «позвонить нам», {privacy} - раздел «Конфиденциальность».
    const rich = (str) => String(str || "").split(/(\{contact\}|\{email\}|\{privacy\})/).map((part) => {
      if (part === "{contact}" || part === "{email}") {
        return c.email ? '<a href="mailto:' + e(c.email) + '" class="text-link">' + e(t.ui.contactEmail || c.email) + "</a>"
          : '<a href="tel:' + e(c.phone) + '" class="text-link">' + e(t.ui.contactPhone || c.phoneDisplay) + "</a>";
      }
      if (part === "{privacy}") return '<a href="#privacy" class="text-link">' + e(lang === "ru" ? "«" + t.privacy.title + "»" : "\u201C" + t.privacy.title + "\u201D") + "</a>";
      return e(part);
    }).join("");
    html = inner(html, "privacy-list", t.privacy.items.map((p) => "<li>" + rich(p) + "</li>").join(""));
    html = inner(html, "f-consent-text", rich(t.form.consent));

    // Подвал.
    html = inner(html, "footer-rights", e(fill(t.footer.rights, { year: new Date().getFullYear() })));
    html = eachTag(html, 'id="footer-legal"', (tag) => tagAttr(tag, "hidden", !S.legal));
    html = inner(html, "footer-legal-text", e(S.legal || ""));
    const madeUrl = (S.madeBy || {}).url;
    html = eachTag(html, 'id="made-with"', (tag) => tagAttr(tag, "href", madeUrl || null));
    html = inner(html, "made-with-text", String(t.footer.madeWith || "").split("QPortall").map((part, i) =>
      (i ? '<span class="qpage-mark"><span class="qpage-q">Q</span>Portall</span>' : "") + e(part)).join(""));
    html = eachTag(html, 'class="made-with-order"', (tag) => tagAttr(tag, "hidden", !madeUrl || !t.footer.orderSite));

    // Ссылка без адреса не может открываться «в новом окне» и «скачиваться» (ошибка проверки HTML).
    return eachTag(html, /^<a\s/, (tag) => (/\shref=/.test(tag) ? tag : tagAttr(tagAttr(tagAttr(tag, "target", null), "rel", null), "download", null)));
  }

  // ---------- Для поисковиков и соцсетей ----------
  const OG_LOCALE = { ru: "ru_RU", he: "he_IL", en: "en_US" };
  const SCHEMA_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function seoHead(html, data, seo, media) {
    const S = data.site, lang = S.defaultLang, t = data.text[lang], c = S.contacts, url = seo.url;
    const abs = (p) => (url ? url + p : "");
    // Картинка для превью ссылки (WhatsApp, Facebook): первое фото, иначе логотип клиента (не SVG - его соцсети не показывают).
    const ogImg = S.mainPhoto || (S.gallery.length ? S.gallery[0].src : !/\.svg$/i.test(S.logo) ? S.logo : "");
    const tags = [];
    const meta = (prop, content) => { if (content) tags.push('<meta property="' + prop + '" content="' + escXml(content) + '">'); };
    if (url) tags.push('<link rel="canonical" href="' + escXml(url) + '">');
    meta("og:type", "website");
    meta("og:site_name", t.hero.name);
    meta("og:title", t.meta.title);
    meta("og:description", t.meta.description);
    meta("og:url", url);
    meta("og:locale", OG_LOCALE[lang]);
    S.languages.filter((l) => l !== lang).forEach((l) => meta("og:locale:alternate", OG_LOCALE[l]));
    if (url && ogImg) {
      meta("og:image", abs(ogImg));
      meta("og:image:alt", S.mainPhoto ? t.hero.name : S.gallery.length ? t.gallery.items[0].alt : t.hero.logoAlt);
      tags.push('<meta name="twitter:card" content="summary_large_image">');
    }

    // Карточка бизнеса для Google (schema.org LocalBusiness).
    const ld = { "@context": "https://schema.org", "@type": "LocalBusiness", name: t.hero.name, description: t.meta.description };
    if (url) ld.url = url;
    if (c.phone) ld.telephone = c.phone;
    if (c.email) ld.email = c.email;
    if (url && !/\.svg$/i.test(S.logo)) ld.logo = abs(S.logo);
    const imgs = S.gallery.map((g) => abs(g.src)).filter(Boolean);
    if (imgs.length) ld.image = imgs;
    else if (ld.logo) ld.image = ld.logo;
    if (t.map.address) ld.address = { "@type": "PostalAddress", streetAddress: t.map.address, addressCountry: "IL" };
    if (typeof S.map.lat === "number" && typeof S.map.lon === "number") ld.geo = { "@type": "GeoCoordinates", latitude: S.map.lat, longitude: S.map.lon };
    if (t.contacts.areasText) ld.areaServed = t.contacts.areasText;
    if (seo.days.length && seo.hours) {
      const hm = (x) => x.split("–").map((s) => ("0" + s).slice(-5));
      const spec = (days, h) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: days.map((d) => SCHEMA_DAYS[d]), opens: hm(h)[0], closes: hm(h)[1] });
      const fri = seo.friday && seo.friday !== seo.hours && seo.days.includes(5);
      const usual = fri ? seo.days.filter((d) => d !== 5) : seo.days;
      ld.openingHoursSpecification = (usual.length ? [spec(usual, seo.hours)] : []).concat(fri ? [spec([5], seo.friday)] : []);
    }
    const prices = S.services.map((s) => s.price).concat((S.pricelist.rows || []).map((r) => r.price)).filter((p) => typeof p === "number");
    if (prices.length) ld.currenciesAccepted = "ILS";
    // «<» внутри JSON заменяем, чтобы текст анкеты не мог закрыть тег script.
    tags.push('<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, "\\u003c") + "</script>");

    return html.replace(/(<meta name="description" content="[^"]*">)/, "$1\n  " + tags.join("\n  "));
  }

  // Ширина и высота картинки по первым байтам файла (PNG, JPEG, GIF, WebP); не узнали - null.
  // bytes - массив чисел (в Apps Script байты со знаком, поэтому & 255).
  function imageSize(bytes) {
    const b = (i) => bytes[i] & 255;
    const u16 = (i) => (b(i) << 8) | b(i + 1), u16le = (i) => b(i) | (b(i + 1) << 8);
    const u32 = (i) => ((b(i) << 24) >>> 0) + (b(i + 1) << 16) + (b(i + 2) << 8) + b(i + 3);
    if (!bytes || bytes.length < 30) return null;
    if (b(0) === 0x89 && b(1) === 0x50) return { w: u32(16), h: u32(20) };
    if (b(0) === 0x47 && b(1) === 0x49) return { w: u16le(6), h: u16le(8) };
    if (b(0) === 0x52 && b(8) === 0x57) { // RIFF....WEBP
      const kind = String.fromCharCode(b(12), b(13), b(14), b(15));
      if (kind === "VP8X") return { w: 1 + (b(24) | (b(25) << 8) | (b(26) << 16)), h: 1 + (b(27) | (b(28) << 8) | (b(29) << 16)) };
      if (kind === "VP8 ") return { w: u16le(26) & 0x3fff, h: u16le(28) & 0x3fff };
      if (kind === "VP8L") return { w: 1 + (((b(22) & 0x3f) << 8) | b(21)), h: 1 + (((b(24) & 0xf) << 10) | (b(23) << 2) | ((b(22) & 0xc0) >> 6)) };
      return null;
    }
    if (b(0) === 0xff && b(1) === 0xd8) {
      let i = 2;
      while (i + 9 < bytes.length) {
        if (b(i) !== 0xff) { i++; continue; }
        const m = b(i + 1);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: u16(i + 5), w: u16(i + 7) };
        i += 2 + u16(i + 2);
      }
    }
    return null;
  }

  const COPY = ["index.html", "_headers", "netlify.toml", "assets/css/style.css", "assets/js/app.js", "assets/js/vendor/qrcode.min.js"];

  // Готовые файлы сайта: { "index.html": "...", ... }. tplFiles - файлы шаблона по тем же путям,
  // tplText - тексты шаблона (window.QPAGE.text из его content.js).
  function siteFiles(fields, tplFiles, tplText, sourceName, media) {
    const built = buildData(fields, { text: tplText }, media);
    const data = { site: built.site, text: built.text };
    const files = {};
    COPY.forEach((rel) => {
      if (tplFiles[rel] == null) fail("в шаблоне нет файла " + rel + ".");
      files[rel] = tplFiles[rel];
    });
    const main = data.site.defaultLang;
    const t = data.text[main];
    let html = files["index.html"]
      .replace(/<html lang="[^"]*" dir="[^"]*"( data-langs="[^"]*")?( data-design="[^"]*")?>/, '<html lang="' + main + '" dir="' + (main === "he" ? "rtl" : "ltr") + '" data-langs="' + data.site.languages.join(",") + '" data-design="' + (data.site.design || "classic") + '">')
      .replace(/<title>[^<]*<\/title>/, "<title>" + escXml(t.meta.title) + "</title>")
      .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="' + escXml(t.meta.description) + '">')
      .replace(/<meta name="theme-color" content="[^"]*">/, '<meta name="theme-color" content="' + data.site.theme.accent + '">')
      .replace(/(<p class="container noscript" data-i18n="ui.noscript">)[^<]*/, "$1" + escXml(t.ui.noscript));
    if (data.site.form.mode === "netlify") {
      html = html.replace('<form id="contact-form" name="contact" method="post"', '<form id="contact-form" name="contact" method="post" data-netlify="true" data-netlify-honeypot="website"');
    }
    // Вся страница на основном языке - прямо в HTML (подписи полей формы тоже: по ним Netlify
    // подписывает поля в письме о заявке). Скрипт потом ставит язык посетителя.
    html = prerender(html, data, media);
    html = seoHead(html, data, built.seo, media);
    if (data.site.logo !== "assets/img/logo.svg") {
      // Свой логотип клиента - он же значок вкладки.
      const ext = data.site.logo.split(".").pop().toLowerCase();
      const type = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml", gif: "image/gif" }[ext];
      html = html.replace('<link rel="icon" href="assets/img/logo.svg" type="image/svg+xml">',
        '<link rel="icon" href="' + data.site.logo + '" type="' + type + '">');
    }
    // Метка версии у стилей и скриптов: браузер берёт их из кэша до часа, а с новой меткой - сразу новые.
    const ver = Date.now().toString(36);
    html = html.replace(/(href|src)="(assets\/(?:css|js)\/[^"?]+\.(?:css|js))"/g, (m, a, f) => a + '="' + f + "?v=" + ver + '"');
    files["index.html"] = html;
    files["assets/js/content.js"] = contentJs(data, sourceName);
    files["assets/img/logo.svg"] = logoSvg(t.hero.name, data.site.theme.accent);
    // Цвета сайта - сразу в стилях (а не только из скрипта): страница не мигает цветом шаблона.
    const th = data.site.theme;
    files["assets/css/style.css"] += "\n/* Цвета этого сайта (генератор) */\n:root { --accent: " + th.accent + "; --accent-dark: " + th.accentDark + "; --accent-soft: " + th.accentSoft + "; }\n";
    // Для поисковиков: что можно сканировать и где карта сайта (карта - только если известен адрес сайта).
    const url = built.seo.url;
    files["robots.txt"] = "User-agent: *\nAllow: /\n" + (url ? "\nSitemap: " + url + "sitemap.xml\n" : "");
    if (url) {
      files["sitemap.xml"] = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        "  <url><loc>" + escXml(url) + "</loc></url>\n</urlset>\n";
    }
    return { data, files, problems: selfCheck(data, tplText), notes: notes(fields, data).concat(built.warnings) };
  }

  // Проверка без браузера: во всех языках заполнены все тексты шаблона.
  function selfCheck(d, tplText) {
    const problems = [];
    const walk = (ref, obj, p, lang) => {
      Object.keys(ref).forEach((k) => {
        const r = ref[k], o = obj == null ? undefined : obj[k];
        // Эти тексты могут быть пустыми: строки и блоки с ними тогда не показываются.
        const mayBeEmpty = ["hoursText", "address", "areasText"].includes(k) || p + k === "pricelist.note";
        if (typeof r === "string" && (typeof o !== "string" || (!o.trim() && !mayBeEmpty))) problems.push(lang + ": пусто " + p + k);
        else if (r && typeof r === "object" && !Array.isArray(r)) walk(r, o, p + k + ".", lang);
      });
    };
    d.site.languages.forEach((l) => {
      walk(tplText.ru, d.text[l], "", l);
      if (d.text[l].services.items.length !== d.site.services.length) problems.push(l + ": число услуг не совпадает");
      if (d.text[l].gallery.items.length !== d.site.gallery.length) problems.push(l + ": число фото не совпадает");
      if (d.text[l].pricelist.items.length !== d.site.pricelist.rows.length) problems.push(l + ": число строк прайса не совпадает");
      if (d.text[l].pricelist.items.some((x) => !x.name)) problems.push(l + ": в прайсе есть строка без названия");
    });
    return problems;
  }

  // Что проверить человеку перед публикацией.
  function notes(fields, data) {
    const out = [];
    const groups = {};
    Object.keys(fields).filter((k) => fields[k].check).forEach((k) => {
      (groups[fields[k].check] = groups[fields[k].check] || []).push(k);
    });
    Object.keys(groups).forEach((g) => out.push((/^[a-z, ]+$/.test(g) ? "машинный перевод на " + g : g) + ": " + groups[g].join(", ")));
    if (data.site.blocks.form) out.push("форма заявки заработает только после публикации на Netlify (Netlify Forms)");
    return out;
  }

  // Какие файлы клиента годятся для сайта (браузеры не показывают HEIC с iPhone и т.п.).
  const IMAGE_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg", "image/gif": "gif" };
  const MAX_PHOTOS = 8; // «Фото-витрина» рассчитана на 8 фото (узор 2, 2, 1, 2, 1)

  return { rowsToFields, buildData, siteFiles, imageSize, metaDescription, splitPrice, youtubeId, splitReview, hoursText, COPY, LANGS, IMAGE_EXT, MAX_PHOTOS, MAX_REVIEWS, CTA, DESIGNS };
})();

if (typeof module !== "undefined") module.exports = QPageCore;
