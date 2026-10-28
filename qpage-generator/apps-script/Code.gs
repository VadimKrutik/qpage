/*
 * QPage - анкета и генератор сайтов внутри Google Таблицы (Google Apps Script).
 * Скрипт привязан к таблице: «Расширения → Apps Script».
 *
 * Что делает:
 *  1. Меню «QPortall → Первая настройка» (setup) - один раз создаёт Google Форму «Анкета для сайта»,
 *     связывает её с этой таблицей, создаёт на Диске папку «QPage - сайты».
 *  2. Каждый новый ответ превращается в отдельный лист (например «studio-lana»): строка на каждое
 *     поле, колонки ru / he / en. Недостающие языки - машинный перевод, адрес - координаты.
 *  3. Сразу после ответа по этому листу собирается сайт: папка и ZIP в «QPage - сайты»,
 *     ссылки - на листе «Сайты». Поправили лист - «QPortall → Сделать сайт из этого листа».
 *  4. doGet() - для генератора на компьютере (generate.js), по секретному ключу.
 *  5. Если подключён Netlify («QPortall → Подключить Netlify»), сайт сразу публикуется в интернете:
 *     у каждого листа свой сайт на Netlify, ссылка - на листе «Сайты».
 *
 * Файл собирается командой node build-gs.js: сюда же добавляются ядро генератора (QPageCore)
 * и файлы шаблона (TEMPLATE_FILES, TEMPLATE_TEXT).
 */

var LANGS = [
  { code: "ru", label: "Русский", gt: "ru" },
  { code: "he", label: "Иврит (עברית)", gt: "iw" },
  { code: "en", label: "English", gt: "en" }
];

var COLORS = [
  { label: "Бирюзовый", value: "#0b6e69" },
  { label: "Синий", value: "#1d5fa6" },
  { label: "Зелёный", value: "#2e6b30" },
  { label: "Бордовый", value: "#9b2335" },
  { label: "Фиолетовый", value: "#5b3fa0" },
  { label: "Графит", value: "#37474f" }
];

var BLOCK_OPTIONS = [
  { label: "Карта", key: "map" },
  { label: "Форма заявки", key: "form" },
  { label: "QR-код сайта", key: "qr" }
];

var MAX_SERVICES = 6;
var MAX_FAQ = 4;
var MAX_REVIEWS = 4;
var SAME_AS_USUAL = "Как в другие дни";
// Время для выпадающих списков: «8:00», «8:30»… с from до to часов.
function timeOptions(from, to) {
  var out = [];
  for (var h = from; h <= to; h++) { out.push(h + ":00"); if (h < to) out.push(h + ":30"); }
  return out;
}
var DAYS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
// Вопросы прошлых версий: переименовываются (старое → новое название) или удаляются из формы в «Обновить форму».
// Названия вопросов не должны совпадать с названиями страниц (по названию вопрос ищется в форме).
var RENAMED = { "Ссылка на видео YouTube": "Ссылка на видео", "Показать на сайте видео с YouTube?": "Показать на сайте видео?",
  "Прайс-лист": "Цены (прайс-лист)", "Внешний вид сайта": "На чём сделать акцент?" };
// Ссылку на скан документа заменили фото документов (UPLOAD_DOCS): скан-оригинал на сайте выкладывать не стоит.
var OBSOLETE = [/^Отзыв \d: (текст|имя клиента)$/, /^Часы работы$/, /^Часы в пятницу \(если другие\)$/, /^Ссылка на скан документа/];
var YES = "Да", NO = "Нет";
var CTA_OPTIONS = ["Оставить заявку", "Заказать", "Записаться"];
// Версии сайта (описаны в core.js): «Фото-витрина», «Текстовый блок», «Классический вариант». Функция, а не переменная:
// core.js стоит в файле ниже, при загрузке этого места QPageCore ещё нет.
function designOptions() {
  return ["showcase", "strict", "classic"].map(function (k) { return QPageCore.DESIGNS[k].label; });
}

// Необязательные блоки - цепочкой «Да / Нет»: «Да» открывает страницу с вопросами блока,
// «Нет» сразу ведёт к следующему блоку (так клиент не видит ненужных вопросов).
// Цепочка стоит в форме перед разделом «Оформление».
var DESIGN_SECTION = "Оформление";
function gates() {
  return [
    { key: "wantPrices", page: "Прайс-лист", ask: "Показать на сайте прайс-лист?",
      askHelp: "Отдельная таблица цен (кроме цен у услуг выше). Подходит, если позиций много.",
      detail: "Прайс-лист: цены", questions: [
        { key: "pricelist", title: "Цены (прайс-лист)", type: "paragraph", t: true,
          help: "По строке на позицию: название, тире, цена. Например: Замена смесителя - 250 (без тире цена не распознается)." },
        { key: "priceLink", title: "Ссылка на файл с ценами (если есть)", type: "text", validate: "url", plain: "ссылка на прайс (файл или страница)",
          help: "Например, ссылка на PDF в Google Диске с доступом «Все, у кого есть ссылка». Начинается с https://" }] },
    { key: "wantReviews", page: "Отзывы клиентов", ask: "Показать на сайте отзывы клиентов?",
      askHelp: "До " + MAX_REVIEWS + " коротких отзывов. Пишите только настоящие отзывы.",
      detail: "Отзывы клиентов: тексты", questions: [
        { key: "reviews", title: "Тексты отзывов", type: "paragraph", t: true,
          help: "Каждый отзыв с новой строки, имя клиента в конце через тире. Например: Всё сделали за один день, спасибо! - Анна К. " +
            "Имя - только с согласия клиента, можно без него." }] },
    { key: "wantSteps", page: "Как мы работаем", ask: "Показать, как проходит работа с вами (по шагам)?",
      askHelp: "Например: 1. Звонок 2. Выезд и оценка 3. Работа 4. Гарантия.",
      detail: "Как мы работаем: шаги", questions: [
        { key: "steps", title: "Шаги работы", type: "paragraph", t: true,
          help: "Каждый шаг с новой строки, до 8 шагов. Например: Вы звоните или пишете" }] },
    { key: "wantLicense", page: "Лицензии и дипломы", ask: "Показать лицензию, диплом или сертификаты?",
      detail: "Лицензии и дипломы: данные", questions: [
        { key: "license", title: "Лицензии, дипломы, сертификаты", type: "paragraph", t: true,
          help: "Каждый с новой строки. Например: Лицензия электрика № 123456. Фото самих документов можно загрузить в следующем вопросе " +
            "(закройте на фото номер удостоверения личности, адрес и другие личные данные)." }] },
    { key: "wantVideo", page: "Видео", ask: "Показать на сайте видео?",
      detail: "Видео: ссылка", questions: [
        { key: "video", title: "Ссылка на видео", type: "text", validate: "url", plain: "ссылка на видео (YouTube, Instagram, TikTok…)",
          help: "Скопируйте ссылку (кнопка «Поделиться»). Видео с YouTube встроится в сайт и загрузится по нажатию; " +
            "из Instagram, TikTok и других - на сайте будет кнопка «Смотреть видео», которая откроет его там." }] }
  ];
}
var TAB_HEADER = ["поле", "что это", "значение", "ru", "he", "en", "проверить перевод"];
var RESPONSES_SHEET = "Ответы";
var SITES_SHEET = "Сайты";
var SITES_HEADER = ["лист анкеты", "обновлён", "папка сайта", "ZIP для Netlify Drop", "проверить", "ошибки", "фото и логотип",
  "сайт в интернете", "Netlify: управление сайтом"];
// Вопросы «Загрузка файлов» скрипт создать не может (так устроен Google), их добавляют в форму вручную
// с ровно такими названиями. Без них фото можно положить в папку «<лист> - фото» на Диске.
var UPLOAD_LOGO = "Логотип";
var UPLOAD_PHOTOS = "Фотографии для сайта";
var UPLOAD_MAIN = "Главное фото";                     // горизонтальное, крупно на первом экране
var UPLOAD_PORTRAIT = "Ваше фото";                    // владелец или мастер - на первый экран
var UPLOAD_DOCS = "Фото лицензий и дипломов";         // вместо ссылки на скан документа
// Название вопроса могут немного изменить («Фото для сайта», «Логотип компании») - узнаём по началу.
var UPLOAD_MATCH = { logo: /^\s*логотип/i, main: /^\s*главное\s+фото/i, photos: /^\s*фото(?!.*(лиценз|диплом|документ|сертифик|владельц|мастер))/i,
  portrait: /^\s*ваше\s+фото|^\s*фото\s+(владельц|мастер)/i, docs: /^\s*фото.*(лиценз|диплом|документ|сертифик)/i };

function uploadTitle(titles, kind) {
  for (var i = 0; i < titles.length; i++) if (UPLOAD_MATCH[kind].test(titles[i])) return titles[i];
  return null;
}
var SITES_FOLDER = "QPage — сайты";

// Описание анкеты. По полю title ответ из формы находит своё поле (key).
// t: true - текст, который нужен на каждом языке сайта.
function questions() {
  var q = [
    { section: "Основное", help: "Эти данные появятся на сайте. Всё, кроме отмеченного звёздочкой, можно пропустить." },
    { key: "formLang", title: "На каком языке вы заполняете анкету?", type: "choice", options: LANGS.map(function (l) { return l.label; }), required: true },
    { key: "languages", title: "На каких языках нужен сайт?", type: "checkbox", options: LANGS.map(function (l) { return l.label; }), required: true,
      help: "Тексты на остальные языки переведём автоматически и проверим перед публикацией." },
    { key: "name", title: "Название бизнеса", type: "text", required: true },
    { key: "nameHe", title: "Название на иврите (если есть)", type: "text" },
    { key: "nameEn", title: "Название латиницей / на английском (если есть)", type: "text" },
    { key: "kind", title: "Чем вы занимаетесь — одной строкой", type: "text", required: true, t: true,
      help: "Например: Ремонт бытовой техники" },
    { key: "tagline", title: "Главное предложение для клиентов", type: "paragraph", required: true, t: true,
      help: "1-2 предложения, до 400 знаков: что вы делаете и чем вы лучше. Стоит под цветным блоком, над главным фото. Большой текст - в вопросе «Ваш главный текст» (для варианта «Текстовый блок»)." },
    { key: "facts", title: "Три коротких преимущества", type: "paragraph", t: true,
      help: "Каждое с новой строки, коротко. Например: Работаем с 2012 года" },
    { key: "about", title: "Коротко о вас", type: "paragraph", t: true,
      help: "2-4 предложения. Новый абзац - с новой строки." },
    { key: "story", title: "Ваш главный текст", type: "paragraph", t: true,
      help: "Только для варианта «Текстовый блок»: большой текст сразу под первым экраном - о вас, о вашем деле или просто ваши мысли. Новый абзац - с новой строки. В других вариантах не показывается." },
    { key: "legal", title: "Официальное название и номер (если есть)", type: "text", plain: "официальное название и номер (подвал сайта)",
      help: "Если вы частный предприниматель или юридическое лицо: официальное название и номер, как в документах. " +
        "Например: Иван Петров, עוסק מורשה 123456789. Покажем мелким шрифтом внизу сайта." },

    { section: "Контакты" },
    { key: "phone", title: "Телефон", type: "text", required: true, validate: "phone",
      help: "Например: 050-123-4567" },
    { key: "whatsapp", title: "Номер WhatsApp", type: "text", validate: "phone",
      help: "Если пусто - кнопки WhatsApp на сайте не будет." },
    { key: "telegram", title: "Telegram — имя пользователя", type: "text", help: "Без @. Если пусто - кнопки не будет." },
    { key: "email", title: "Эл. почта для сайта", type: "text", validate: "email" },
    { key: "workDays", title: "Рабочие дни", type: "checkbox", options: DAYS, plain: "рабочие дни (вс, пн, вт, ср, чт, пт, сб)",
      help: "Отметьте дни, когда вы работаете. Если не отметить - часов работы на сайте не будет." },
    { key: "workFrom", title: "Начало работы", type: "list", options: timeOptions(5, 14) },
    { key: "workTo", title: "Конец работы", type: "list", options: timeOptions(10, 24) },
    { key: "fridayTo", title: "В пятницу работаем до", type: "list", options: [SAME_AS_USUAL].concat(timeOptions(10, 20)),
      help: "Если в пятницу заканчиваете раньше. Пятница должна быть отмечена в рабочих днях." },
    { key: "address", title: "Адрес", type: "text", t: true, help: "Улица, дом, город. Если пусто - блока с картой не будет." },
    { key: "areas", title: "Районы и города, где вы работаете", type: "text", t: true,
      help: "Если выезжаете к клиентам: города или районы через запятую. Например: Хайфа, Крайот, Нешер" },

    { section: "Услуги и цены", help: "До " + MAX_SERVICES + " услуг или товаров. Цена - число в шекелях «от»; пусто - «цена по запросу»." }
  ];
  for (var i = 1; i <= MAX_SERVICES; i++) {
    q.push({ key: "service" + i + "Name", title: "Услуга " + i + ": название", type: "text", required: i === 1, t: true });
    q.push({ key: "service" + i + "Text", title: "Услуга " + i + ": описание", type: "paragraph", t: true });
    q.push({ key: "service" + i + "Price", title: "Услуга " + i + ": цена от, ₪", type: "text", validate: "number" });
  }
  q.push({ section: "Частые вопросы", help: "До " + MAX_FAQ + " вопросов клиентов с ответами: сроки, гарантия, оплата." });
  for (var j = 1; j <= MAX_FAQ; j++) {
    q.push({ key: "faq" + j + "Q", title: "Вопрос " + j, type: "text", t: true });
    q.push({ key: "faq" + j + "A", title: "Ответ " + j, type: "paragraph", t: true });
  }
  gates().forEach(function (g) {
    q.push({ key: g.key, title: g.ask, type: "choice", options: [YES, NO], required: true, help: g.askHelp, gateOf: g });
    g.questions.forEach(function (x) { x.gate = g.key; q.push(x); });
  });
  q.push({ section: DESIGN_SECTION });
  q.push({ key: "color", title: "Основной цвет сайта", type: "choice", options: COLORS.map(function (c) { return c.label; }), required: true });
  q.push({ key: "design", title: "На чём сделать акцент?", type: "choice", options: designOptions(),
    plain: "акцент: " + designOptions().join(" / "),
    help: "Верх сайта у всех вариантов одинаковый: в цветной заливке ваше фото, чем вы занимаетесь, название и преимущества; ниже - главное предложение и «Главное фото» крупно. " +
      "Фото-витрина: дальше мозаика из фото работ (лучше 8; 5-е и 8-е - во всю ширину, им лучше быть горизонтальными). " +
      "Текстовый блок: дальше «Ваш главный текст». Остальное у всех одинаковое. Если не выбрать - Классический вариант." });
  q.push({ key: "cta", title: "Главная кнопка сайта", type: "choice", options: CTA_OPTIONS, plain: "главная кнопка: " + CTA_OPTIONS.join(" / "),
    help: "Что чаще делают ваши клиенты: оставляют заявку, заказывают или записываются на приём." });
  q.push({ key: "captions", title: "Подписи к фотографиям", type: "paragraph", t: true,
    help: "Если будете присылать фото: по строке на каждое фото, в том же порядке: Название - цена (цену можно не писать). " +
      "Если нет «Главного фото», первое из этих фото покажем крупно вверху сайта. Можно пропустить." });
  q.push({ key: "blocks", title: "Что ещё показать на сайте?", type: "checkbox", options: BLOCK_OPTIONS.map(function (b) { return b.label; }) });
  q.push({ key: "a11y", title: "Добавить на сайт заявление о доступности?", type: "choice", options: [YES, NO], plain: "заявление о доступности (Да/Нет)",
    help: "Короткий раздел «Доступность сайта» с контактом для обращений. По закону Израиля о равных правах людей с инвалидностью " +
      "такое заявление нужно сайтам, которые обслуживают клиентов (небольшие бизнесы иногда освобождены). Если не уверены - выберите «Да»." });
  q.push({ key: "consent", title: "Согласие", type: "checkbox", required: true,
    options: ["Я согласен(на), что эти данные будут опубликованы на сайте"] });
  return q;
}

// ---------- 1. Установка ----------

function setup() {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("Этот проект не привязан к таблице. Откройте таблицу «QPage - анкеты», " +
      "в её меню «Расширения → Apps Script», вставьте код туда и запускайте оттуда. Этот проект можно удалить.");
  }
  // Повторный запуск в уже настроенной таблице не нужен; если же прежняя форма удалена - настраиваем заново.
  if (props.getProperty("FORM_ID") && props.getProperty("SHEET_ID") === ss.getId() && ss.getFormUrl() &&
      FormApp.openByUrl(ss.getFormUrl()).getId() === props.getProperty("FORM_ID")) {
    // Ничего не создаём, только возвращаем меню QPortall в таблицу и показываем ссылки.
    installMenuTrigger(ss);
    addMenu();
    notify("Всё уже настроено, меню QPortall - в таблице.\n\n" + links());
    return;
  }
  var form;
  if (ss.getFormUrl()) {
    // Таблица уже связана с анкетой - берём её, вторую не создаём.
    form = FormApp.openByUrl(ss.getFormUrl());
  } else {
    form = createForm();
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
    SpreadsheetApp.flush();
    var empty = ss.getSheetByName("Sheet1") || ss.getSheetByName("Лист1");
    if (empty && ss.getSheets().length > 1) ss.deleteSheet(empty);
  }

  nameResponsesSheet(ss);
  sitesSheet(ss);
  var found = DriveApp.getFoldersByName(SITES_FOLDER);
  var folder = found.hasNext() ? found.next() : DriveApp.createFolder(SITES_FOLDER);

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "onFormSubmit") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("onFormSubmit").forSpreadsheet(ss).onFormSubmit().create();
  installMenuTrigger(ss);

  var token = Utilities.getUuid().replace(/-/g, "");
  props.setProperties({ FORM_ID: form.getId(), SHEET_ID: ss.getId(), FOLDER_ID: folder.getId(), TOKEN: token });
  addMenu();
  notify("Готово.\n\n" + links());
}

// Меню QPage при каждом открытии таблицы. Устанавливаемый триггер надёжнее простого onOpen
// (тот у некоторых пользователей не срабатывает, например при нескольких Google-аккаунтах в браузере).
function installMenuTrigger(ss) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "addMenu") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("addMenu").forSpreadsheet(ss).onOpen().create();
}

// Лист, куда форма пишет ответы. Его имя могли поменять, поэтому ищем по связи с формой.
function responsesSheet(ss) {
  var url = ss.getFormUrl();
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) if (url && sheets[i].getFormUrl() === url) return sheets[i];
  for (var j = 0; j < sheets.length; j++) if (sheets[j].getFormUrl()) return sheets[j];
  return ss.getSheetByName(RESPONSES_SHEET) || sheets[0];
}

// Лист ответов называем «Ответы»; лист с таким именем от прежней формы переименовываем.
function nameResponsesSheet(ss) {
  var rs = responsesSheet(ss);
  if (rs.getName() === RESPONSES_SHEET) return;
  var old = ss.getSheetByName(RESPONSES_SHEET);
  if (old) old.setName(uniqueSheetName(ss, RESPONSES_SHEET + " (старая форма)"));
  rs.setName(RESPONSES_SHEET);
}

function links() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty("FORM_ID")) return "Сначала выполните «QPortall → Первая настройка».";
  var form = FormApp.openById(p.getProperty("FORM_ID"));
  return "Анкета QPortall для клиента: " + (p.getProperty("ANKETA_URL") || "ещё не опубликована (QPortall → Опубликовать анкету QPortall)") + "\n" +
    "Google Форма (запасная): " + form.getPublishedUrl() + "\n" +
    "Редактировать форму: " + form.getEditUrl() + "\n" +
    "Папка с сайтами: " + DriveApp.getFolderById(p.getProperty("FOLDER_ID")).getUrl() + "\n" +
    "Публикация на Netlify: " + (p.getProperty("NETLIFY_TOKEN") ? "подключена" : "не подключена (QPortall → Подключить Netlify)") + "\n" +
    "Ключ для генератора на компьютере (token): " + p.getProperty("TOKEN");
}

// Окно в таблице, если она открыта; иначе (триггер) - в журнал. Адреса в окне - кликабельные ссылки.
function notify(msg) {
  Logger.log(msg);
  try {
    var html = String(msg).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; })
      .replace(/https:\/\/[^\s<]+/g, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener">' + u + "</a>"; })
      .replace(/\n/g, "<br>");
    var page = HtmlService.createHtmlOutput('<div style="font:14px/1.5 Arial,sans-serif;word-break:break-all">' + html + "</div>")
      .setWidth(560).setHeight(Math.min(520, 120 + 22 * String(msg).split("\n").length));
    SpreadsheetApp.getUi().showModalDialog(page, "QPortall");
  } catch (e) { /* запуск без открытой таблицы */ }
}

function addMenu() {
  var ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { return; } // запуск без открытой таблицы
  var menu = ui.createMenu("QPortall");
  if (!PropertiesService.getScriptProperties().getProperty("FORM_ID")) {
    menu.addItem("Первая настройка (создать форму)", "setup")
      .addItem("Инструкция", "showHelp");
  } else {
    menu.addItem("Сделать сайт из этого листа", "makeSiteFromActiveSheet")
      .addItem("Обработать последний ответ заново", "processLastResponse")
      .addSeparator()
      .addItem("Обновить форму (новые вопросы)", "updateForm")
      .addItem("Подключить Netlify (публикация в интернете)", "connectNetlify")
      .addItem("Опубликовать анкету QPortall", "publishAnketa")
      .addItem("Анкеты QPortall: собрать ещё раз (если «ошибка»)", "retryAnketas")
      .addItem("Ссылки: форма, папка с сайтами", "showLinks")
      .addSeparator()
      .addItem("Инструкция", "showHelp");
  }
  menu.addToUi();
}

function createForm() {
  var form = FormApp.create("Анкета для сайта");
  form.setDescription("Заполните анкету - по ней мы сделаем сайт вашего бизнеса. " +
    "Ответы видим только мы; на сайте появятся только данные из анкеты.");
  form.setCollectEmail(false);
  form.setProgressBar(true);

  questions().forEach(function (q, i) {
    if (q.gate || q.gateOf) return; // цепочка «Да / Нет» - ниже, в ensureGates
    if (q.section) {
      // Первый раздел - это начало формы, отдельная страница для него не нужна.
      if (i === 0) form.addSectionHeaderItem().setTitle(q.section).setHelpText(q.help || "");
      else form.addPageBreakItem().setTitle(q.section).setHelpText(q.help || "");
      return;
    }
    addQuestion(form, q);
  });
  ensureGates(form);

  return form;
}

function pageBreak(form, title) {
  var found = null;
  form.getItems(FormApp.ItemType.PAGE_BREAK).forEach(function (it) { if (!found && it.getTitle() === title) found = it.asPageBreakItem(); });
  return found;
}

// Цепочка необязательных блоков перед разделом «Оформление»: для каждого блока страница с вопросом «Да / Нет»
// и страница с его вопросами. Недостающие страницы добавляются (старая форма), переходы проставляются заново.
// Возвращает названия добавленных блоков.
function ensureGates(form) {
  var titles = form.getItems().map(function (it) { return it.getTitle(); });
  var design = pageBreak(form, DESIGN_SECTION);
  var added = [];
  var place = function (item) { if (design) form.moveItem(item.getIndex(), design.getIndex()); };
  gates().forEach(function (g) {
    if (titles.indexOf(g.ask) !== -1) {
      // Блок уже есть: добавить его новые вопросы после предыдущего (или сразу после страницы блока).
      g.questions.forEach(function (q, i) {
        var now = form.getItems().map(function (it) { return it.getTitle(); });
        if (now.indexOf(q.title) !== -1) return;
        var after = -1;
        for (var j = i - 1; j >= 0 && after === -1; j--) after = now.indexOf(g.questions[j].title);
        if (after === -1) { var d = pageBreak(form, g.detail); after = d ? d.getIndex() : -1; }
        var item = addQuestion(form, q);
        if (after !== -1) form.moveItem(item.getIndex(), after + 1);
        added.push(q.title);
      });
      return;
    }
    place(form.addPageBreakItem().setTitle(g.page));
    place(addQuestion(form, { title: g.ask, type: "choice", options: [YES, NO], required: true, help: g.askHelp }));
    place(form.addPageBreakItem().setTitle(g.detail));
    g.questions.forEach(function (q) { place(addQuestion(form, q)); });
    added.push(g.page);
  });
  var list = gates();
  list.forEach(function (g, i) {
    var ask = null;
    form.getItems(FormApp.ItemType.MULTIPLE_CHOICE).forEach(function (it) { if (!ask && it.getTitle() === g.ask) ask = it.asMultipleChoiceItem(); });
    var detail = pageBreak(form, g.detail);
    var next = i + 1 < list.length ? pageBreak(form, list[i + 1].page) : design;
    if (!ask || !detail || !next) return;
    ask.setChoices([ask.createChoice(YES, detail), ask.createChoice(NO, next)]);
  });
  return added;
}

function addQuestion(form, q) {
  var item;
  if (q.type === "text") item = form.addTextItem();
  else if (q.type === "paragraph") item = form.addParagraphTextItem();
  else if (q.type === "choice") item = form.addMultipleChoiceItem().setChoiceValues(q.options);
  else if (q.type === "checkbox") item = form.addCheckboxItem().setChoiceValues(q.options);
  else if (q.type === "list") item = form.addListItem().setChoiceValues(q.options);
  item.setTitle(q.title).setRequired(!!q.required);
  if (q.help) item.setHelpText(q.help);
  var v = validation(q.validate);
  if (v) item.setValidation(v);
  return item;
}

// Добавить в уже созданную форму вопросы, появившиеся в новой версии скрипта
// (ставятся после предыдущего по порядку вопроса, который в форме уже есть) и цепочку необязательных блоков.
function updateForm() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty("FORM_ID")) { notify("Сначала выполните «QPortall → Первая настройка»."); return; }
  var form = FormApp.openById(p.getProperty("FORM_ID"));
  var titles = function () { return form.getItems().map(function (it) { return it.getTitle(); }); };
  var changed = [];
  // Вопросы прошлых версий: переименовать, ненужные - убрать (старые ответы в таблице остаются).
  form.getItems().forEach(function (it) {
    var t = it.getTitle();
    if (RENAMED[t] && it.getType() !== FormApp.ItemType.PAGE_BREAK && titles().indexOf(RENAMED[t]) === -1) { it.setTitle(RENAMED[t]); changed.push("«" + t + "» → «" + RENAMED[t] + "»"); }
  });
  form.getItems().forEach(function (it) {
    var t = it.getTitle();
    if (OBSOLETE.some(function (re) { return re.test(t); })) { form.deleteItem(it); changed.push("убран «" + t + "»"); }
  });
  // Подсказки и проверки у уже существующих вопросов - как в новой версии.
  questions().forEach(function (q) {
    if (!q.key) return;
    form.getItems().forEach(function (it) {
      if (it.getTitle() !== q.title) return;
      if (q.help) it.setHelpText(q.help);
      // Варианты вида сайта могли поменяться (у этого вопроса нет переходов, менять безопасно).
      if (q.key === "design" && it.getType() === FormApp.ItemType.MULTIPLE_CHOICE) it.asMultipleChoiceItem().setChoiceValues(q.options);
      var v = validation(q.validate);
      if (v && it.getType() === FormApp.ItemType.TEXT) it.asTextItem().setValidation(v);
    });
  });
  var qs = questions().filter(function (q) { return q.key && !q.gate && !q.gateOf; });
  var added = [];
  qs.forEach(function (q, i) {
    if (titles().indexOf(q.title) !== -1) return;
    var item = addQuestion(form, q);
    // Ставим сразу после предыдущего вопроса, который в форме уже есть (на ту же страницу).
    var placed = false;
    for (var j = i - 1; j >= 0 && !placed; j--) {
      var prev = titles().indexOf(qs[j].title);
      if (prev !== -1) { form.moveItem(item.getIndex(), prev + 1); placed = true; }
    }
    for (var k = i + 1; k < qs.length && !placed; k++) {
      var at = titles().indexOf(qs[k].title);
      if (at !== -1) { form.moveItem(item.getIndex(), at); placed = true; }
    }
    added.push(q.title);
  });
  ensureGates(form).forEach(function (page) { added.push(/[«»]/.test(page) ? page : "блок «" + page + "» (Да / Нет)"); });
  // Подписи к фото - сразу после вопроса с фото: сначала загружают фото, потом подписывают.
  var photosAt = titles().indexOf(uploadTitle(titles(), "photos"));
  var capAt = titles().indexOf("Подписи к фотографиям");
  if (photosAt !== -1 && capAt !== -1 && capAt !== photosAt + 1) {
    form.moveItem(capAt, capAt < photosAt ? photosAt : photosAt + 1);
    changed.push("«Подписи к фотографиям» перенесены сразу после вопроса с фото");
  }
  var uploads = [];
  if (!uploadTitle(titles(), "logo")) uploads.push(UPLOAD_LOGO);
  if (!uploadTitle(titles(), "main")) uploads.push(UPLOAD_MAIN + " (в разделе «Основное»; подсказка: горизонтальное, не меньше 1200 точек по ширине (фото с телефона подходит), будет крупно вверху сайта)");
  if (!uploadTitle(titles(), "photos")) uploads.push(UPLOAD_PHOTOS);
  if (!uploadTitle(titles(), "portrait")) uploads.push(UPLOAD_PORTRAIT + " (в разделе «Основное»)");
  if (!uploadTitle(titles(), "docs")) uploads.push(UPLOAD_DOCS + " (на странице «Лицензии и дипломы: данные»)");
  notify((added.length ? "Добавлены вопросы: " + added.join(", ") + "." : "Новых вопросов нет, форма актуальна.") +
    (changed.length ? "\n\nИзменено: " + changed.join("; ") + "." : "") +
    (uploads.length ? "\n\nВ форме нет вопросов для файлов: " + uploads.map(function (t) { return "«" + t + "»"; }).join(", ") +
      ". Их добавляют вручную: в редакторе формы «+» → тип «Загрузка файлов», название ровно такое.\n" +
      "Редактор формы: " + form.getEditUrl() : ""));
}

function validation(kind) {
  if (kind === "phone") {
    return FormApp.createTextValidation().requireTextMatchesPattern("^\\+?[0-9 ()-]{9,20}$")
      .setHelpText("Только цифры, пробелы, + ( ) и -; от 9 цифр.").build();
  }
  if (kind === "email") {
    return FormApp.createTextValidation().requireTextIsEmail()
      .setHelpText("Проверьте адрес, например: name@example.com").build();
  }
  if (kind === "hours") {
    return FormApp.createTextValidation().requireTextMatchesPattern("^\\s*\\d{1,2}([:.]\\d{2})?\\s*[-–—]\\s*\\d{1,2}([:.]\\d{2})?\\s*$")
      .setHelpText("По образцу: 8:00-19:00").build();
  }
  if (kind === "url") {
    return FormApp.createTextValidation().requireTextIsUrl()
      .setHelpText("Нужна ссылка, начинается с https://").build();
  }
  if (kind === "number") {
    return FormApp.createTextValidation().requireNumberGreaterThanOrEqualTo(0)
      .setHelpText("Только число, например: 250").build();
  }
  return null;
}

function showLinks() { notify(links()); }

// Шпаргалка «QPortall → Инструкция»: как обновить скрипт, сделать и поправить сайт, удалить его.
var HELP_HTML = [
  "<h3>1. Новая версия скрипта</h3><ol>",
  "<li>Скрипт состоит из шести файлов: <b>QPortall-1-kod.gs</b> … <b>QPortall-6-stranica.gs</b> (папка <b>C:\\ClaudeWork\\QPage-generator\\dist</b>).</li>",
  "<li>В этой таблице: <b>Расширения → Apps Script</b>.</li>",
  "<li>Откройте <b>QPortall-1-kod.gs</b> в Блокноте, <b>Ctrl+A</b>, <b>Ctrl+C</b>. В Apps Script слева файл <b>Code.gs</b>: <b>Ctrl+A</b>, <b>Ctrl+V</b>, <b>Ctrl+S</b>.</li>",
  "<li>Так же <b>QPortall-2-shablon.gs</b> → в файл <b>Shablon.gs</b>, а <b>QPortall-3-shablon2.gs</b> → в файл <b>Shablon2.gs</b> (если его нет: <b>+ → Скрипт</b>, имя <b>Shablon2</b>), <b>QPortall-4-anketa.gs</b> → в файл <b>Anketa.gs</b>, <b>QPortall-5-yadro.gs</b> → в файл <b>Yadro.gs</b>, <b>QPortall-6-stranica.gs</b> → в файл <b>Stranica.gs</b>. Шаблон меняется не всегда, но лишний раз вставить не вредно.</li>",
  "<li>Закройте вкладку Apps Script, обновите таблицу (<b>F5</b>).</li>",
  "<li>Если в анкете появились новые вопросы: <b>QPortall → Обновить форму</b>.</li></ol>",
  "<h3>2. Новый клиент</h3><ol>",
  "<li><b>QPortall → Ссылки</b> → «Ссылка для клиента» - отправьте её клиенту.</li>",
  "<li>После отправки анкеты сайт собирается сам за 1-2 минуты: новый лист клиента и строка на листе <b>«Сайты»</b>.</li>",
  "<li>На «Сайты»: <b>Открыть сайт</b> - сайт в интернете, <b>Папка</b> и <b>ZIP</b> - файлы на Диске, <b>Фото</b> - фото клиента, ",
  "<b>Netlify</b> - управление сайтом. Колонка <b>«проверить»</b> - что стоит посмотреть (перевод, большие фото, ссылки).</li></ol>",
  "<h3>3. Поправить сайт</h3><ol>",
  "<li>Откройте лист клиента. Тексты - в колонках <b>ru / he / en</b>, остальное - в колонке <b>«значение»</b>:",
  "<ul><li><b>languages</b> - языки сайта через запятую, первый - основной: <code>ru,he,en</code> (убрать язык - стереть его);</li>",
  "<li><b>color</b> - цвет в виде <code>#1565C0</code>; <b>phone</b>, <b>whatsapp</b>, <b>email</b> - контакты;</li>",
  "<li><b>workDays</b> - дни (вс, пн, вт…), <b>workHours</b> - <code>8:00-19:00</code>, <b>fridayHours</b> - часы в пятницу;</li>",
  "<li><b>blocks</b> - <code>map,form,qr</code>; <b>cta</b> - главная кнопка; <b>a11y</b> - Да/Нет.</li></ul></li>",
  "<li>Стоя на листе клиента (или на его строке в «Сайты»): <b>QPortall → Сделать сайт из этого листа</b>. ",
  "Адрес сайта в интернете не меняется. Окно «Сайт готов» закройте кнопкой OK.</li>",
  "<li>Фото: папка <b>«&lt;лист&gt; - фото»</b> на Диске (ссылка «Фото»). Логотип назовите <b>logo.png</b>, ",
  "остальные фото идут в галерею по алфавиту. Тяжёлые фото и HEIC (iPhone) генератор сам уменьшит и переведёт в JPG. Потом снова «Сделать сайт».</li></ol>",
  "<h3>4. Удалить сайт из интернета</h3><ol>",
  "<li>На «Сайты» нажмите <b>Netlify</b> у нужного сайта → <b>Project configuration</b> → вкладка <b>Configuration</b> → ",
  "внизу <b>Danger zone</b> → <b>Delete project</b>.</li>",
  "<li>Лист клиента и строку в «Сайты» можно удалить вручную (правой кнопкой по вкладке → Удалить).</li></ol>",
  "<h3>5. Если что-то не так</h3><ul>",
  "<li>Окно «выполняется скрипт» висит - обычно сайт уже готов, окно просто ждёт OK во вкладке таблицы.</li>",
  "<li>Несколько анкет сразу - собираются по очереди, ничего делать не нужно.</li>",
  "<li>Меню QPortall пропало - обновите таблицу (F5); не помогло - в Apps Script выберите функцию <b>setup</b> и нажмите «Выполнить».</li>",
  "<li>Сайт в браузере выглядит по-старому - нажмите <b>Ctrl+F5</b> (на телефоне - откройте в режиме инкогнито).</li></ul>"
].join("");

function showHelp() {
  var page = HtmlService.createHtmlOutput('<div style="font:14px/1.5 Arial,sans-serif">' + HELP_HTML +
    (typeof ANKETA_HELP === "string" ? ANKETA_HELP : "") + "</div>")
    .setWidth(640).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(page, "QPortall - инструкция");
}

// ---------- 2. Новый ответ → лист сайта ----------

function onFormSubmit(e) {
  withLock(function () {
    var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SHEET_ID"));
    var name = buildSiteSheet(ss, e.namedValues);
    makeSite(ss, name);
  });
}

// Очередь: если сейчас собирается другой сайт (две анкеты пришли разом), ждём его до 4 минут,
// чтобы сборки не мешали друг другу в листе «Сайты», на Диске и в Netlify.
function withLock(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(240000)) throw new Error("QPortall: другой сайт собирается слишком долго, этот не начат. " +
    "Повторите позже: «QPortall → Обработать последний ответ заново» или «Сделать сайт из этого листа».");
  try { return fn(); } finally { lock.releaseLock(); }
}

// Повторно обработать уже полученный ответ (номер строки на листе «Ответы»).
// Пригодится, если клиент исправил ответ или обработка не сработала.
function processRow(row) {
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SHEET_ID"));
  var sh = responsesSheet(ss);
  var width = sh.getLastColumn();
  var head = sh.getRange(1, 1, 1, width).getDisplayValues()[0];
  var vals = sh.getRange(row, 1, 1, width).getDisplayValues()[0];
  var named = {};
  head.forEach(function (h, i) { named[h] = [vals[i]]; });
  var name, r;
  withLock(function () {
    name = buildSiteSheet(ss, named);
    r = makeSite(ss, name);
  });
  notify("Лист «" + name + "» создан, сайт собран.\nПапка: " + r.folderUrl +
    (r.siteUrl ? "\nСайт в интернете: " + r.siteUrl : "") + (r.notes.length ? "\n\nПроверьте:\n" + r.notes.join("\n") : ""));
  return name;
}

function processLastResponse() {
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SHEET_ID"));
  var sh = responsesSheet(ss);
  return processRow(sh.getLastRow());
}

function answersByKey(named) {
  var out = {};
  questions().forEach(function (q) {
    if (!q.key) return;
    var v = named[q.title];
    // Ответ, данный до переименования вопроса, - под старым названием.
    if (v == null) Object.keys(RENAMED).forEach(function (old) { if (RENAMED[old] === q.title && named[old] != null) v = named[old]; });
    out[q.key] = String(Array.isArray(v) ? v.join(", ") : (v == null ? "" : v)).trim();
  });
  // Ответы блока, на который клиент в итоге ответил «Нет», не берём.
  questions().forEach(function (q) { if (q.gate && out[q.gate] !== YES) out[q.key] = ""; });
  return out;
}

function langByLabel(label) {
  for (var i = 0; i < LANGS.length; i++) if (LANGS[i].label === label.trim()) return LANGS[i];
  return null;
}

function buildSiteSheet(ss, named) {
  var a = answersByKey(named);
  var rows = siteRows(a);
  var tabName = uniqueSheetName(ss, slugify(a.nameEn || a.name));
  // Новый лист - сразу после «Сайты» (вторым слева), чтобы не искать его в конце.
  var sites = ss.getSheetByName(SITES_SHEET);
  var sh = ss.insertSheet(tabName, sites ? sites.getIndex() : 0);
  sh.getRange(1, 1, 1, TAB_HEADER.length).setValues([TAB_HEADER]).setFontWeight("bold");
  sh.getRange(2, 1, rows.length, TAB_HEADER.length).setNumberFormat("@").setValues(rows).setWrap(true);
  sh.setFrozenRows(1);
  sh.setColumnWidth(2, 220);
  [4, 5, 6].forEach(function (c) { sh.setColumnWidth(c, 280); });

  // Файлы из анкеты - в папку клиента «<лист> - фото»; логотип получает имя logo.*
  var media = mediaFolder(tabName);
  var copy = function (id, name) {
    try { var f = DriveApp.getFileById(id); f.makeCopy(name(f), media); }
    catch (err) { Logger.log("Не удалось скопировать файл " + id + ": " + err); }
  };
  var heads = Object.keys(named);
  fileIds(named[uploadTitle(heads, "logo")]).slice(0, 1).forEach(function (id) {
    copy(id, function (f) { return "logo." + (f.getName().indexOf(".") !== -1 ? f.getName().split(".").pop() : "png"); });
  });
  fileIds(named[uploadTitle(heads, "photos")]).forEach(function (id, i) {
    copy(id, function (f) { return "photo-" + (i < 9 ? "0" : "") + (i + 1) + "-" + f.getName(); });
  });
  fileIds(named[uploadTitle(heads, "main")]).slice(0, 1).forEach(function (id) {
    copy(id, function (f) { return "main." + (f.getName().indexOf(".") !== -1 ? f.getName().split(".").pop() : "jpg"); });
  });
  fileIds(named[uploadTitle(heads, "portrait")]).slice(0, 1).forEach(function (id) {
    copy(id, function (f) { return "portrait." + (f.getName().indexOf(".") !== -1 ? f.getName().split(".").pop() : "jpg"); });
  });
  fileIds(named[uploadTitle(heads, "docs")]).forEach(function (id, i) {
    copy(id, function (f) { return "doc-" + (i < 9 ? "0" : "") + (i + 1) + "-" + f.getName(); });
  });
  return tabName;
}

// Строки листа клиента (поле | что это | значение | ru | he | en | проверить перевод) из ответов анкеты.
// Тексты на недостающие языки - машинный перевод, адрес - координаты.
// keep(key) - при исправлении анкеты: прежняя строка листа, если ответ не менялся (её не переводим заново,
// правки владельца в ней сохраняются), иначе null.
function siteRows(a, keep) {
  var src = langByLabel(a.formLang) || LANGS[0];
  var langs = a.languages.split(",").map(langByLabel).filter(Boolean);
  if (!langs.length) langs = [src];
  var siteCodes = langs.map(function (l) { return l.code; });

  var rows = [];
  var add = function (key, label, value, perLang, check) {
    var old = keep && keep(key);
    if (old) { rows.push(old); return; }
    var r = [key, label, value || "", "", "", "", check || ""];
    if (perLang) LANGS.forEach(function (l, i) { r[3 + i] = perLang[l.code] || ""; });
    rows.push(r);
  };

  add("languages", "языки сайта (первый - основной)", siteCodes.join(","));
  add("color", "основной цвет", colorValue(a.color));
  add("blocks", "доп. блоки: map, form, qr", BLOCK_OPTIONS.filter(function (b) {
    return a.blocks.indexOf(b.label) !== -1;
  }).map(function (b) { return b.key; }).join(","));

  // Название не переводим машинно: берём то, что дал клиент.
  var names = {};
  names[src.code] = a.name;
  if (a.nameHe) names.he = a.nameHe;
  if (a.nameEn) names.en = a.nameEn;
  var nameCheck = siteCodes.filter(function (c) { return !names[c]; });
  siteCodes.forEach(function (c) { if (!names[c]) names[c] = a.name; });
  add("name", "название", "", names, nameCheck.length ? "нет названия на: " + nameCheck.join(", ") : "");

  add("phone", "телефон", a.phone);
  add("whatsapp", "WhatsApp", a.whatsapp);
  add("telegram", "Telegram", a.telegram.replace(/^@/, ""));
  add("email", "эл. почта", a.email);

  var geo = keep && keep("lat") && keep("lon") ? null : geocode(a.address);
  add("lat", "широта (для карты)", geo ? String(geo.lat) : "");
  add("lon", "долгота (для карты)", geo ? String(geo.lon) : "");

  questions().forEach(function (q) {
    if (!q.t) return;
    var text = a[q.key];
    if (!text) return;
    if (keep && keep(q.key)) { add(q.key); return; }
    var per = {}, machine = [];
    siteCodes.forEach(function (c) {
      if (c === src.code) { per[c] = text; return; }
      per[c] = translate(text, src, langByCode(c));
      machine.push(c);
    });
    add(q.key, q.title, "", per, machine.join(", "));
  });
  questions().forEach(function (q) {
    if (q.plain) add(q.key, q.plain, a[q.key]);
  });
  // Часы из выпадающих списков → строки «8:00-19:00» (их можно поправить на листе).
  var hours = a.workFrom && a.workTo ? a.workFrom + "-" + a.workTo : "";
  add("workHours", "часы работы, например 8:00-19:00", hours);
  add("fridayHours", "часы в пятницу, если другие", hours && a.fridayTo && a.fridayTo !== SAME_AS_USUAL ? a.workFrom + "-" + a.fridayTo : "");
  for (var i = 1; i <= MAX_SERVICES; i++) {
    if (a["service" + i + "Price"]) add("service" + i + "Price", "Услуга " + i + ": цена от, ₪", a["service" + i + "Price"]);
  }

  return rows;
}

// Ответ на вопрос «Загрузка файлов» - ссылки вида https://drive.google.com/open?id=...
function fileIds(answer) {
  var text = Array.isArray(answer) ? answer.join(",") : String(answer || "");
  var ids = [], re = /id=([\w-]+)/g, m;
  while ((m = re.exec(text))) ids.push(m[1]);
  return ids;
}

function mediaFolder(tabName) {
  var root = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty("FOLDER_ID"));
  var name = tabName + " — фото";
  var it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

// Картинки из папки клиента: logo.* - логотип, main.* - главное фото, portrait.* - фото владельца, doc-* - фото документов,
// остальные (по имени) - галерея.
// Тяжёлые фото и HEIC (iPhone) идут на сайт уменьшенной копией (см. siteImage), оригиналы остаются в папке.
function collectMedia(tabName) {
  var folder = mediaFolder(tabName);
  var files = [], it = folder.getFiles();
  while (it.hasNext()) files.push(it.next());
  files.sort(function (a, b) { return a.getName() < b.getName() ? -1 : 1; });
  var out = { folder: folder, logo: null, main: null, portrait: null, photos: [], docs: [], notes: [] };
  files.forEach(function (orig) {
    var isLogo = /^logo\./i.test(orig.getName()), isPortrait = /^portrait\./i.test(orig.getName()), isDoc = /^doc-/i.test(orig.getName());
    var isMain = /^main\./i.test(orig.getName());
    var list = isDoc ? out.docs : out.photos;
    if (!isLogo && !isPortrait && !isMain && list.length >= QPageCore.MAX_PHOTOS) { out.notes.push("больше " + QPageCore.MAX_PHOTOS + (isDoc ? " фото документов" : " фото") + ", лишнее не вошло: " + orig.getName()); return; }
    if ((isLogo && out.logo) || (isPortrait && out.portrait) || (isMain && out.main)) return;
    var f = siteImage(orig, folder, isLogo);
    var ext = f && QPageCore.IMAGE_EXT[f.getMimeType()];
    if (!ext) {
      out.notes.push(HEIC_MIME.test(orig.getMimeType()) || /\.hei[cf]$/i.test(orig.getName())
        ? "фото HEIC (iPhone) не удалось перевести в JPG, сохраните его как JPG: " + orig.getName()
        : "не картинка или формат не для сайта: " + orig.getName());
      return;
    }
    if (f.getSize() > 1500000) out.notes.push("большой файл, сайт будет грузиться медленно: " + orig.getName() + " (" + Math.round(f.getSize() / 1e5) / 10 + " МБ)");
    var need = isLogo ? 0 : isMain ? MIN_PX.main : isPortrait ? MIN_PX.portrait : isDoc ? MIN_PX.doc : MIN_PX.photo, size = null;
    if (need) try { size = QPageCore.imageSize(f.getBlob().getBytes().slice(0, 65536)); } catch (e) { Logger.log("photo size: " + e.message); }
    var what = isMain ? "Главное фото" : isPortrait ? "Ваше фото" : isDoc ? "Фото документа" : "Фото";
    if (size && size.w < need) out.notes.push(what + " низкого качества. Замените: " + orig.getName());
    if (isLogo) {
      out.logo = { file: f, path: "assets/img/logo." + ext };
      // Размер логотипа: широкий логотип-надпись страница показывает сразу как надо, без «прыжка».
      try { out.logoSize = QPageCore.imageSize(f.getBlob().getBytes().slice(0, 65536)); } catch (e) { Logger.log("logo size: " + e.message); }
    }
    else if (isMain) out.main = { file: f, path: "assets/img/main." + ext };
    else if (isPortrait) out.portrait = { file: f, path: "assets/img/portrait." + ext };
    else if (isDoc) out.docs.push({ file: f, path: "assets/img/doc-" + (out.docs.length + 1) + "." + ext });
    else out.photos.push({ file: f, path: "assets/img/photo-" + (out.photos.length + 1) + "." + ext });
  });
  return out;
}

// Все картинки клиента, которые идут в сайт.
function mediaFiles(media) {
  return (media.logo ? [media.logo] : []).concat(media.main ? [media.main] : [], media.portrait ? [media.portrait] : [], media.photos, media.docs || []);
}

// Сжатие фото. В Apps Script нет обработки картинок, поэтому берём у Google Диска его уменьшенную копию
// (миниатюру нужного размера): она в JPG, повёрнута как надо, без скрытых данных (места съёмки).
// Готовые копии лежат в подпапке «для сайта (сжатые)», при пересборке их не делаем заново.
var PHOTO_MAX_PX = 1600, LOGO_MAX_PX = 800;   // длинная сторона
var MIN_PX = { main: 1200, photo: 800, portrait: 300, doc: 600 };   // меньше по ширине - фото на сайте растянется и будет нечётким
var COMPRESS_FROM = 300000;                    // байт: файлы меньше этого идут как есть
var HEIC_MIME = /^image\/hei[cf]/i;
var SMALL_DIR = "для сайта (сжатые)";

function siteImage(orig, folder, isLogo) {
  var heic = HEIC_MIME.test(orig.getMimeType()) || /\.hei[cf]$/i.test(orig.getName());
  var ok = !!QPageCore.IMAGE_EXT[orig.getMimeType()];
  if (!heic && (!ok || orig.getSize() <= COMPRESS_FROM || orig.getMimeType() === "image/svg+xml" || orig.getMimeType() === "image/gif")) return orig;
  var cacheName = orig.getId() + "-" + orig.getSize() + (isLogo ? "-logo" : "");
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty("NOSMALL:" + cacheName)) return orig; // уже выяснили: копия хуже оригинала
  var keep = function () { props.setProperty("NOSMALL:" + cacheName, "1"); return orig; };
  try {
    var it = folder.getFoldersByName(SMALL_DIR);
    var dir = it.hasNext() ? it.next() : null;
    if (dir) {
      var cached = dir.getFiles();
      while (cached.hasNext()) { var c = cached.next(); if (c.getName().split(".")[0] === cacheName) return c; }
    }
    var blob = driveThumbnail(orig.getId(), isLogo ? LOGO_MAX_PX : PHOTO_MAX_PX);
    var ext = blob && QPageCore.IMAGE_EXT[blob.getContentType()];
    // Прозрачный PNG-логотип в JPG потерял бы прозрачность - тогда оставляем оригинал.
    if (!ext) return orig; // Диск копию не дал - попробуем при следующей сборке
    if (isLogo && orig.getMimeType() === "image/png" && ext === "jpg") return keep();
    if (!QPageCore.imageSize(blob.getBytes().slice(0, 65536))) return orig;
    if (!heic && blob.getBytes().length >= orig.getSize()) return keep();
    if (!dir) dir = folder.createFolder(SMALL_DIR);
    return dir.createFile(blob.setName(cacheName + "." + ext));
  } catch (err) {
    Logger.log("Сжатие " + orig.getName() + ": " + err);
    return orig;
  }
}

// Миниатюра файла Диска с длинной стороной до px точек (или null). Свежей копии Диск готовит миниатюру
// несколько секунд, поэтому ждём до ~15 с.
function driveThumbnail(id, px) {
  var auth = { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  for (var i = 0; i < 6; i++) {
    if (i) Utilities.sleep(2500);
    var meta = UrlFetchApp.fetch("https://www.googleapis.com/drive/v3/files/" + id + "?fields=thumbnailLink&supportsAllDrives=true", auth);
    if (meta.getResponseCode() !== 200) { Logger.log("миниатюра " + id + ": " + meta.getResponseCode() + " " + meta.getContentText().slice(0, 200)); return null; }
    var link = JSON.parse(meta.getContentText()).thumbnailLink;
    if (!link) continue;
    link = /=s\d+[^=\/]*$/.test(link) ? link.replace(/=s\d+[^=\/]*$/, "=s" + px) : link + "=s" + px;
    var res = UrlFetchApp.fetch(link, auth);
    if (res.getResponseCode() === 200) return res.getBlob();
    Logger.log("миниатюра " + id + ": " + res.getResponseCode());
  }
  return null;
}

function langByCode(code) {
  for (var i = 0; i < LANGS.length; i++) if (LANGS[i].code === code) return LANGS[i];
  return null;
}

function colorValue(label) {
  for (var i = 0; i < COLORS.length; i++) if (COLORS[i].label === label) return COLORS[i].value;
  return COLORS[0].value;
}

// Переводим построчно, чтобы сохранить разбивку на пункты и абзацы.
function translate(text, from, to) {
  return text.split("\n").map(function (line) {
    if (!line.trim()) return line;
    try { return LanguageApp.translate(line, from.gt, to.gt); }
    catch (err) { return line; }
  }).join("\n");
}

function geocode(address) {
  if (!address) return null;
  try {
    var r = Maps.newGeocoder().setRegion("il").geocode(address);
    if (r.status === "OK" && r.results.length) {
      var loc = r.results[0].geometry.location;
      return { lat: Math.round(loc.lat * 1e6) / 1e6, lon: Math.round(loc.lng * 1e6) / 1e6 };
    }
  } catch (err) { /* без координат сайт покажет ссылки на карты по адресу */ }
  return null;
}

var TRANSLIT = {
  "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh", "з": "z", "и": "i", "й": "y",
  "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f",
  "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
  "א": "a", "ב": "b", "ג": "g", "ד": "d", "ה": "h", "ו": "v", "ז": "z", "ח": "h", "ט": "t", "י": "y", "כ": "k",
  "ך": "k", "ל": "l", "מ": "m", "ם": "m", "נ": "n", "ן": "n", "ס": "s", "ע": "a", "פ": "p", "ף": "f", "צ": "ts",
  "ץ": "ts", "ק": "k", "ר": "r", "ש": "sh", "ת": "t"
};

function slugify(text) {
  var s = String(text || "").toLowerCase().split("").map(function (ch) {
    return TRANSLIT[ch] != null ? TRANSLIT[ch] : ch;
  }).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return s || "site";
}

function uniqueSheetName(ss, base) {
  var name = base, n = 2;
  while (ss.getSheetByName(name)) name = base + "-" + n++;
  return name;
}

// ---------- 3. Лист анкеты → сайт на Google Диске ----------

function makeSiteFromActiveSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getActiveSheet();
  // На листе «Сайты» - сайт из выделенной строки.
  if (sh.getName() === SITES_SHEET && sh.getActiveCell().getRow() > 1) {
    var tab = sh.getRange(sh.getActiveCell().getRow(), 1).getDisplayValue();
    if (ss.getSheetByName(tab)) sh = ss.getSheetByName(tab);
  }
  if (!isSiteSheet(sh)) {
    notify("Откройте лист клиента (вкладка внизу, например «portall-company») или на листе «Сайты» " +
      "выделите строку клиента, и выберите пункт ещё раз.");
    return;
  }
  var r = withLock(function () { return makeSite(ss, sh.getName()); });
  notify((r.siteUrl ? "Сайт в интернете: " + r.siteUrl + "\n\n" : "") +
    (r.pubError ? "Сайт не опубликован: " + r.pubError + "\n\n" : "") +
    (r.problems.length ? "Сайт собран, но есть ошибки:\n" + r.problems.join("\n") : r.pubError ? "Сайт собран на Диске." : "Сайт готов.") +
    "\n\nПапка: " + r.folderUrl + (r.siteUrl ? "" : "\nZIP для Netlify Drop: " + r.zipUrl) +
    (r.notes.length ? "\n\nПроверьте:\n" + r.notes.join("\n") : ""));
}

var MIME = { html: "text/html", css: "text/css", js: "application/javascript", svg: "image/svg+xml", xml: "application/xml" };

// Куда ведёт «Заказать сайт»: своя анкета QPortall с общим фоном (фоны групп - только для ссылок, которые
// владелец раздаёт сам), если она опубликована; иначе свойство скрипта ORDER_URL, иначе ссылка на Google Форму.
function orderUrl() {
  var p = PropertiesService.getScriptProperties();
  if (p.getProperty("ANKETA_URL")) return p.getProperty("ANKETA_URL") + "/";
  if (p.getProperty("ORDER_URL")) return p.getProperty("ORDER_URL");
  try { return p.getProperty("FORM_ID") ? FormApp.openById(p.getProperty("FORM_ID")).getPublishedUrl() : ""; } catch (e) { return ""; }
}

function makeSite(ss, tabName) {
  var rows = ss.getSheetByName(tabName).getDataRange().getDisplayValues();
  var media = collectMedia(tabName);
  var fields = QPageCore.rowsToFields(rows);
  // Внизу каждого сайта «Сайт сделан на QPage · Заказать сайт» ведёт на анкету (каждый сайт - реклама следующего).
  if (!fields.madeByUrl) fields.madeByUrl = { value: orderUrl() };
  // Адрес сайта в интернете нужен ещё до сборки: по нему карта сайта (sitemap.xml), canonical и превью ссылок.
  // Поэтому сайт на Netlify берём (или создаём) заранее. Свой адрес можно задать строкой siteUrl в листе.
  var nsite = null, pubError = "";
  if (PropertiesService.getScriptProperties().getProperty("NETLIFY_TOKEN")) {
    try {
      nsite = netlifySite(tabName);
      if (!fields.siteUrl || !fields.siteUrl.value) fields.siteUrl = { value: nsite.ssl_url || nsite.url };
    } catch (e) {
      Logger.log(e.stack || e);
      pubError = e.message;
    }
  }
  var r = QPageCore.siteFiles(fields, TEMPLATE_FILES, TEMPLATE_TEXT, tabName, {
    logo: media.logo ? media.logo.path : null,
    logoSize: media.logoSize || null,
    photos: media.photos.map(function (p) { return p.path; }),
    main: media.main ? media.main.path : null,
    portrait: media.portrait ? media.portrait.path : null,
    docs: (media.docs || []).map(function (p) { return p.path; })
  });
  var notes = media.notes.concat(r.notes);
  var root = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty("FOLDER_ID"));

  // Старую версию этого сайта - в корзину (её можно восстановить 30 дней).
  [root.getFoldersByName(tabName), root.getFilesByName(tabName + ".zip")].forEach(function (it) {
    while (it.hasNext()) it.next().setTrashed(true);
  });
  var folder = root.createFolder(tabName);
  var blobs = [];
  var put = function (rel, blob) {
    var parts = rel.split("/");
    var dir = folder;
    parts.slice(0, -1).forEach(function (p) {
      var it = dir.getFoldersByName(p);
      dir = it.hasNext() ? it.next() : dir.createFolder(p);
    });
    dir.createFile(blob.copyBlob().setName(parts[parts.length - 1]));
    blobs.push(blob.copyBlob().setName(rel));
  };
  Object.keys(r.files).forEach(function (rel) {
    put(rel, Utilities.newBlob(r.files[rel], MIME[rel.split(".").pop()] || "text/plain", rel));
  });
  mediaFiles(media).forEach(function (m) { put(m.path, m.file.getBlob()); });
  var zipBlob = Utilities.zip(blobs, tabName + ".zip");
  var zip = root.createFile(zipBlob);

  // Публикация на Netlify. Её сбой не мешает сайту на Диске: причина уходит в «проверить».
  var pub = null;
  if (nsite) {
    try {
      var fs = r.data.site.form;
      pub = publishToNetlify(tabName, nsite, zipBlob, r.files["index.html"].indexOf('data-netlify="true"') !== -1,
        fs.channel === "email" ? r.data.site.contacts.email : "", siteFingerprint(r.files, media));
      if (pub.formOk) notes = notes.filter(function (n) { return n.indexOf("Netlify Forms") === -1; });
      notes = notes.concat(pub.notes);
    } catch (e) {
      Logger.log(e.stack || e);
      pubError = e.message;
    }
  }

  var out = { folderUrl: folder.getUrl(), zipUrl: zip.getUrl(), notes: notes, problems: r.problems,
    siteUrl: pub && pub.url, adminUrl: pub && pub.adminUrl, pubError: pubError };
  if (pubError) notes.unshift("Сайт не опубликован: " + pubError);
  var list = sitesSheet(ss);
  var vals = list.getDataRange().getDisplayValues();
  // Новая строка - сразу под последней строкой с названием листа (пробел где-то ниже не должен уводить её вниз).
  var last = 1;
  for (var k = 1; k < vals.length; k++) if (String(vals[k][0]).trim()) last = k + 1;
  var row = last + 1;
  for (var i = 1; i < vals.length; i++) if (vals[i][0] === tabName) row = i + 1;
  list.getRange(row, 1, 1, SITES_HEADER.length).setValues([[tabName,
    Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "dd.MM.yyyy HH:mm"),
    out.folderUrl, out.zipUrl, notes.join("\n"), r.problems.join("\n"), media.folder.getUrl(),
    out.siteUrl || (pubError ? "не опубликован" : ""), out.adminUrl || ""]]);
  linkify(list, row);
  return out;
}

// Ссылки на листе «Сайты» - короткими словами-ссылками вместо длинных адресов (колонка → надпись).
var SITES_LINKS = { 3: "Папка", 4: "ZIP", 7: "Фото", 8: "Открыть сайт", 9: "Netlify" };
function linkify(sh, row) {
  Object.keys(SITES_LINKS).forEach(function (c) {
    var cell = sh.getRange(row, +c);
    var url = String(cell.getDisplayValue() || "").trim();
    if (!/^https:\/\//.test(url)) return;
    cell.setRichTextValue(SpreadsheetApp.newRichTextValue().setText(SITES_LINKS[c]).setLinkUrl(url).build());
  });
}

function sitesSheet(ss) {
  var sh = ss.getSheetByName(SITES_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SITES_SHEET, 0);
    sh.setFrozenRows(1);
  }
  // Заголовок пишем всегда: в новой версии скрипта могли добавиться колонки.
  sh.getRange(1, 1, 1, SITES_HEADER.length).setValues([SITES_HEADER]).setFontWeight("bold");
  // Строки прежних версий (длинные адреса) тоже превращаем в короткие ссылки; колонки ссылок - узкие.
  for (var r = 2; r <= sh.getLastRow(); r++) linkify(sh, r);
  Object.keys(SITES_LINKS).forEach(function (c) { sh.setColumnWidth(+c, 110); });
  sh.setColumnWidth(5, 360);
  return sh;
}

// ---------- 4. Выдача листа генератору на компьютере ----------

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.anketa) return json(anketaLoad(p)); // своя анкета QPortall: открыть анкету по личной ссылке (Anketa.gs)
  var props = PropertiesService.getScriptProperties();
  if (!p.token || p.token !== props.getProperty("TOKEN")) return json({ ok: false, error: "bad token" });
  var ss = SpreadsheetApp.openById(props.getProperty("SHEET_ID"));
  if (!p.site) {
    var sites = ss.getSheets().map(function (sh) { return sh.getName(); })
      .filter(function (n) { return n !== SITES_SHEET && isSiteSheet(ss.getSheetByName(n)); });
    return json({ ok: true, sites: sites });
  }
  var sh = ss.getSheetByName(p.site);
  if (!sh || !isSiteSheet(sh)) return json({ ok: false, error: "no such site: " + p.site });
  return json({ ok: true, site: p.site, rows: sh.getDataRange().getDisplayValues() });
}

function isSiteSheet(sh) {
  return sh.getRange(1, 1).getDisplayValue() === TAB_HEADER[0] && sh.getRange(1, 4).getDisplayValue() === "ru";
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- 5. Публикация на Netlify ----------
// Ключ доступа (Personal access token) хранится в свойствах этого скрипта - их видит только владелец.
// Каждому листу анкеты - свой сайт на Netlify (id в свойстве NETLIFY_SITE:<лист>); пересборка листа
// выкладывает новую версию на тот же адрес.

var NETLIFY_API = "https://api.netlify.com/api/v1";
var NETLIFY_TOKEN_PAGE = "https://app.netlify.com/user/applications#personal-access-tokens";
var NETLIFY_WAIT_SEC = 90;

function connectNetlify() {
  var p = PropertiesService.getScriptProperties();
  var html = HtmlService.createHtmlOutput(
    '<div style="font:14px/1.5 Arial,sans-serif">' +
    '<p>Тогда каждый сайт сразу публикуется в интернете, ссылка появляется на листе «Сайты».</p>' +
    '<ol style="padding-left:20px">' +
    '<li>Откройте <a href="' + NETLIFY_TOKEN_PAGE + '" target="_blank" rel="noopener">страницу ключей Netlify</a> ' +
    '→ «New access token», название «QPortall», срок - «No expiration» → «Generate token».</li>' +
    '<li>Скопируйте ключ и вставьте сюда.</li></ol>' +
    '<input id="t" style="width:100%;padding:6px;font:14px monospace" placeholder="nfp_..." autocomplete="off">' +
    '<p style="color:#555">' + (p.getProperty("NETLIFY_TOKEN") ? "Сейчас подключено. Пустое поле и «Сохранить» - отключить публикацию." :
      "Ключ даёт доступ к вашему аккаунту Netlify - никому его не пересылайте.") + '</p>' +
    '<button id="b" style="padding:6px 16px">Сохранить</button> <span id="m"></span>' +
    '<script>document.getElementById("b").onclick=function(){var m=document.getElementById("m");m.textContent="Проверяю…";' +
    'google.script.run.withSuccessHandler(function(r){m.innerHTML=r;}).withFailureHandler(function(e){m.textContent=e.message;})' +
    '.saveNetlifyToken(document.getElementById("t").value);};</script></div>')
    .setWidth(560).setHeight(380);
  SpreadsheetApp.getUi().showModalDialog(html, "QPortall - подключить Netlify");
}

// Вызывается из окна connectNetlify. Возвращает HTML-строку для окна.
function saveNetlifyToken(token) {
  var p = PropertiesService.getScriptProperties();
  token = String(token || "").trim();
  if (!token) {
    p.deleteProperty("NETLIFY_TOKEN");
    return "Публикация на Netlify отключена. Окно можно закрыть.";
  }
  var user;
  try { user = netlify("get", "/user", null, token); }
  catch (e) { throw new Error(e.status === 401 ? "Netlify не принял ключ. Скопируйте его ещё раз целиком." : e.message); }
  p.setProperty("NETLIFY_TOKEN", token);
  var team = "";
  try { var acc = netlify("get", "/accounts", null, token)[0]; if (acc && acc.slug) team = acc.slug; } catch (e) { /* не важно */ }
  var settings = team ? "https://app.netlify.com/teams/" + team + "/settings/general" : "https://app.netlify.com";
  return "<b>Подключено</b> (" + escapeHtml(user.email || user.full_name || "аккаунт Netlify") + "). " +
    "Один раз проверьте, что новые сайты открыты для всех: <a href=\"" + settings + "\" target=\"_blank\" rel=\"noopener\">" +
    "настройки команды Netlify</a> → Visitor access → Default project visibility → <b>Public</b>. Окно можно закрыть.";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
}

// Запрос к API Netlify. body: объект (JSON) или Blob (ZIP). Ошибка - с понятным текстом и полем status.
function netlify(method, path, body, token) {
  var opt = { method: method, muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + (token || PropertiesService.getScriptProperties().getProperty("NETLIFY_TOKEN")) } };
  if (body && typeof body.getBytes === "function") { opt.contentType = "application/zip"; opt.payload = body.getBytes(); }
  else if (body) { opt.contentType = "application/json"; opt.payload = JSON.stringify(body); }
  var res = UrlFetchApp.fetch(NETLIFY_API + path, opt);
  var code = res.getResponseCode(), text = res.getContentText();
  if (code >= 200 && code < 300) return text ? JSON.parse(text) : {};
  var msg = text;
  try { var j = JSON.parse(text); msg = j.message || j.error || text; } catch (e) { /* не JSON */ }
  if (/credit/i.test(msg)) {
    var e2 = new Error("кончились кредиты Netlify"); e2.status = code; throw e2;
  }
  var err = new Error((code === 401 ? "ключ Netlify не подходит (QPortall → Подключить Netlify)" :
    code === 429 ? "Netlify просит подождать: не больше 3 публикаций в минуту и 100 в день" :
    "Netlify ответил " + code) + (code === 401 || code === 429 ? "" : ": " + String(msg).slice(0, 200)));
  err.status = code;
  throw err;
}

// Имя сайта на Netlify = имя листа латиницей (адрес будет <имя>.netlify.app).
function netlifyName(tabName) {
  var s = slugify(tabName).replace(/^-+|-+$/g, "");
  return s || "qpage-site";
}

function createNetlifySite(tabName) {
  var name = netlifyName(tabName);
  for (var i = 0; i < 4; i++) {
    try { return netlify("post", "/sites", { name: name, created_via: "qpage" }); }
    catch (e) {
      // Имя уже занято (чужим или своим сайтом) - добавляем короткий хвост.
      if (e.status !== 422) throw e;
      name = netlifyName(tabName).slice(0, 50) + "-" + Utilities.getUuid().replace(/-/g, "").slice(0, 5);
    }
  }
  throw new Error("не удалось подобрать свободное имя сайта");
}

// Отпечаток содержимого сайта (без меток ?v=, они новые при каждой сборке): одинаковый - сайт не менялся.
function siteFingerprint(files, media) {
  var parts = Object.keys(files).sort().map(function (k) { return k + "\n" + String(files[k]).replace(/\?v=[0-9a-z]+/g, ""); });
  mediaFiles(media).forEach(function (m) {
    parts.push(m.path + ":" + (m.file.getId ? m.file.getId() : "") + ":" + m.file.getSize());
  });
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, parts.join("\n\n"), Utilities.Charset.UTF_8));
}

// Каждая выкладка на Netlify стоит 15 кредитов (бесплатно 300 в месяц), поэтому неизменный сайт не выкладываем.
// Сайт этого листа на Netlify: уже созданный (id в свойстве) или новый.
function netlifySite(tabName) {
  var props = PropertiesService.getScriptProperties();
  var key = "NETLIFY_SITE:" + tabName;
  var site = null;
  if (props.getProperty(key)) {
    try { site = netlify("get", "/sites/" + props.getProperty(key)); }
    catch (e) { if (e.status !== 404) throw e; } // сайт удалили в Netlify - создадим заново
  }
  if (!site) {
    site = createNetlifySite(tabName);
    props.setProperty(key, site.id);
    props.deleteProperty("NETLIFY_HASH:" + tabName);
  }
  return site;
}

function publishToNetlify(tabName, site, zipBlob, wantForm, notifyEmail, fingerprint) {
  var props = PropertiesService.getScriptProperties();
  var notes = [];
  var hashKey = "NETLIFY_HASH:" + tabName;
  var url0 = site.ssl_url || site.url, admin0 = site.admin_url || ("https://app.netlify.com/projects/" + site.name);
  if (fingerprint && props.getProperty(hashKey) === fingerprint) {
    return { url: url0, adminUrl: admin0, formOk: true,
      notes: ["Netlify: сайт не изменился - заново не выкладывали (каждая выкладка стоит 15 кредитов Netlify)"] };
  }
  // Форма заявки: новые сайты Netlify по умолчанию не ищут формы - включаем.
  if (wantForm && !(site.processing_settings && site.processing_settings.ignore_html_forms === false)) {
    try { netlify("patch", "/sites/" + site.id, { processing_settings: { ignore_html_forms: false } }); }
    catch (e) { Logger.log("forms: " + e.message); }
  }

  var deploy = netlify("post", "/sites/" + site.id + "/deploys", zipBlob);
  var waited = 0;
  while (deploy.state !== "ready" && deploy.state !== "error" && waited < NETLIFY_WAIT_SEC) {
    Utilities.sleep(3000);
    waited += 3;
    deploy = netlify("get", "/deploys/" + deploy.id);
  }
  var url = site.ssl_url || site.url;
  var adminUrl = site.admin_url || ("https://app.netlify.com/projects/" + site.name);
  if (deploy.state === "error") throw new Error("Netlify не принял сайт: " + (deploy.error_message || "ошибка публикации"));
  if (fingerprint) props.setProperty(hashKey, fingerprint);
  if (deploy.state !== "ready") {
    notes.push("Netlify: публикация ещё идёт, через минуту откройте " + url);
    return { url: url, adminUrl: adminUrl, notes: notes, formOk: false };
  }

  // Открывается ли сайт посетителям без входа в Netlify.
  var page = UrlFetchApp.fetch(url + "/", { followRedirects: false, muteHttpExceptions: true });
  if (page.getResponseCode() !== 200 || page.getContentText().indexOf("assets/js/content.js") === -1) {
    notes.push("Netlify: сайт закрыт для посетителей (нужен вход в Netlify). Откройте " + adminUrl +
      " → Project configuration → General → Visitor access → Project visibility → Public. " +
      "Чтобы новые сайты сразу были открыты: настройки команды → Visitor access → Default project visibility → Public.");
  }
  var formOk = false;
  if (wantForm) {
    try {
      formOk = netlify("get", "/sites/" + site.id + "/forms").some(function (f) { return f.name === "contact"; });
    } catch (e) { Logger.log("forms: " + e.message); }
    if (!formOk) notes.push("Netlify: форма заявки не найдена на сайте. Откройте " + adminUrl +
      " → Forms → Enable form detection, затем «Сделать сайт из этого листа» ещё раз.");
  }
  if (wantForm) {
    try { syncEmailHook(site.id, notifyEmail); }
    catch (e) {
      Logger.log("hooks: " + e.message);
      notes.push("Netlify: не удалось настроить письма о заявках" + (notifyEmail ? " на " + notifyEmail : "") + " - " + e.message +
        ". Можно вручную: " + adminUrl + " → Project configuration → Notifications → Emails and webhooks → Form submission notifications.");
    }
  }
  return { url: url, adminUrl: adminUrl, notes: notes, formOk: formOk };
}

// Письмо о каждой заявке на почту клиента. Старые адреса (клиент сменил почту) убираем.
function syncEmailHook(siteId, email) {
  var want = String(email || "").trim().toLowerCase();
  var have = false;
  netlify("get", "/hooks?site_id=" + siteId).forEach(function (h) {
    if (h.type !== "email" || h.event !== "submission_created") return;
    var addr = String((h.data && h.data.email) || "").toLowerCase();
    if (addr === want && !have) have = true;
    else netlify("delete", "/hooks/" + h.id);
  });
  if (want && !have) netlify("post", "/hooks?site_id=" + siteId, { type: "email", event: "submission_created", data: { email: email.trim() } });
}
