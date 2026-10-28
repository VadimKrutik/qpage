/*
 * Анкета QPortall: вопросы по шагам, фото с предпросмотром, черновик в браузере, отправка в Apps Script.
 * Вопросы и настройки — в config.js (window.QP_ANKETA), его пишет «QPortall → Опубликовать анкету QPortall».
 *   ?d=<номер>   — дизайн анкеты: фон и цвет из строки с этим номером листа «Фоны анкеты».
 *                  Нет такого номера или картинка не загрузилась — обычная (нейтральная) анкета.
 *   ?edit=<ключ> — личная ссылка: открыть свою анкету и исправить
 */
(function () {
  "use strict";
  var C = window.QP_ANKETA || {};
  var Q = (C.questions || []).filter(function (q) { return q.key; });
  var QK = {};
  Q.forEach(function (q) { QK[q.key] = q; });
  var params = new URLSearchParams(location.search);
  var EDIT = (params.get("edit") || "").replace(/[^0-9a-f]/gi, "").toLowerCase();
  // ?r=N — канал рекламы (лист «Каналы»): запоминается с анкетой; фон канала, если ?d= не указан.
  var REF = (params.get("r") || "").replace(/\D/g, "").slice(0, 4);
  var GROUP = (params.get("d") || "").replace(/\D/g, "") || (REF && C.channels && C.channels[REF]) || "";
  var G = (C.groups && C.groups[GROUP]) || null;
  var app = document.getElementById("app");
  var LINK = C.linkRe ? new RegExp(C.linkRe, "i") : null;
  var SKEY = "qp-anketa:" + (EDIT || "new");

  // Шаги: по 2–4 вопроса. Вопросы, которых здесь нет (новые в questions()), попадут в шаг «Ещё вопросы».
  var STEP_DEFS = [
    { id: "lang", title: "Языки", lead: "На каком языке вы пишете и на каких языках нужен сайт.", keys: ["formLang", "languages"] },
    { id: "about", title: "О вас", lead: "Как называется ваш бизнес и чем вы занимаетесь.", keys: ["name", "kind", "nameHe", "nameEn"] },
    { id: "offer", title: "Главное предложение", lead: "Это первое, что прочитают на сайте.", keys: ["tagline", "facts"] },
    { id: "more", title: "Подробнее о вас", lead: "Всё на этом шаге можно пропустить.", keys: ["about", "story", "legal"] },
    { id: "contacts", title: "Контакты", lead: "Как клиенты будут с вами связываться.", keys: ["phone", "whatsapp", "telegram", "email"] },
    { id: "hours", title: "Часы работы", keys: ["workDays", "workFrom", "workTo", "fridayTo"] },
    { id: "place", title: "Где вы работаете", keys: ["address", "areas"] },
    { id: "services", title: "Услуги и цены", lead: "До 6 услуг или товаров. Цена «от», в шекелях. Без цены будет «цена по запросу».", group: "service" },
    { id: "faq", title: "Частые вопросы", lead: "Сроки, гарантия, оплата. Можно пропустить.", group: "faq" },
    { id: "photos", title: "Фото", lead: "Всё можно добавить и позже, по вашей личной ссылке.", uploads: ["logo", "main", "portrait"] },
    { id: "gallery", title: "Ваши работы", uploads: ["photos"], keys: ["captions"] },
    { id: "extra", title: "Что ещё показать", lead: "Включите то, что нужно на вашем сайте.", gates: true },
    { id: "look", title: "Вид сайта", keys: ["color", "design"] },
    { id: "buttons", title: "Кнопка и блоки", keys: ["cta", "blocks", "a11y"] },
    { id: "review", title: "Проверьте и отправьте", lead: "Нажмите «Изменить», чтобы поправить любой шаг.", review: true, keys: ["consent"] }
  ];
  var UP = {
    logo: { title: "Логотип", help: "Если есть. Лучше PNG без фона.", max: 1, minPx: 0 },
    main: { title: "Главное фото", help: "Горизонтальное, хорошего качества. Будет крупно вверху сайта.", max: 1, minPx: (C.minPx || {}).main || 1200 },
    portrait: { title: "Ваше фото", help: "Ваше фото вверху сайта.", max: 1, minPx: (C.minPx || {}).portrait || 300 },
    photos: { title: "Фото работ", help: "До " + (C.maxPhotos || 8) + " фото работ или товаров. Порядок — как на сайте.", max: C.maxPhotos || 8, minPx: (C.minPx || {}).photo || 800 },
    docs: { title: "Фото лицензий и дипломов", help: "Закройте на фото номер удостоверения и адрес.", max: (C.maxFiles || {}).docs || 8, minPx: (C.minPx || {}).doc || 600 }
  };
  var DAYS_SHORT = { "Воскресенье": "Вс", "Понедельник": "Пн", "Вторник": "Вт", "Среда": "Ср", "Четверг": "Чт", "Пятница": "Пт", "Суббота": "Сб" };
  var DESIGN_TEXT = {
    showcase: "Мозаика из ваших фото",
    strict: "Ваш большой текст",
    classic: "Всё понемногу"
  };
  // Подсказки короче, чем в Google Форме (там они объясняют и то, что здесь видно само).
  // Подписи и подсказки анкеты (короче, чем в Google Форме). Пустая строка — без подсказки.
  var LABEL = {
    kind: "Чем вы занимаетесь", tagline: "Главное предложение", facts: "Ваши преимущества", legal: "Официальное название и номер",
    telegram: "Telegram", email: "Эл. почта", areas: "Куда выезжаете", captions: "Подписи к фото", cta: "Главная кнопка",
    blocks: "Что ещё добавить", a11y: "Заявление о доступности", pricelist: "Цены", reviews: "Отзывы", steps: "Шаги",
    license: "Лицензии и дипломы", priceLink: "Ссылка на файл с ценами"
  };
  var HELP = {
    languages: "Перевод на другие языки сделаем сами.",
    name: "Например: Студия Лана",
    kind: "Одной строкой. Например: Маникюр и педикюр в Ашдоде",
    tagline: "1–2 предложения: что вы делаете и почему выбрать вас.",
    facts: "Три главных преимущества, каждое с новой строки. Например: Опыт 10 лет",
    about: "2–4 предложения о себе.",
    story: "Нужен только для вида «Текстовый блок». Большой текст о вас или о деле.",
    legal: "Если есть, как в документах. Например: Иван Петров, עוסק מורשה 123456789. Будет мелко внизу сайта.",
    phone: "Например: 050-123-4567",
    whatsapp: "Пусто — кнопки WhatsApp не будет.",
    telegram: "Имя без @. Пусто — кнопки не будет.",
    workDays: "Не отметили — часов работы на сайте не будет.",
    fridayTo: "Если в пятницу заканчиваете раньше.",
    address: "Улица, дом, город. По адресу покажем карту.",
    areas: "Если выезжаете к клиентам. Через запятую: Хайфа, Нешер, Крайот",
    design: "Верх сайта у всех одинаковый, разница — в блоке под главным фото. Не выбрали — «Классический».",
    captions: "По строке на каждое фото, в том же порядке. Можно с ценой, перед ценой поставьте тире: Торт — 120",
    cta: "Что чаще делают ваши клиенты.",
    blocks: "",
    a11y: "Короткий раздел «Доступность сайта». По закону Израиля он нужен большинству сайтов. Не уверены — «Да».",
    pricelist: "По строке на позицию, перед ценой поставьте тире. Например: Замена смесителя — 250",
    priceLink: "Если цены есть в файле. Ссылка начинается с https://",
    reviews: "Каждый отзыв с новой строки, перед именем поставьте тире. Например: Всё сделали за день! — Анна",
    steps: "Каждый шаг с новой строки, до 8. Например: Вы звоните",
    license: "Каждый документ с новой строки. Например: Лицензия электрика № 123456",
    video: "Ссылка из кнопки «Поделиться»: YouTube, Instagram или TikTok.",
    wantPrices: "Таблица цен, если позиций много.",
    wantReviews: "До 4 коротких отзывов. Только настоящие.",
    wantSteps: "Например: звонок, выезд, работа, гарантия.",
    wantLicense: "Номер лицензии и фото документов.",
    wantVideo: "Одно видео с YouTube, Instagram или TikTok."
  };
  var SHORT = { Name: "Название", Text: "Описание", Price: "Цена от, ₪", Q: "Вопрос", A: "Ответ" };
  var GROUPS = {
    service: { re: /^service(\d+)(Name|Text|Price)$/, parts: ["Name", "Text", "Price"], item: "Услуга", add: "Добавить услугу" },
    faq: { re: /^faq(\d+)(Q|A)$/, parts: ["Q", "A"], item: "Вопрос", add: "Добавить вопрос" }
  };
  var ERR = {
    closed: "Анкета сейчас не принимает ответы. Попробуйте позже.",
    limit: "Сегодня анкет очень много. Попробуйте завтра.",
    edits: "Исправления закончились. Напишите нам, и мы поможем.",
    key: "Ссылка не найдена. Проверьте, что скопировали её целиком.",
    fast: "Не получилось отправить. Подождите минуту и нажмите ещё раз.",
    bot: "Не получилось отправить. Обновите страницу и попробуйте ещё раз.",
    busy: "Сейчас много отправок. Нажмите ещё раз через минуту.",
    server: "Не получилось сохранить анкету. Нажмите ещё раз через минуту. Если повторится — напишите нам.",
    links: "В тексте есть ссылка. Уберите её и отправьте ещё раз.",
    net: "Не получилось отправить. Проверьте интернет и нажмите ещё раз."
  };

  var STEPS = buildSteps();
  var state = { answers: {}, step: -1, started: Date.now(), shown: {}, fromReview: false, ref: REF };
  var files = { logo: [], main: [], portrait: [], photos: [], docs: [] };
  var removed = [];
  var server = null;     // при исправлении: ответ сервера (сколько правок осталось, имя)
  var errors = {};
  var hp = "";
  var lid = 0;

  // ---------- Оформление группы ----------
  // Цвет и фон включаем, только когда картинка загрузилась; иначе остаётся нейтральная анкета.
  (function theme() {
    if (!G || !G.img) return;
    var im = new Image();
    im.onload = function () {
      var root = document.documentElement.style;
      if (G.color) {
        root.setProperty("--accent", G.color);
        root.setProperty("--btn", G.color);
        if (luma(G.color) > 0.6) root.setProperty("--btn-text", "#17171c");
      }
      var bg = document.querySelector(".bg");
      if (bg) { bg.style.setProperty("--bg-img", "url('" + G.img + "')"); bg.classList.add("has-img"); }
    };
    im.src = G.img;
  })();
  function luma(hex) {
    var n = parseInt(hex.slice(1), 16);
    var c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  // ---------- Шаги ----------
  function buildSteps() {
    var used = {};
    var steps = STEP_DEFS.map(function (s) {
      var st = Object.assign({}, s);
      st.keys = (s.keys || []).filter(function (k) { return QK[k]; });
      st.keys.forEach(function (k) { used[k] = 1; });
      if (s.group) Q.forEach(function (q) { if (GROUPS[s.group].re.test(q.key)) used[q.key] = 1; });
      if (s.gates) Q.forEach(function (q) { if (q.gatePage || q.gate) used[q.key] = 1; });
      return st;
    });
    var rest = Q.filter(function (q) { return !used[q.key]; }).map(function (q) { return q.key; });
    if (rest.length) steps.splice(steps.length - 1, 0, { id: "rest", title: "Ещё вопросы", keys: rest });
    return steps;
  }
  function gateList() { return Q.filter(function (q) { return q.gatePage; }); }
  function gateOn(gkey) { return state.answers[gkey] === "Да"; }
  function groupMax(g) {
    var n = 0;
    Q.forEach(function (q) { var m = q.key.match(GROUPS[g].re); if (m) n = Math.max(n, +m[1]); });
    return n;
  }
  function groupFilled(g, i) {
    return GROUPS[g].parts.some(function (p) { return String(state.answers[g + i + p] || "").trim(); });
  }
  function groupShown(g) {
    if (state.shown[g]) return state.shown[g];
    var n = 1;
    for (var i = 1; i <= groupMax(g); i++) if (groupFilled(g, i)) n = i;
    return n;
  }
  function stepKeys(st) {
    var keys = st.keys.slice();
    if (st.group) {
      for (var i = 1; i <= groupShown(st.group); i++) GROUPS[st.group].parts.forEach(function (p) { if (QK[st.group + i + p]) keys.push(st.group + i + p); });
    }
    if (st.gates) gateList().forEach(function (g) {
      keys.push(g.key);
      if (gateOn(g.key)) Q.forEach(function (q) { if (q.gate === g.key) keys.push(q.key); });
    });
    return keys;
  }

  // ---------- Черновик: ответы — localStorage, фото — IndexedDB ----------
  function save() {
    try { localStorage.setItem(SKEY, JSON.stringify({ answers: state.answers, step: state.step, started: state.started, shown: state.shown, removed: removed, hp: hp, ref: state.ref })); } catch (e) { /* без черновика */ }
  }
  function loadDraft() {
    try { return JSON.parse(localStorage.getItem(SKEY) || "null"); } catch (e) { return null; }
  }
  function idb(fn) {
    return new Promise(function (resolve) {
      try {
        var req = indexedDB.open("qp-anketa", 1);
        req.onupgradeneeded = function () { req.result.createObjectStore("files"); };
        req.onsuccess = function () {
          try {
            var tx = req.result.transaction("files", "readwrite");
            var r = fn(tx.objectStore("files"));
            tx.oncomplete = function () { resolve(r && r.result); };
            tx.onerror = tx.onabort = function () { resolve(null); };
          } catch (e) { resolve(null); }
        };
        req.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }
  function saveFiles() {
    var list = [];
    Object.keys(files).forEach(function (k) { files[k].forEach(function (f) { if (f.blob) list.push({ kind: k, name: f.name, type: f.type, blob: f.blob, w: f.w, h: f.h }); }); });
    return idb(function (s) { return s.put(list, SKEY); });
  }
  function loadFiles() {
    return idb(function (s) { return s.get(SKEY); }).then(function (list) {
      (list || []).forEach(function (x) { if (files[x.kind]) files[x.kind].push(fileItem(x)); });
    });
  }
  function clearDraft() {
    try { localStorage.removeItem(SKEY); } catch (e) { /* нет */ }
    return idb(function (s) { return s.delete(SKEY); });
  }
  function fileItem(x) {
    return { lid: ++lid, kind: x.kind, name: x.name, type: x.type, blob: x.blob, w: x.w || 0, h: x.h || 0,
      url: x.blob && /^image\/(jpeg|png|webp|gif|svg\+xml)$/.test(x.blob.type) ? URL.createObjectURL(x.blob) : x.thumb || "", id: x.id || "" };
  }

  // ---------- Элементы ----------
  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else el.setAttribute(k, v === true ? "" : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      (Array.isArray(c) ? c : [c]).forEach(function (x) { if (x != null && x !== false) el.appendChild(typeof x === "string" ? document.createTextNode(x) : x); });
    }
    return el;
  }
  var uid = 0;
  function labelText(q) {
    for (var g in GROUPS) { var m = q.key.match(GROUPS[g].re); if (m) return SHORT[m[2]]; }
    return LABEL[q.key] || q.title;
  }
  function helpText(q) {
    if (/^(service|faq)\d/.test(q.key)) return "";
    if (HELP[q.key] != null) return HELP[q.key];
    return q.help || "";
  }
  function setAnswer(key, v) { state.answers[key] = v; delete errors[key]; save(); }

  function field(q) {
    var id = "f" + (++uid), hid = id + "h", eid = id + "e";
    var v = state.answers[q.key];
    var err = errors[q.key];
    var help = helpText(q);
    var describedBy = [help ? hid : "", err ? eid : ""].filter(Boolean).join(" ") || null;
    var req = q.required ? h("span", { class: "req", "aria-hidden": "true", text: "*" }) : null;
    var helpEl = help ? h("span", { class: "help", id: hid, text: help }) : null;
    var errEl = err ? h("span", { class: "err", id: eid, text: err }) : null;
    var wrapCls = "field" + (err ? " bad" : "");

    if (q.type === "text" || q.type === "paragraph") {
      var type = { phone: "tel", email: "email", url: "url" }[q.validate] || "text";
      var input = q.type === "paragraph"
        ? h("textarea", { id: id, rows: 3, dir: "auto", maxlength: q.max || 2000 })
        : h("input", { id: id, type: type, dir: "auto", maxlength: q.max || 300,
          inputmode: q.validate === "number" ? "decimal" : null,
          autocomplete: { phone: "tel", email: "email", name: "organization" }[q.validate || q.key] || "off" });
      input.value = v || "";
      if (q.required) input.setAttribute("aria-required", "true");
      if (err) input.setAttribute("aria-invalid", "true");
      if (describedBy) input.setAttribute("aria-describedby", describedBy);
      input.addEventListener("input", function () { setAnswer(q.key, input.value); if (input.tagName === "TEXTAREA") grow(input); clearErr(input); });
      if (input.tagName === "TEXTAREA") requestAnimationFrame(function () { grow(input); });
      return h("div", { class: wrapCls, "data-key": q.key }, h("label", { class: "label", for: id }, labelText(q), req), helpEl, input, errEl);
    }
    if (q.type === "list") {
      var sel = h("select", { id: id }, h("option", { value: "", text: "—" }), q.options.map(function (o) { return h("option", { value: o, text: o }); }));
      sel.value = v || "";
      if (describedBy) sel.setAttribute("aria-describedby", describedBy);
      sel.addEventListener("change", function () { setAnswer(q.key, sel.value); clearErr(sel); });
      return h("div", { class: wrapCls, "data-key": q.key }, h("label", { class: "label", for: id }, labelText(q), req), helpEl, sel, errEl);
    }
    // Выбор одного (choice) или нескольких (checkbox) — группа с подписью.
    var multi = q.type === "checkbox";
    var arr = multi ? (Array.isArray(v) ? v : v ? String(v).split(", ") : []) : null;
    var name = "n" + id;
    var opts;
    if (q.key === "color" && C.colors) {
      opts = h("div", { class: "swatches" }, C.colors.map(function (c) {
        return h("label", { class: "sw", style: "--c:" + c.value },
          radio(name, c.label, v === c.label, function () {
            setAnswer(q.key, c.label); markOk(opts);
            [].forEach.call(document.querySelectorAll(".sk"), function (sk) { sk.style.setProperty("--c", c.value); });
          }),
          h("span", null, h("i"), c.label));
      }));
    } else if (q.key === "design" && C.designs) {
      var col = (C.colors || []).filter(function (c) { return c.label === state.answers.color; })[0];
      opts = h("div", { class: "designs" }, C.designs.map(function (d) {
        return h("label", { class: "dz" },
          radio(name, d.label, v === d.label, function () { setAnswer(q.key, d.label); }),
          h("span", null, sketch(d.key, col && col.value), h("span", { class: "dz-t" }, h("b", { text: d.label }), h("small", { text: DESIGN_TEXT[d.key] || "" }))));
      }));
    } else {
      opts = h("div", { class: "opts" + (q.key === "workDays" ? " days" : "") }, q.options.map(function (o) {
        var short = q.key === "workDays" && DAYS_SHORT[o];
        var inp = multi
          ? h("input", { type: "checkbox", name: name, value: o, checked: arr.indexOf(o) !== -1, "aria-label": short ? o : null })
          : radio(name, o, v === o);
        inp.addEventListener("change", function () {
          if (multi) {
            var now = [].slice.call(opts.querySelectorAll("input:checked")).map(function (x) { return x.value; });
            setAnswer(q.key, now);
          } else setAnswer(q.key, o);
          markOk(opts);
        });
        return h("label", { class: "opt" }, inp, h("span", { title: short ? o : null, "aria-hidden": short ? "true" : null }, short || o));
      }));
    }
    var fs = h("fieldset", { class: wrapCls, "data-key": q.key, "aria-describedby": describedBy },
      h("legend", { class: "label" }, labelText(q), req), helpEl, opts, errEl);
    return fs;
  }
  function radio(name, value, checked, onchange) {
    var r = h("input", { type: "radio", name: name, value: value, checked: checked });
    if (onchange) r.addEventListener("change", onchange);
    return r;
  }
  function sketch(key, color) {
    var parts = [h("i", { class: "hd" }), h("i", { class: "tx" }), h("i", { class: "ph" })];
    if (key === "showcase") parts.push(h("i", { class: "mo" }, h("i"), h("i"), h("i")));
    else if (key === "strict") parts.push(h("i", { class: "tx" }), h("i", { class: "tx" }), h("i", { class: "tx" }), h("i", { class: "tx", style: "width:60%" }));
    else parts.push(h("i"), h("i", { style: "width:70%" }), h("i", { class: "tx" }));
    return h("span", { class: "sk", "aria-hidden": "true", style: color ? "--c:" + color : null }, parts);
  }
  function grow(t) { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight + 3, 420) + "px"; }
  function clearErr(el) {
    var f = el.closest(".field");
    if (!f || !f.classList.contains("bad")) return;
    f.classList.remove("bad");
    var e = f.querySelector(".err");
    if (e) e.remove();
    el.removeAttribute("aria-invalid");
  }
  function markOk(el) { clearErr(el); }

  // Сколько раз ещё можно менять анкету, клиенту не пишем (Vadim: сбивает с толку) — только когда больше нельзя.
  function timesLeft(n) {
    return (Number(n) || 0) <= 0 ? "Изменить анкету больше нельзя." : "";
  }

  // ---------- Проверка ----------
  function check(q, v) {
    var empty = Array.isArray(v) ? !v.length : !String(v == null ? "" : v).trim();
    if (empty) return q.required ? (q.type === "choice" || q.type === "checkbox" || q.type === "list" ? "Выберите вариант" : "Заполните, пожалуйста") : "";
    var s = String(v).trim();
    if (q.validate === "phone" && !(/^\+?[0-9 ()-]{9,20}$/.test(s) && s.replace(/\D/g, "").length >= 9)) return "Только цифры, пробелы, + ( ) и -; от 9 цифр. Например: 050-123-4567";
    if (q.validate === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return "Проверьте адрес, например: name@example.com";
    if (q.validate === "url" && !/^https?:\/\/[^\s.]+\.\S+$/.test(s)) return "Нужна ссылка, начинается с https://";
    if (q.validate === "number" && !/^\d+([.,]\d+)?$/.test(s)) return "Только число, например: 250";
    var lines = s.split("\n");
    if (q.lines && lines.length > q.lines) return "Не больше " + q.lines + " строк";
    if (q.lineMax && lines.some(function (l) { return l.trim().length > q.lineMax; })) return "Строка длинновата: не больше " + q.lineMax + " знаков";
    if (q.max && s.length > q.max) return "Слишком длинно: не больше " + q.max + " знаков";
    if (LINK && q.validate !== "url" && q.validate !== "email" && LINK.test(s)) return "Без ссылок, пожалуйста";
    return "";
  }
  function validateStep(st) {
    var bad = [];
    stepKeys(st).forEach(function (k) {
      var e = check(QK[k], state.answers[k]);
      if (e) { errors[k] = e; bad.push(k); } else delete errors[k];
    });
    return bad;
  }

  // ---------- Фото ----------
  function uploadBox(kind) {
    var u = UP[kind];
    var id = "u" + (++uid);
    var list = h("div", { class: "thumbs" });
    var input = h("input", { type: "file", id: id, accept: "image/*,.heic,.heif", multiple: u.max > 1 });
    var drop = h("label", { class: "drop", for: id },
      h("span", { html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>' }),
      h("b", { text: u.max > 1 ? "Выбрать фото" : "Выбрать фото" }),
      h("small", { text: u.max > 1 ? "Можно несколько сразу" : "Одно фото" }), input);
    var msg = h("span", { class: "err", hidden: true });
    function redraw() {
      list.innerHTML = "";
      files[kind].forEach(function (f, i) {
        var warn = u.minPx && f.w && f.w < u.minPx ? h("span", { class: "warn", text: "Маленькое фото, может быть нечётким" }) : null;
        list.appendChild(h("div", { class: "th" },
          f.url ? h("img", { src: f.url, alt: "" }) : h("span", { class: "noimg", text: f.name || "фото" }),
          u.max > 1 ? h("span", { class: "num", text: String(i + 1) }) : null,
          h("button", { type: "button", class: "x", "aria-label": "Убрать фото " + (u.max > 1 ? i + 1 : ""), text: "×", onclick: function () {
            files[kind].splice(i, 1);
            if (f.id) removed.push(f.id);
            if (f.url && f.blob) URL.revokeObjectURL(f.url);
            save(); saveFiles(); redraw();
          } }), warn));
      });
      drop.hidden = files[kind].length >= u.max && u.max > 1;
      if (u.max === 1) drop.querySelector("b").textContent = files[kind].length ? "Заменить фото" : "Выбрать фото";
    }
    function add(list0) {
      msg.hidden = true;
      var pick = [].slice.call(list0 || []);
      if (!pick.length) return;
      var room = u.max === 1 ? 1 : u.max - files[kind].length;
      if (pick.length > room) { msg.textContent = "Можно не больше " + u.max + " фото. Лишние не добавлены."; msg.hidden = false; pick = pick.slice(0, room); }
      drop.classList.add("busy");
      Promise.all(pick.map(function (f) { return prep(f, kind); })).then(function (ready) {
        ready.forEach(function (r) {
          if (r.error) { msg.textContent = r.error; msg.hidden = false; return; }
          if (u.max === 1) {
            files[kind].forEach(function (f) { if (f.id) removed.push(f.id); });
            files[kind] = [];
          }
          files[kind].push(fileItem(r));
        });
        drop.classList.remove("busy");
        save(); saveFiles(); redraw();
      });
    }
    input.addEventListener("change", function () { add(input.files); input.value = ""; });
    ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
    drop.addEventListener("drop", function (e) { add(e.dataTransfer && e.dataTransfer.files); });
    redraw();
    return h("div", { class: "field up-" + kind + (u.max === 1 ? " one" : "") },
      h("span", { class: "label", text: u.title }), h("span", { class: "help", text: u.help }), drop, msg, list);
  }

  // Фото уменьшаем в браузере (до 1600 точек, логотип до 800): отправка быстрее, сайт легче.
  // То, что браузер не умеет открыть (например HEIC в Chrome), уходит как есть — скрипт таблицы переведёт в JPG.
  function prep(file, kind) {
    var max = kind === "logo" ? 800 : 1600;
    var raw = { kind: kind, name: file.name, type: file.type, blob: file, w: 0, h: 0 };
    if (file.size > 25 * 1024 * 1024) return Promise.resolve({ error: "Файл больше 25 МБ: " + file.name });
    if (/svg/.test(file.type) || /\.svg$/i.test(file.name)) return Promise.resolve(raw);
    return decode(file).then(function (img) {
      if (!img) {
        if (file.size > 8 * 1024 * 1024) return { error: "Не удалось открыть фото: " + file.name + ". Сохраните его как JPG." };
        return raw;
      }
      var w = img.width, hh = img.height, k = Math.min(1, max / Math.max(w, hh));
      var keepPng = kind === "logo" && /png|webp|gif/.test(file.type);
      if (k === 1 && file.size < 400000 && /jpeg|png|webp/.test(file.type)) { if (img.close) img.close(); raw.w = w; raw.h = hh; return raw; }
      var cv = document.createElement("canvas");
      cv.width = Math.round(w * k); cv.height = Math.round(hh * k);
      var ctx = cv.getContext("2d");
      if (!keepPng) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height); }
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      if (img.close) img.close();
      return new Promise(function (res) {
        cv.toBlob(function (b) {
          if (!b) { raw.w = w; raw.h = hh; res(raw); return; }
          var name = file.name.replace(/\.[^.]+$/, "") + (keepPng ? ".png" : ".jpg");
          res({ kind: kind, name: name, type: b.type, blob: b, w: w, h: hh });
        }, keepPng ? "image/png" : "image/jpeg", 0.86);
      });
    });
  }
  function decode(file) {
    var viaImg = function () {
      return new Promise(function (res) {
        var url = URL.createObjectURL(file), im = new Image();
        im.onload = function () { res(im.naturalWidth ? im : null); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); };
        im.onerror = function () { URL.revokeObjectURL(url); res(null); };
        im.src = url;
      });
    };
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: "from-image" }).catch(viaImg);
    }
    return viaImg();
  }

  // ---------- Экраны ----------
  function render(focus) {
    app.innerHTML = "";
    if (state.step < 0) return intro();
    var st = STEPS[state.step];
    var n = state.step + 1, total = STEPS.length;
    var title = h("h1", { tabindex: "-1", text: st.title });
    var body = h("div", { class: "step" });
    if (EDIT && server) body.appendChild(h("p", { class: "banner", text: ("Вы меняете анкету. " + timesLeft(server.editsLeft)).trim() }));
    if (st.lead) body.appendChild(h("p", { class: "lead", text: st.lead }));
    if (st.uploads) st.uploads.forEach(function (k) { body.appendChild(uploadBox(k)); });
    st.keys.forEach(function (k) { if (!st.review) body.appendChild(field(QK[k])); });
    if (st.group) body.appendChild(groupBlock(st.group));
    if (st.gates) gateList().forEach(function (g) { body.appendChild(gateBlock(g)); });
    if (st.review) reviewBlock(body, st);
    var nav = h("div", { class: "nav" },
      h("button", { type: "button", class: "btn btn-ghost", text: "Назад", onclick: back }),
      st.review
        ? h("button", { type: "button", class: "btn btn-main", id: "send", text: EDIT ? "Сохранить исправления" : "Отправить анкету", onclick: submit })
        : h("button", { type: "button", class: "btn btn-main", text: state.fromReview ? "К проверке" : "Далее", onclick: next }));
    app.appendChild(h("div", { class: "top" }, logo(), h("span", { class: "count", text: "Шаг " + n + " из " + total })));
    app.appendChild(h("div", { class: "bar", role: "progressbar", "aria-label": "Заполнено", "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(n) },
      h("i", { style: "width:" + Math.round(n / total * 100) + "%" })));
    app.appendChild(title);
    app.appendChild(body);
    app.appendChild(nav);
    if (focus !== false) {
      var bad = app.querySelector(".field.bad");
      if (bad) { bad.scrollIntoView({ block: "center" }); var inp = bad.querySelector("input,textarea,select"); if (inp) inp.focus({ preventScroll: true }); }
      else { window.scrollTo(0, 0); title.focus({ preventScroll: true }); }
    }
  }
  function logo() { return h("img", { class: "logo", src: "logo.png", alt: "QPortall", width: "75", height: "26" }); }

  function intro() {
    var wrap = h("div", { class: "hero" });
    app.appendChild(h("div", { class: "top" }, logo()));
    if (EDIT) {
      wrap.appendChild(h("h1", { text: "Исправить анкету" }));
      wrap.appendChild(h("p", { class: "lead", text: (server && server.answers && server.answers.name ? "«" + server.answers.name + "». " : "") +
        "Поправьте, что нужно, или добавьте фото, и нажмите «Сохранить исправления». Сайт обновится сам." }));
      if (server && timesLeft(server.editsLeft)) wrap.appendChild(h("ul", { class: "facts" }, h("li", { text: timesLeft(server.editsLeft) })));
      wrap.appendChild(h("button", { type: "button", class: "btn btn-main", text: "Открыть анкету", onclick: function () { go(STEPS.length - 1); } }));
    } else {
      wrap.appendChild(h("h1", { text: "Анкета для сайта" }));
      wrap.appendChild(h("p", { class: "lead", text: "Ответьте на вопросы о вашем деле, и мы сделаем по ним сайт. Пропустить можно всё, кроме отмеченного звёздочкой." }));
      wrap.appendChild(h("ul", { class: "facts" }, h("li", { text: "10–15 минут" }), h("li", { text: STEPS.length + " коротких шагов" }), h("li", { text: "Ответы сохраняются сами" })));
      var draft = loadDraft();
      wrap.appendChild(h("button", { type: "button", class: "btn btn-main", text: draft && draft.step > 0 ? "Продолжить" : "Начать", onclick: function () { go(Math.max(0, draft && draft.step > 0 ? draft.step : 0)); } }));
    }
    wrap.appendChild(h("label", { class: "hp", "aria-hidden": "true" }, "Сайт компании",
      h("input", { type: "text", tabindex: "-1", autocomplete: "off", name: "company_site", oninput: function (e) { hp = e.target.value; } })));
    app.appendChild(wrap);
  }

  function groupBlock(g) {
    var G0 = GROUPS[g];
    var wrap = h("div");
    var n = groupShown(g), max = groupMax(g);
    for (var i = 1; i <= n; i++) (function (i) {
      var card = h("div", { class: "item" },
        h("div", { class: "item-head" }, h("b", { text: G0.item + " " + i }),
          i > 1 || n > 1 ? h("button", { type: "button", class: "link", text: "Убрать", onclick: function () { removeItem(g, i); } }) : null));
      var parts = G0.parts.filter(function (p) { return QK[g + i + p]; }).map(function (p) { return field(QK[g + i + p]); });
      if (g === "service" && parts.length === 3) { card.appendChild(parts[0]); card.appendChild(parts[1]); card.appendChild(h("div", { class: "row" }, parts[2], h("div"))); }
      else parts.forEach(function (x) { card.appendChild(x); });
      wrap.appendChild(card);
    })(i);
    if (n < max) wrap.appendChild(h("button", { type: "button", class: "add", text: "+ " + G0.add, onclick: function () { state.shown[g] = n + 1; save(); render(false); } }));
    return wrap;
  }
  function removeItem(g, i) {
    var max = groupMax(g), parts = GROUPS[g].parts;
    for (var j = i; j <= max; j++) parts.forEach(function (p) {
      var to = g + j + p, from = g + (j + 1) + p;
      if (QK[to]) state.answers[to] = state.answers[from] || "";
      delete errors[to];
    });
    state.shown[g] = Math.max(1, groupShown(g) - 1);
    save(); render(false);
  }

  function gateBlock(g) {
    var on = gateOn(g.key);
    var id = "g" + (++uid);
    var sw = h("input", { type: "checkbox", id: id, role: "switch", checked: on });
    sw.addEventListener("change", function () { setAnswer(g.key, sw.checked ? "Да" : "Нет"); render(false); });
    var box = h("div", { class: "gate" + (on ? " on" : "") },
      h("label", { class: "switch", for: id }, h("span", null, g.gatePage, helpText(g) ? h("small", { text: helpText(g) }) : null), sw));
    if (on) {
      var body = h("div", { class: "gate-body" });
      Q.forEach(function (q) { if (q.gate === g.key) body.appendChild(field(q)); });
      if (g.key === "wantLicense") body.appendChild(uploadBox("docs"));
      box.appendChild(body);
    }
    return box;
  }

  function show(v) {
    if (Array.isArray(v)) return v.join(", ");
    var s = String(v == null ? "" : v).trim();
    return s.length > 180 ? s.slice(0, 180) + "…" : s;
  }
  function reviewBlock(body, st) {
    STEPS.forEach(function (s, i) {
      if (s.review) return;
      var dl = h("dl");
      var count = 0;
      (s.uploads || []).forEach(function (k) { if (files[k].length) { dl.appendChild(h("dt", { text: UP[k].title })); dl.appendChild(h("dd", { text: files[k].length + " фото" })); count++; } });
      stepKeys(s).forEach(function (k) {
        var v = show(state.answers[k]);
        if (!v || (QK[k].gatePage && v === "Нет")) return;
        var q = QK[k], m = k.match(/^(service|faq)(\d+)/);
        dl.appendChild(h("dt", { text: m ? GROUPS[m[1]].item + " " + m[2] + ": " + labelText(q).toLowerCase() : q.gatePage || labelText(q) }));
        dl.appendChild(h("dd", { text: v }));
        count++;
      });
      if (s.gates && files.docs.length) { dl.appendChild(h("dt", { text: UP.docs.title })); dl.appendChild(h("dd", { text: files.docs.length + " фото" })); }
      body.appendChild(h("div", { class: "sum" },
        h("div", { class: "sum-head" }, h("b", { text: s.title }),
          h("button", { type: "button", class: "link", text: "Изменить", "aria-label": "Изменить: " + s.title, onclick: function () { state.fromReview = true; go(i); } })),
        count ? dl : h("p", { class: "empty", text: "Пропущено" })));
    });
    st.keys.forEach(function (k) { body.appendChild(field(QK[k])); });
    body.appendChild(h("div", { id: "status" }));
  }

  // ---------- Переходы ----------
  function go(i) { state.step = i; save(); render(); }
  function next() {
    var st = STEPS[state.step];
    if (validateStep(st).length) { render(); return; }
    if (state.fromReview) { state.fromReview = false; go(STEPS.length - 1); return; }
    go(state.step + 1);
  }
  function back() {
    if (state.fromReview) { state.fromReview = false; go(STEPS.length - 1); return; }
    if (state.step === 0) { state.step = -1; save(); render(); return; }
    go(state.step - 1);
  }

  // ---------- Отправка ----------
  function b64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).replace(/^data:[^,]*,/, "")); };
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }
  function answersToSend() {
    var out = {};
    STEPS.forEach(function (s) { stepKeys(s).forEach(function (k) {
      var v = state.answers[k];
      if (v == null || v === "" || (Array.isArray(v) && !v.length)) return;
      out[k] = Array.isArray(v) ? v : String(v).trim();
    }); });
    return out;
  }
  function submit() {
    var status = document.getElementById("status");
    for (var i = 0; i < STEPS.length; i++) {
      if (validateStep(STEPS[i]).length) {
        if (i === state.step) { render(); return; }
        state.fromReview = true; go(i); return;
      }
    }
    var btn = document.getElementById("send");
    btn.disabled = true;
    btn.textContent = "Отправляю…";
    status.innerHTML = "";
    var bar = h("i");
    status.appendChild(h("div", { class: "progress", "aria-hidden": "true" }, bar));
    var note = h("p", { class: "note", text: "Отправляю фото и ответы. Не закрывайте страницу." });
    status.appendChild(note);
    var payload = { edit: EDIT, design: GROUP, ref: EDIT ? "" : state.ref, hp: hp, t: Date.now() - state.started, answers: answersToSend(), files: {}, remove: removed };
    var jobs = [];
    Object.keys(files).forEach(function (k) {
      if (k === "docs" && !gateOn("wantLicense")) return;
      files[k].forEach(function (f) {
        if (!f.blob) return;
        jobs.push(b64(f.blob).then(function (data) { (payload.files[k] = payload.files[k] || []).push({ name: f.name, type: f.blob.type || f.type || "", data: data }); }));
      });
    });
    if (!gateOn("wantLicense")) files.docs.forEach(function (f) { if (f.id) payload.remove.push(f.id); });
    Promise.all(jobs).then(function () {
      // Только «простой» запрос: POST, text/plain, без своих заголовков и без слежения за выгрузкой
      // (xhr.upload.onprogress заставляет браузер слать пробный OPTIONS, а Google на него не отвечает — 28.10).
      var body = JSON.stringify(payload);
      var est = Math.max(3, body.length / 150000), t0 = Date.now();
      var tick = setInterval(function () { bar.style.width = Math.round(90 * (1 - Math.exp(-(Date.now() - t0) / 1000 / est))) + "%"; }, 300);
      var ctl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 180000);
      var stop = function () { clearInterval(tick); clearTimeout(timer); };
      fetch(C.api || "about:blank", { method: "POST", body: body, headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow", signal: ctl ? ctl.signal : undefined })
        .then(function (res) { return res.text().then(function (t) { return { status: res.status, text: t }; }); })
        .then(function (x) {
          stop();
          var r = null;
          try { r = JSON.parse(x.text); } catch (e) { /* не JSON */ }
          if (x.status === 200 && r && r.ok) { bar.style.width = "100%"; done(r); }
          else fail(r ? r.error || "server" : "server");
        }, function () { stop(); fail("net"); });
    }).catch(function () { fail("net"); });
    function fail(code) {
      btn.disabled = false;
      btn.textContent = EDIT ? "Сохранить исправления" : "Отправить анкету";
      status.innerHTML = "";
      var a = h("p", { class: "alert", role: "alert", text: ERR[code] || ERR.net });
      if ((code === "edits" || code === "limit" || code === "closed" || code === "server") && C.contact) a.appendChild(h("span", null, " ", h("a", { href: C.contact, text: "Написать нам" })));
      status.appendChild(a);
    }
  }
  function done(r) {
    clearDraft();
    var link = location.origin + location.pathname.replace(/index\.html$/, "") + "?edit=" + r.key;
    app.innerHTML = "";
    app.appendChild(h("div", { class: "top" }, logo()));
    var input = h("input", { type: "text", readonly: true, value: link, "aria-label": "Ваша ссылка для исправлений", onfocus: function (e) { e.target.select(); } });
    var copy = h("button", { type: "button", class: "btn", text: "Скопировать", onclick: function () {
      input.select();
      var ok = function () { copy.textContent = "Скопировано"; };
      if (navigator.clipboard) navigator.clipboard.writeText(link).then(ok, function () { document.execCommand("copy"); ok(); });
      else { document.execCommand("copy"); ok(); }
    } });
    app.appendChild(h("div", { class: "hero" },
      h("span", { class: "check", html: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><circle cx="32" cy="32" r="29"/><path d="M19 33l9 9 17-19" stroke-linecap="round" stroke-linejoin="round"/></svg>' }),
      h("h1", { tabindex: "-1", text: EDIT ? "Исправления сохранены" : "Анкета отправлена" }),
      h("p", { class: "lead", text: EDIT ? "Сайт обновится через несколько минут." : "Спасибо! Мы сделаем сайт и пришлём вам ссылку." }),
      h("div", { style: "text-align:start" },
        h("b", { text: "Ваша ссылка для исправлений" }),
        h("div", { class: "keybox" }, input, copy),
        h("p", { class: "note", text: ("Сохраните её. По ней можно дополнить анкету, например добавить фото. " + timesLeft(r.editsLeft)).trim() }))));
    app.querySelector("h1").focus();
    window.scrollTo(0, 0);
  }

  // ---------- Начало ----------
  function start() {
    if (!Q.length) { app.innerHTML = '<p class="loading">Анкета ещё не настроена.</p>'; return; }
    var draft = loadDraft();
    if (EDIT) {
      app.innerHTML = '<p class="loading">Открываю вашу анкету…</p>';
      fetch(C.api + (C.api.indexOf("?") === -1 ? "?" : "&") + "anketa=load&edit=" + encodeURIComponent(EDIT))
        .then(function (r) { return r.json(); })
        .then(function (r) {
          if (!r || !r.ok) { stop(ERR[r && r.error] || ERR.net); return; }
          server = r;
          if (!(r.editsLeft > 0)) { stop(ERR.edits, true); return; }
          state.answers = Object.assign({}, r.answers);
          (r.media || []).forEach(function (m) { if (files[m.kind]) files[m.kind].push(fileItem({ kind: m.kind, name: m.name, id: m.id, thumb: m.thumb })); });
          if (draft && draft.answers) { state.answers = draft.answers; state.shown = draft.shown || {}; removed = draft.removed || []; }
          files = filterRemoved(files);
          return loadFiles().then(function () { render(); });
        })
        .catch(function () { stop(ERR.net); });
      return;
    }
    if (draft) {
      state.answers = draft.answers || {};
      state.started = draft.started || Date.now();
      state.shown = draft.shown || {};
      state.ref = REF || draft.ref || "";
    }
    defaults();
    loadFiles().then(function () { render(false); });
  }
  function filterRemoved(f) {
    Object.keys(f).forEach(function (k) { f[k] = f[k].filter(function (x) { return !x.id || removed.indexOf(x.id) === -1; }); });
    return f;
  }
  function defaults() {
    var a = state.answers;
    if (QK.formLang && !a.formLang) a.formLang = QK.formLang.options[0];
    if (QK.languages && !a.languages) a.languages = [QK.languages.options[0]];
    gateList().forEach(function (g) { if (!a[g.key]) a[g.key] = "Нет"; });
    if (QK.a11y && !a.a11y) a.a11y = "Да";
  }
  function stop(text, contact) {
    app.innerHTML = "";
    app.appendChild(h("div", { class: "top" }, logo()));
    var p = h("p", { class: "lead", text: text });
    if (contact && C.contact) p.appendChild(h("span", null, " ", h("a", { href: C.contact, text: "Написать нам" })));
    app.appendChild(h("div", { class: "hero" }, h("h1", { text: "Анкета" }), p));
  }

  start();
})();
