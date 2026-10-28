/*
 * QPage - логика страницы: языки, наполнение блоков, форма, карта, QR-код.
 * Данные берутся из window.QPAGE (assets/js/content.js).
 */
(function () {
  "use strict";

  var DATA = window.QPAGE;
  var SITE = DATA.site;
  var RTL_LANGS = ["he", "ar"];
  var LOCALES = { ru: "ru-RU", he: "he-IL", en: "en-IL" };
  var STORAGE_KEY = "qpage-lang";
  var currentLang = null;
  var t = null; // тексты текущего языка

  // ---------- Утилиты ----------

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function get(obj, path) {
    return path.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }

  function fill(str, vars) {
    return String(str).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function icon(name) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "icon");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    var use = document.createElementNS(ns, "use");
    use.setAttribute("href", "#i-" + name);
    svg.appendChild(use);
    return svg;
  }

  // Маленький цветной кружок-маркер (без значка).
  function dot() { return el("span", { "class": "dot", "aria-hidden": "true" }); }

  function storageGet() {
    try { return window.localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  function storageSet(v) {
    try { window.localStorage.setItem(STORAGE_KEY, v); } catch (e) { /* хранилище недоступно - не страшно */ }
  }

  function formatPrice(value) {
    var nf = new Intl.NumberFormat(LOCALES[currentLang] || currentLang, {
      style: "currency", currency: "ILS", maximumFractionDigits: 0
    });
    return nf.format(value);
  }

  // Номер телефона всегда показывается слева направо, даже в иврите.
  function ltr(text) { return "⁦" + text + "⁩"; }

  // ---------- Выбор языка ----------

  function pickInitialLang() {
    var langs = SITE.languages;
    var fromUrl = new URLSearchParams(window.location.search).get("lang");
    if (fromUrl && langs.indexOf(fromUrl) !== -1) return fromUrl;
    var saved = storageGet();
    if (saved && langs.indexOf(saved) !== -1) return saved;
    var nav = (navigator.languages || [navigator.language || ""]);
    for (var i = 0; i < nav.length; i++) {
      var code = String(nav[i]).slice(0, 2).toLowerCase();
      if (code === "iw") code = "he";
      if (langs.indexOf(code) !== -1) return code;
    }
    return SITE.defaultLang;
  }

  function setLang(lang, opts) {
    opts = opts || {};
    currentLang = lang;
    t = DATA.text[lang];
    var html = document.documentElement;
    html.lang = lang;
    html.dir = RTL_LANGS.indexOf(lang) !== -1 ? "rtl" : "ltr";
    document.title = t.meta.title;
    var desc = $('meta[name="description"]');
    if (desc) desc.setAttribute("content", t.meta.description);

    $all(".lang-switch [data-lang]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === lang));
    });

    if (opts.save) storageSet(lang);
    if (opts.updateUrl) {
      var url = new URL(window.location.href);
      url.searchParams.set("lang", lang);
      try { window.history.replaceState(null, "", url.toString()); } catch (e) { /* file:// в некоторых браузерах */ }
    }
    render();
  }

  // ---------- Наполнение страницы ----------

  function applyStaticTexts() {
    $all("[data-i18n]").forEach(function (node) {
      var v = get(t, node.getAttribute("data-i18n"));
      if (typeof v === "string") node.textContent = v;
    });
    $all("[data-i18n-attr]").forEach(function (node) {
      node.getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
        var p = pair.split(":");
        var v = get(t, p[1]);
        if (typeof v === "string") node.setAttribute(p[0], v);
      });
    });
    updateMenuLabel();
  }

  // Текст с подстановками-ссылками: {contact} → «написать нам» (почта) или «позвонить нам»,
  // {privacy} → ссылка на раздел «Конфиденциальность». Сам адрес почты в тексте не показываем.
  function richText(node, str) {
    node.textContent = "";
    var c = SITE.contacts;
    String(str || "").split(/(\{contact\}|\{email\}|\{privacy\})/).forEach(function (part) {
      if (part === "{contact}" || part === "{email}") {
        node.appendChild(c.email
          ? el("a", { href: "mailto:" + c.email, "class": "text-link", text: t.ui.contactEmail || c.email })
          : el("a", { href: "tel:" + c.phone, "class": "text-link", text: t.ui.contactPhone || c.phoneDisplay }));
      } else if (part === "{privacy}") {
        node.appendChild(el("a", { href: "#privacy", "class": "text-link", text: currentLang === "ru" ? "«" + t.privacy.title + "»" : "\u201C" + t.privacy.title + "\u201D" }));
      } else if (part) node.appendChild(document.createTextNode(part));
    });
    return node;
  }

  function renderHero() {
    // Первый экран одинаковый во всех версиях (как core.js): в цветной заливке по центру - фото владельца
    // (лицо вызывает доверие), название, преимущества и предложение; ниже - главное фото крупно.
    var hero = $(".hero"), ph = SITE.gallery || [], bigSrc = SITE.mainPhoto || (ph[0] || {}).src;
    var big = $(".hero-photo"), photo = $(".hero-portrait"), box = $(".hero-banner .container");
    if (bigSrc && !big) {
      var frame = $(".hero-body").appendChild(el("div", { "class": "hero-photo-box" }));
      frame.appendChild(el("img", { "class": "hero-photo-bg", src: bigSrc, alt: "", "aria-hidden": "true" }));
      big = frame.appendChild(el("img", { "class": "hero-photo", src: bigSrc, alt: "", width: "1280", height: "720" }));
    }
    if (big) big.alt = SITE.mainPhoto || !t.gallery.items[0] ? t.hero.name : t.gallery.items[0].alt;
    if (SITE.portrait && !photo) {
      photo = el("img", { "class": "hero-portrait", src: SITE.portrait, alt: "", width: "160", height: "160" });
      box.insertBefore(photo, box.firstChild);
    }
    if (photo) photo.alt = t.hero.name;
    hero.classList.toggle("has-portrait", !!photo);
    hero.classList.toggle("long-name", (t.hero.name || "").length > 30);
    var areas = t.contacts.areasText || "";
    $("#hero-areas").hidden = !areas;
    $("#hero-areas-text").textContent = areas;
    ["#hero-facts", "#hero-facts-below"].forEach(function (sel) {
      var list = $(sel);
      if (!list) return;
      list.textContent = "";
      t.hero.facts.forEach(function (f) {
        list.appendChild(el("li", {}, [icon("check"), el("span", { text: f })]));
      });
    });
  }

  function renderStory() {
    var box = $("#story-text"), sec = $("#story");
    box.textContent = "";
    ((t.story && t.story.text) || []).forEach(function (p) { box.appendChild(el("p", { text: p })); });
    if (t.story) sec.setAttribute("aria-label", t.story.title);
  }

  function renderAbout() {
    var box = $("#about-text");
    box.textContent = "";
    t.about.text.forEach(function (p) { box.appendChild(el("p", { "class": "dot-item" }, [icon("check"), el("span", { text: p })])); });
  }

  function renderServices() {
    var list = $("#services-list");
    list.textContent = "";
    SITE.services.forEach(function (s, i) {
      var tx = t.services.items[i];
      if (!tx) return;
      var price = s.price == null
        ? tx.priceText || t.ui.priceOnRequest
        : fill(t.ui.priceFrom, { price: formatPrice(s.price) });
      list.appendChild(el("li", { "class": "card" }, [
        el("h3", { "class": "dot-item" }, [dot(), el("span", { text: tx.name })]),
        el("p", { text: tx.text }),
        el("p", { "class": "card-price", text: price })
      ]));
    });
  }

  function renderGallery() {
    var list = $("#gallery-list");
    list.textContent = "";
    // «Витрина»: фото с первого экрана в мозаике не повторяем (как core.js, heroUsed).
    var skip = SITE.design === "showcase" && !SITE.mainPhoto ? Math.min(1, SITE.gallery.length) : 0;
    SITE.gallery.forEach(function (g, i) {
      var tx = t.gallery.items[i];
      if (!tx || i < skip) return;
      // Подпись и цена у фото (так галерея служит и меню, и каталогом).
      var hasPrice = typeof g.price === "number";
      list.appendChild(el("li", {}, [
        el("figure", {}, [
          el("img", { "class": "ph-bg", src: g.src, alt: "", "aria-hidden": "true", loading: "lazy" }),
          el("img", { "class": "ph", src: g.src, alt: tx.alt, loading: "lazy", width: "640", height: "420" }),
          tx.caption ? el("figcaption", {}, [el("span", { text: tx.caption })]) : null,
          hasPrice ? el("strong", { "class": "photo-price", text: formatPrice(g.price) }) : null
        ])
      ]));
    });
  }

  // Прайс: строки «название - цена»; строка без цены с group: true - заголовок группы.
  function renderPricelist() {
    var body = $("#price-rows");
    body.textContent = "";
    if (!t.pricelist || !SITE.pricelist) return;
    var rows = SITE.pricelist.rows || [];
    (t.pricelist.items || []).forEach(function (it, i) {
      var r = rows[i] || {};
      if (r.group) {
        body.appendChild(el("tr", { "class": "price-group" }, [el("th", { scope: "colgroup", colspan: "2", text: it.name })]));
        return;
      }
      body.appendChild(el("tr", {}, [
        el("th", { scope: "row" }, [el("span", { "class": "dot-item" }, [dot(), el("span", { text: it.name })])]),
        el("td", { text: typeof r.price === "number" ? formatPrice(r.price) : it.priceText || t.ui.priceOnRequest })
      ]));
    });
    $("#price-table").hidden = !body.children.length;
    $("#pricelist-note").hidden = !t.pricelist.note;
    linkButton($("#pricelist-link"), SITE.pricelist.link);
  }

  function linkButton(a, href) {
    if (href) { a.setAttribute("href", href); a.hidden = false; }
    else { a.removeAttribute("href"); a.hidden = true; }
  }

  function renderCredentials() {
    var list = $("#credentials-list");
    list.textContent = "";
    if (!t.credentials) return;
    (t.credentials.items || []).forEach(function (c) {
      list.appendChild(el("li", {}, [icon("check"), el("span", { text: c })]));
    });
    // Фото документов: маленькие картинки, по нажатию открываются во весь размер.
    var docs = $("#credentials-docs");
    docs.textContent = "";
    ((SITE.credentials || {}).docs || []).forEach(function (src, i) {
      docs.appendChild(el("li", {}, [el("a", { href: src, target: "_blank", rel: "noopener" }, [
        el("img", { src: src, alt: t.credentials.title + " - " + (i + 1), loading: "lazy", width: "240", height: "320" })
      ])]));
    });
    docs.hidden = !docs.children.length;
    linkButton($("#credentials-link"), (SITE.credentials || {}).link);
  }

  // Фото документа - по центру экрана поверх сайта (а не в новой вкладке у левого края).
  // Нет поддержки <dialog> - ссылка откроет фото как обычно.
  var CLOSE = { ru: "Закрыть", he: "סגירה", en: "Close" };
  function showDoc(a) {
    var d = $("#doc-view");
    if (!d) {
      d = el("dialog", { id: "doc-view", "class": "doc-view" });
      if (typeof d.showModal !== "function") return false;
      d.appendChild(el("img", { alt: "" }));
      var close = el("button", { type: "button", "class": "doc-close", text: "×" });
      close.addEventListener("click", function () { d.close(); });
      d.appendChild(close);
      // Нажатие мимо фото (на затемнение) тоже закрывает.
      d.addEventListener("click", function (e) { if (e.target === d) d.close(); });
      document.body.appendChild(d);
    }
    var img = a.querySelector("img");
    d.querySelector("img").src = a.getAttribute("href");
    d.querySelector("img").alt = img ? img.alt : "";
    d.querySelector(".doc-close").setAttribute("aria-label", CLOSE[document.documentElement.lang] || CLOSE.en);
    d.showModal();
    return true;
  }

  function renderSteps() {
    var list = $("#steps-list");
    list.textContent = "";
    if (!t.steps) return;
    (t.steps.items || []).forEach(function (s) { list.appendChild(el("li", { text: s })); });
  }

  function renderReviews() {
    var list = $("#reviews-list");
    list.textContent = "";
    if (!t.reviews) return;
    // Свёрнутый отзыв: имя и начало текста; весь текст - по нажатию (как «Вопросы и ответы»).
    // Имя может быть на другом языке (кириллица на иврите): <bdi>, чтобы точка не убегала.
    (t.reviews.items || []).forEach(function (r) {
      list.appendChild(el("details", { "class": "review" }, [
        el("summary", {}, [
          r.name ? el("bdi", { "class": "review-name", text: r.name }) : null,
          el("span", { "class": "review-preview", text: r.text })
        ]),
        el("div", { "class": "details-body" }, [el("blockquote", {}, [el("p", { text: r.text })])])
      ]));
    });
  }

  // Видео не с YouTube: вместо встраивания - кнопка-ссылка на него.
  function renderVideoLink() {
    var v = SITE.video || {};
    var mode = v.youtube ? "youtube" : "link";
    $all("[data-video-mode]").forEach(function (n) { n.hidden = n.getAttribute("data-video-mode") !== mode; });
    if (mode === "link" && v.link && t.video) {
      $("#video-link").setAttribute("href", v.link);
      $("#video-link-note").textContent = (t.video.noteLink || "").replace("{host}", v.host || "");
    }
  }

  function showVideo() {
    var id = (SITE.video || {}).youtube;
    if (!id) return;
    var frame = el("iframe", {
      id: "video-frame",
      src: "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id) + "?autoplay=1&rel=0",
      title: t.video.frameTitle,
      allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
      allowfullscreen: "",
      referrerpolicy: "strict-origin-when-cross-origin"
    });
    var box = $("#video-box");
    box.textContent = "";
    box.appendChild(frame);
    frame.focus();
  }

  function renderAccessibility() {
    var list = $("#accessibility-list");
    list.textContent = "";
    if (!t.accessibility) return;
    var date = SITE.accessibilityDate
      ? new Intl.DateTimeFormat(LOCALES[currentLang] || currentLang, { dateStyle: "long" }).format(new Date(SITE.accessibilityDate + "T12:00:00"))
      : "";
    (t.accessibility.items || []).forEach(function (p) {
      if (!date && p.indexOf("{date}") !== -1) return;
      list.appendChild(richText(el("li"), fill(p, { date: date })));
    });
  }

  function renderOffers() {
    var box = $("#offers-list");
    // Сохраняем, какие пункты были раскрыты, чтобы смена языка их не сворачивала.
    var open = $all("details", box).map(function (d) { return d.open; });
    box.textContent = "";
    t.offers.items.forEach(function (o, i) {
      var d = el("details", {}, [
        el("summary", { text: o.title }),
        el("div", { "class": "details-body" }, [el("p", { text: o.text })])
      ]);
      if (open[i]) d.open = true;
      box.appendChild(d);
    });
  }

  function renderContacts() {
    var c = SITE.contacts;
    $all("[data-phone-display]").forEach(function (n) { n.textContent = c.phoneDisplay; });
    $all("[data-email-display]").forEach(function (n) { n.textContent = c.email; });

    var links = {
      "phone": c.phone ? "tel:" + c.phone : "",
      "phone-text": c.phone ? "tel:" + c.phone : "",
      "email": c.email ? "mailto:" + c.email : "",
      "email-text": c.email ? "mailto:" + c.email : "",
      "whatsapp": c.whatsapp ? "https://wa.me/" + c.whatsapp : "",
      "telegram": c.telegram ? "https://t.me/" + c.telegram : ""
    };
    $all("[data-contact]").forEach(function (a) {
      var href = links[a.getAttribute("data-contact")];
      if (href) { a.setAttribute("href", href); a.hidden = false; }
      else { a.removeAttribute("href"); a.hidden = true; }
    });
    // Пустые строки (нет почты, не указаны часы работы) не показываем.
    var rows = { phone: c.phoneDisplay, email: c.email, hours: t.contacts.hoursText, areas: t.contacts.areasText };
    $all("[data-contact-row]").forEach(function (row) {
      row.hidden = !rows[row.getAttribute("data-contact-row")];
    });
  }

  function hasCoords() {
    var m = SITE.map || {};
    return typeof m.lat === "number" && typeof m.lon === "number";
  }

  function renderMap() {
    var m = SITE.map;
    if (hasCoords()) {
      $("#map-google").setAttribute("href",
        "https://www.google.com/maps/search/?api=1&query=" + m.lat + "," + m.lon);
      $("#map-waze").setAttribute("href",
        "https://waze.com/ul?ll=" + m.lat + "," + m.lon + "&navigate=yes");
    } else {
      // Координат нет - ищем по адресу, а встроенную карту не показываем.
      var q = encodeURIComponent(t.map.address);
      $("#map-google").setAttribute("href", "https://www.google.com/maps/search/?api=1&query=" + q);
      $("#map-waze").setAttribute("href", "https://waze.com/ul?q=" + q + "&navigate=yes");
    }
    var frame = $("#map-frame");
    if (frame) frame.setAttribute("title", t.map.frameTitle);
    var vframe = $("#video-frame");
    if (vframe && t.video) vframe.setAttribute("title", t.video.frameTitle);
    renderVideoLink();
  }

  function showMap() {
    var m = SITE.map;
    var d = 0.004;
    var bbox = [m.lon - d, m.lat - d / 2, m.lon + d, m.lat + d / 2].join(",");
    var src = "https://www.openstreetmap.org/export/embed.html?bbox=" + bbox +
      "&layer=mapnik&marker=" + m.lat + "," + m.lon;
    var frame = el("iframe", {
      id: "map-frame",
      src: src,
      title: t.map.frameTitle,
      loading: "lazy",
      referrerpolicy: "no-referrer"
    });
    var box = $("#map-box");
    box.textContent = "";
    box.appendChild(frame);
    frame.focus();
  }

  function renderPrivacy() {
    var list = $("#privacy-list");
    list.textContent = "";
    t.privacy.items.forEach(function (p) {
      list.appendChild(richText(el("li"), p));
    });
  }

  function renderConsent() {
    richText($("#f-consent-text"), t.form.consent);
  }

  function renderFooter() {
    $("#footer-rights").textContent = fill(t.footer.rights, { year: new Date().getFullYear() });
    // Официальное название и номер бизнеса (ע.מ. / ח.פ.) - как есть, на любом языке сайта.
    $("#footer-legal").hidden = !SITE.legal;
    $("#footer-legal-text").textContent = SITE.legal || "";
    var made = $("#made-with"), url = (SITE.madeBy || {}).url;
    // «Сайт сделан на QPortall»: слово QPortall - логотипом (синяя Q, шрифт с засечками).
    var mt = $("#made-with-text");
    mt.textContent = "";
    String(t.footer.madeWith || "").split("QPortall").forEach(function (part, i) {
      if (i) mt.appendChild(el("span", { "class": "qpage-mark" }, [el("span", { "class": "qpage-q", text: "Q" }), document.createTextNode("Portall")]));
      if (part) mt.appendChild(document.createTextNode(part));
    });
    if (url) made.setAttribute("href", url); else made.removeAttribute("href");
    $(".made-with-order").hidden = !url || !t.footer.orderSite;
  }

  // ---------- QR-код ----------

  function siteUrl() {
    if (SITE.url) return SITE.url;
    var loc = window.location;
    if (loc.protocol === "http:" || loc.protocol === "https:") return loc.origin + loc.pathname;
    return null; // открыт как файл с диска
  }

  function renderQr() {
    if (typeof window.qrcode !== "function") return;
    var real = siteUrl();
    var url = real || "https://example.com/";
    var withLang = url + (url.indexOf("?") === -1 ? "?" : "&") + "lang=" + currentLang;
    var qr = window.qrcode(0, "M");
    qr.addData(withLang);
    qr.make();
    var svg = qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
    $("#qr-code").innerHTML = svg;
    var svgEl = $("#qr-code svg");
    if (svgEl) { svgEl.setAttribute("aria-hidden", "true"); svgEl.setAttribute("focusable", "false"); }
    $("#qr-url").textContent = withLang;
    $("#qr-local-note").hidden = !!real;
    var blob = new Blob([svg], { type: "image/svg+xml" });
    var link = $("#qr-download");
    if (link.dataset.blob) URL.revokeObjectURL(link.dataset.blob);
    var blobUrl = URL.createObjectURL(blob);
    link.dataset.blob = blobUrl;
    link.setAttribute("href", blobUrl);
    link.setAttribute("download", "qr-code.svg"); // в HTML без href атрибут download недопустим
    // «Поделиться» - только у настоящего адреса (не у файла на диске).
    $("#qr-share").hidden = !real;
    $("#qr-share").dataset.url = withLang;
    $("#qr-share-status").textContent = "";
  }

  // Меню «Поделиться» телефона; где его нет - копируем ссылку и говорим об этом.
  function shareSite() {
    var url = $("#qr-share").dataset.url;
    var status = $("#qr-share-status");
    status.textContent = "";
    var copy = function () {
      var done = function () { status.textContent = t.qr.copied; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { status.textContent = url; });
      else status.textContent = url;
    };
    if (navigator.share && !sharing) {
      // Телефон иногда «зависает» на прошлом окне «Поделиться» и отказывает молча -
      // тогда копируем ссылку. Отмена самим посетителем (AbortError) - не ошибка.
      sharing = true;
      var timer = setTimeout(function () { sharing = false; }, 15000);
      navigator.share({ title: document.title, url: url })
        .catch(function (e) { if (!e || e.name !== "AbortError") copy(); })
        .then(function () { clearTimeout(timer); sharing = false; });
      return;
    }
    copy();
  }
  var sharing = false;

  // ---------- Блоки ----------

  function applyBlocks() {
    var blocks = SITE.blocks || {};
    // Новые блоки показываются, только если включены явно (в старых content.js их нет).
    var OPT_IN = ["credentials", "pricelist", "steps", "video", "reviews", "accessibility", "story"];
    $all("[data-block]").forEach(function (n) {
      var name = n.getAttribute("data-block");
      n.hidden = OPT_IN.indexOf(name) !== -1 ? blocks[name] !== true : blocks[name] === false;
    });
    // Сообщение «форма в демо-режиме» - только если форма вообще есть на сайте.
    var demoForm = SITE.blocks.form && SITE.form.mode === "demo";
    $all("[data-form-demo]").forEach(function (n) { n.hidden = !demoForm; });
    // Без почты заявка уходит в WhatsApp - так и подписываем кнопку.
    if (waOnly()) $("#f-submit").setAttribute("data-i18n", "form.submitWa");
    $("#demo-notice").hidden = !SITE.demoNotice;
    $("#map-box").hidden = !hasCoords();

    // Кнопки только для языков сайта; при одном языке переключатель не нужен.
    var langs = SITE.languages;
    $all(".lang-switch [data-lang]").forEach(function (b) {
      b.hidden = langs.indexOf(b.getAttribute("data-lang")) === -1;
    });
    $("#lang-switch").hidden = langs.length < 2;
    if (!SITE.contacts.phone && !SITE.contacts.whatsapp) $("#mobile-bar").hidden = true;
    document.body.classList.toggle("has-mobile-bar", !$("#mobile-bar").hidden);
  }

  // ---------- Версия сайта ----------
  // Порядок блоков и меню, чередование фона, фото на первом экране «Витрины».
  // Генератор делает то же заранее (core.js, arrange), здесь - для шаблона и на всякий случай.
  function applyDesign() {
    var design = SITE.design || "classic", order = SITE.order || [];
    document.documentElement.setAttribute("data-design", design);
    var main = $("#main"), navList = $("#site-nav ul");
    order.forEach(function (id) {
      var s = document.getElementById(id);
      if (s && s.parentNode === main) main.appendChild(s);
      var a = navList && navList.querySelector('a[href="#' + id + '"]');
      if (a) navList.appendChild(a.parentNode);
    });
    var n = 0;
    $all("#main > section.section").forEach(function (s) { s.classList.toggle("section-soft", !s.hidden && n++ % 2 === 1); });
  }

  function applyTheme() {
    var th = SITE.theme || {};
    var root = document.documentElement.style;
    if (th.accent) root.setProperty("--accent", th.accent);
    if (th.accentDark) root.setProperty("--accent-dark", th.accentDark);
    if (th.accentSoft) root.setProperty("--accent-soft", th.accentSoft);
    $all("[data-logo]").forEach(function (img) {
      img.addEventListener("load", function () { fitLogo(img); });
      img.setAttribute("src", SITE.logo);
      if (img.complete && img.naturalWidth) fitLogo(img);
    });
  }

  // Логотип бывает квадратным значком, а бывает надписью (широкий). Широкий показываем
  // во всю ширину, без квадратной рамки; название рядом с ним в шапке не повторяем;
  // значок вкладки - первая буква названия, иначе надпись там не разобрать.
  function fitLogo(img) {
    var wide = img.naturalWidth / Math.max(1, img.naturalHeight) >= 1.6;
    img.classList.toggle("is-wide", wide);
    document.body.classList.toggle("logo-wide", wide);
    if (!wide || fitLogo.icon) return;
    fitLogo.icon = true;
    var main = DATA.text[SITE.defaultLang] || {};
    var letter = String((main.hero && main.hero.name) || "?").trim().charAt(0).toUpperCase();
    var accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#0b6e69";
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="' + accent +
      '"/><text x="32" y="44" font-family="Arial,sans-serif" font-size="36" font-weight="700" fill="#fff" text-anchor="middle">' +
      letter.replace(/[<&"]/g, "") + "</text></svg>";
    var link = document.querySelector('link[rel="icon"]');
    if (link) { link.setAttribute("type", "image/svg+xml"); link.setAttribute("href", "data:image/svg+xml," + encodeURIComponent(svg)); }
  }

  function render() {
    applyStaticTexts();
    renderHero();
    renderAbout();
    renderStory();
    renderServices();
    renderCredentials();
    renderPricelist();
    renderGallery();
    renderSteps();
    renderReviews();
    renderOffers();
    renderContacts();
    renderMap();
    renderAccessibility();
    renderPrivacy();
    renderFooter();
    renderConsent();
    renderQr();
    refreshFormErrors();
  }

  // ---------- Меню на телефоне ----------

  function updateMenuLabel() {
    var btn = $("#menu-toggle");
    var open = btn.getAttribute("aria-expanded") === "true";
    $("#menu-toggle-label").textContent = open ? t.ui.menuClose : t.ui.menuOpen;
  }

  function setMenu(open) {
    $("#menu-toggle").setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("menu-open", open);
    updateMenuLabel();
  }

  // ---------- Форма ----------

  var form, fields, touched = false, lastErrors = {};

  function digits(s) { return String(s).replace(/\D/g, ""); }

  function validate() {
    var e = {};
    var v = function (n) { return form.elements[n].value.trim(); };
    if (v("name").length < 2) e.name = "errName";
    var ph = v("phone");
    var d = digits(ph);
    if (!/^[+\d\s().-]*$/.test(ph) || d.length < 9 || d.length > 15) e.phone = "errPhone";
    var em = v("email");
    if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) e.email = "errEmail";
    if (v("message").length < 10) e.message = "errMessage";
    if (!form.elements.consent.checked) e.consent = "errConsent";
    return e;
  }

  function showErrors(errors) {
    lastErrors = errors;
    var names = ["name", "phone", "email", "message", "consent"];
    var count = 0;
    var summary = $("#error-summary");
    summary.textContent = "";
    var ul = el("ul");
    names.forEach(function (n) {
      var input = form.elements[n];
      var box = $("#f-" + n + "-err");
      var key = errors[n];
      if (key) {
        count++;
        input.setAttribute("aria-invalid", "true");
        box.textContent = t.form[key];
        var a = el("a", { href: "#f-" + n, text: t.form[key] });
        a.addEventListener("click", function (ev) { ev.preventDefault(); input.focus(); });
        ul.appendChild(el("li", {}, [a]));
      } else {
        input.removeAttribute("aria-invalid");
        box.textContent = "";
      }
    });
    if (count) {
      summary.appendChild(el("p", { text: fill(t.form.errSummary, { count: count }) }));
      summary.appendChild(ul);
      summary.hidden = false;
    } else {
      summary.hidden = true;
    }
    return count;
  }

  function refreshFormErrors() {
    if (form && touched) showErrors(validate());
    if (form && form.dataset.result) {
      var r = $("#form-result");
      r.textContent = fill(t.form[form.dataset.result], { phone: ltr(SITE.contacts.phoneDisplay) });
    }
  }

  function showResult(key, kind) {
    form.dataset.result = key;
    var r = $("#form-result");
    r.className = "form-result is-" + kind;
    r.textContent = fill(t.form[key], { phone: ltr(SITE.contacts.phoneDisplay) });
  }

  function clearResult() {
    delete form.dataset.result;
    var r = $("#form-result");
    r.className = "form-result";
    r.textContent = "";
  }

  function collect() {
    var out = {};
    ["name", "phone", "email", "message"].forEach(function (n) { out[n] = form.elements[n].value.trim(); });
    out.consent = form.elements.consent.checked;
    out.lang = currentLang;
    return out;
  }

  // Заявка через WhatsApp: у клиента нет почты для заявок.
  function waOnly() {
    return SITE.form.mode !== "demo" && SITE.form.channel === "whatsapp" && !!SITE.contacts.whatsapp;
  }

  // Ссылка wa.me с готовым текстом заявки на языке посетителя.
  function waLink(d) {
    var label = function (k) { return t.form[k].replace(/[?？:：]\s*$/, ""); };
    var text = [t.form.waIntro + " (" + location.hostname + ")",
      label("name") + ": " + d.name,
      label("phone") + ": " + d.phone,
      d.email ? label("email") + ": " + d.email : "",
      label("message") + ": " + d.message].filter(Boolean).join("\n");
    return "https://wa.me/" + SITE.contacts.whatsapp + "?text=" + encodeURIComponent(text);
  }

  function showWa(d, copy) {
    $("#form-wa-link").href = waLink(d);
    $("#form-wa-also").hidden = !copy;
    $("#form-wa").hidden = false;
  }

  function onSubmit(ev) {
    ev.preventDefault();
    touched = true;
    clearResult();
    $("#form-wa").hidden = true;
    var errors = validate();
    if (showErrors(errors)) {
      $("#error-summary").focus();
      return;
    }
    // Бот заполнил скрытое поле - молча ничего не делаем.
    if (form.elements.website.value) return;

    var mode = SITE.form.mode;
    if (mode === "demo") {
      // Ничего не отправляем и не сохраняем. Честно сообщаем об этом.
      showResult("resultDemo", "demo");
      return;
    }

    var data = collect();
    if (waOnly()) {
      // Открываем WhatsApp сразу, пока идёт нажатие (иначе браузер заблокирует окно).
      // Копия заявки остаётся в Netlify; её судьба посетителя не задерживает.
      window.open(waLink(data), "_blank", "noopener");
      if (mode === "netlify") {
        fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(new FormData(form)).toString() }).catch(function () {});
      }
      showResult("resultWa", "ok");
      showWa(data, false); // если окно не открылось - кнопка рядом
      form.reset();
      touched = false;
      return;
    }

    var btn = $("#f-submit");
    btn.disabled = true;
    btn.textContent = t.form.sending;
    var req;
    if (mode === "netlify") {
      var body = new URLSearchParams(new FormData(form)).toString();
      req = fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body });
    } else {
      req = fetch(SITE.form.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(collect()) });
    }
    req.then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      showResult("resultOk", "ok");
      if (SITE.form.channel === "email" && SITE.contacts.whatsapp) showWa(data, true);
      form.reset();
      touched = false;
    }).catch(function () {
      showResult("resultFail", "error");
    }).then(function () {
      btn.disabled = false;
      btn.textContent = t.form.submit;
    });
  }

  function initForm() {
    form = $("#contact-form");
    if (!form) return;
    form.addEventListener("submit", onSubmit);
    // После первой попытки отправки обновляем ошибки по мере ввода.
    form.addEventListener("input", function () { if (touched) showErrors(validate()); });
    form.addEventListener("change", function () { if (touched) showErrors(validate()); });
  }

  // ---------- Запуск ----------

  function init() {
    applyTheme();
    applyBlocks();
    applyDesign();

    $all(".lang-switch [data-lang]").forEach(function (b) {
      b.addEventListener("click", function () {
        setLang(b.getAttribute("data-lang"), { save: true, updateUrl: true });
      });
    });

    $("#menu-toggle").addEventListener("click", function () {
      setMenu($("#menu-toggle").getAttribute("aria-expanded") !== "true");
    });
    $all("#site-nav a").forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && document.body.classList.contains("menu-open")) {
        setMenu(false);
        $("#menu-toggle").focus();
      }
    });

    $("#map-show").addEventListener("click", showMap);
    $("#video-show").addEventListener("click", showVideo);
    $("#qr-share").addEventListener("click", shareSite);
    // Ссылки «Конфиденциальность» и «Доступность» в подвале сразу раскрывают полный текст.
    var MORE = { "#privacy": "#privacy-more", "#accessibility": "#accessibility-more" };
    function openMore(hash) { if (MORE[hash]) $(MORE[hash]).open = true; }
    window.addEventListener("hashchange", function () { openMore(location.hash); });
    // Ссылки создаются и при смене языка (например, в согласии формы), поэтому ловим нажатия на уровне документа.
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a[href^='#']");
      if (a) openMore(a.getAttribute("href"));
      var doc = e.target.closest && e.target.closest(".doc-photos a");
      if (doc && showDoc(doc)) e.preventDefault();
    });
    openMore(location.hash);
    initForm();
    setLang(pickInitialLang(), { save: false, updateUrl: false });
    document.documentElement.classList.remove("lang-wait"); // см. скрипт выбора языка в <head> index.html
  }

  init();
})();
