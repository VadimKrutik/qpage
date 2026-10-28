// Анкета на трёх языках: первый вопрос — язык, дальше у каждого языка своя ветка с теми же вопросами,
// в конце общий раздел «Логотип и фото». В таблицу попадают канонические (русские) значения вариантов.
var FORM_LANGS = ["ru", "he", "en"];
function L(ru, he, en) { return { ru: ru, he: he, en: en }; }
// Текст на языке lang (строка без перевода — одинакова для всех языков).
function loc(x, lang) { return x == null ? "" : (typeof x === "string" || Array.isArray(x) ? x : x[lang]); }

var COLORS = [
  { label: "Бирюзовый", name: L("Бирюзовый", "טורקיז", "Teal"), value: "#0b6e69" },
  { label: "Синий", name: L("Синий", "כחול", "Blue"), value: "#1d5fa6" },
  { label: "Зелёный", name: L("Зелёный", "ירוק", "Green"), value: "#2e6b30" },
  { label: "Бордовый", name: L("Бордовый", "בורדו", "Burgundy"), value: "#9b2335" },
  { label: "Фиолетовый", name: L("Фиолетовый", "סגול", "Purple"), value: "#5b3fa0" },
  { label: "Графит", name: L("Графит", "גרפיט", "Graphite"), value: "#37474f" }
];

var BLOCK_OPTIONS = [
  { label: "Карта", name: L("Карта", "מפה", "Map"), key: "map" },
  { label: "Форма заявки", name: L("Форма заявки", "טופס פנייה", "Contact form"), key: "form" },
  { label: "QR-код сайта", name: L("QR-код сайта", "קוד QR לאתר", "Website QR code"), key: "qr" }
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
var DAY_NAMES = L(DAYS, ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"],
  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
var YES = "Да", NO = "Нет";
var YES_NO = L([YES, NO], ["כן", "לא"], ["Yes", "No"]);
var CTA_OPTIONS = ["Оставить заявку", "Заказать", "Записаться"];
var LANG_TITLE = "Язык анкеты · שפת השאלון · Form language";
var FINAL_SECTION = "Логотип и фото · לוגו ותמונות · Logo and photos";

// Необязательные блоки — цепочкой «Да / Нет»: «Да» открывает страницу с вопросами блока,
// «Нет» сразу ведёт к следующему блоку (так клиент не видит ненужных вопросов).
// Цепочка стоит в каждой ветке перед разделом «Оформление».
var DESIGN_SECTION = L("Оформление", "עיצוב", "Design");
var LINK_HELP = L("Например, ссылка на файл в Google Диске с доступом «Все, у кого есть ссылка». Начинается с https://",
  "למשל קישור לקובץ ב-Google Drive עם גישה \"כל מי שיש לו את הקישור\". מתחיל ב-https://",
  "For example, a link to a Google Drive file shared with \"Anyone with the link\". Starts with https://");
function gates() {
  return [
    { key: "wantPrices", page: L("Прайс-лист", "מחירון", "Price list"),
      ask: L("Показать на сайте прайс-лист?", "להציג באתר מחירון?", "Show a price list on the site?"),
      askHelp: L("Отдельная таблица цен (кроме цен у услуг выше). Подходит, если позиций много.",
        "טבלת מחירים נפרדת (בנוסף למחירים של השירותים). מתאים כשיש הרבה פריטים.",
        "A separate price table (in addition to the service prices above). Useful if you have many items."),
      detail: L("Прайс-лист: цены", "מחירון: מחירים", "Price list: prices"), questions: [
        { key: "pricelist", title: L("Цены (прайс-лист)", "מחירים (מחירון)", "Prices (price list)"), type: "paragraph", t: true,
          help: L("По строке на позицию: название, тире, цена. Например: Замена смесителя — 250 (без тире цена не распознается). " +
            "Строка с двоеточием в конце — заголовок группы, например: Сантехника:",
            "שורה לכל פריט: שם, מקף, מחיר. למשל: החלפת ברז — 250 (בלי מקף המחיר לא יזוהה). " +
            "שורה שמסתיימת בנקודתיים היא כותרת קבוצה, למשל: אינסטלציה:",
            "One line per item: name, dash, price. For example: Tap replacement — 250 (without the dash the price is not recognised). " +
            "A line ending with a colon is a group heading, for example: Plumbing:") },
        { key: "priceLink", title: L("Ссылка на файл с ценами (если есть)", "קישור לקובץ המחירים (אם יש)", "Link to a price file (if any)"),
          type: "text", validate: "url", plain: "ссылка на прайс (файл или страница)", help: LINK_HELP }] },
    { key: "wantReviews", page: L("Отзывы клиентов", "המלצות לקוחות", "Customer reviews"),
      ask: L("Показать на сайте отзывы клиентов?", "להציג באתר המלצות של לקוחות?", "Show customer reviews on the site?"),
      askHelp: L("До " + MAX_REVIEWS + " коротких отзывов. Пишите только настоящие отзывы.",
        "עד " + MAX_REVIEWS + " המלצות קצרות. רק המלצות אמיתיות.",
        "Up to " + MAX_REVIEWS + " short reviews. Real reviews only."),
      detail: L("Отзывы клиентов: тексты", "המלצות לקוחות: טקסטים", "Customer reviews: texts"), questions: [
        { key: "reviews", title: L("Тексты отзывов", "טקסטים של ההמלצות", "Review texts"), type: "paragraph", t: true,
          help: L("Каждый отзыв с новой строки, имя клиента в конце через тире. Например: Всё сделали за один день, спасибо! — Анна К. " +
            "Имя — только с согласия клиента, можно без него.",
            "כל המלצה בשורה חדשה, שם הלקוח בסוף אחרי מקף. למשל: הכול נעשה ביום אחד, תודה! — אנה ק. " +
            "שם רק בהסכמת הלקוח, אפשר גם בלי.",
            "Each review on a new line, the customer's name at the end after a dash. For example: All done in one day, thank you! — Anna K. " +
            "Names only with the customer's consent; you can leave them out.") }] },
    { key: "wantSteps", page: L("Как мы работаем", "איך אנחנו עובדים", "How we work"),
      ask: L("Показать, как проходит работа с вами (по шагам)?", "להציג איך מתנהלת העבודה איתכם (שלב אחר שלב)?",
        "Show how working with you goes (step by step)?"),
      askHelp: L("Например: 1. Звонок 2. Выезд и оценка 3. Работа 4. Гарантия.",
        "למשל: 1. שיחה 2. הגעה והערכה 3. עבודה 4. אחריות.",
        "For example: 1. Call 2. Visit and estimate 3. Work 4. Warranty."),
      detail: L("Как мы работаем: шаги", "איך אנחנו עובדים: שלבים", "How we work: steps"), questions: [
        { key: "steps", title: L("Шаги работы", "שלבי העבודה", "Work steps"), type: "paragraph", t: true,
          help: L("Каждый шаг с новой строки, до 8 шагов. Например: Вы звоните или пишете",
            "כל שלב בשורה חדשה, עד 8 שלבים. למשל: אתם מתקשרים או כותבים",
            "Each step on a new line, up to 8 steps. For example: You call or message us") }] },
    { key: "wantLicense", page: L("Лицензии и дипломы", "רישיונות ותעודות", "Licences and qualifications"),
      ask: L("Показать лицензию, диплом или сертификаты?", "להציג רישיון, תעודה או אישורים?", "Show a licence, diploma or certificates?"),
      detail: L("Лицензии и дипломы: данные", "רישיונות ותעודות: פרטים", "Licences and qualifications: details"), questions: [
        { key: "license", title: L("Лицензии, дипломы, сертификаты", "רישיונות, תעודות, אישורים", "Licences, diplomas, certificates"),
          type: "paragraph", t: true,
          help: L("Каждый с новой строки. Например: Лицензия электрика № 123456",
            "כל אחד בשורה חדשה. למשל: רישיון חשמלאי מס' 123456",
            "Each on a new line. For example: Electrician licence No. 123456") },
        { key: "licenseLink", title: L("Ссылка на скан документа (если есть)", "קישור לסריקת המסמך (אם יש)", "Link to a scan of the document (if any)"),
          type: "text", validate: "url", plain: "ссылка на скан лицензии/диплома", help: LINK_HELP }] },
    { key: "wantVideo", page: L("Видео", "סרטון", "Video"),
      ask: L("Показать на сайте видео?", "להציג באתר סרטון?", "Show a video on the site?"),
      detail: L("Видео: ссылка", "סרטון: קישור", "Video: link"), questions: [
        { key: "video", title: L("Ссылка на видео", "קישור לסרטון", "Video link"), type: "text", validate: "url",
          plain: "ссылка на видео (YouTube, Instagram, TikTok…)",
          help: L("Скопируйте ссылку (кнопка «Поделиться»). Видео с YouTube встроится в сайт и загрузится по нажатию; " +
            "из Instagram, TikTok и других — на сайте будет кнопка «Смотреть видео», которая откроет его там.",
            "העתיקו את הקישור (כפתור \"שיתוף\"). סרטון מ-YouTube יוטמע באתר וייטען בלחיצה; " +
            "מ-Instagram, TikTok ואחרים — באתר יופיע כפתור \"לצפייה בסרטון\" שיפתח אותו שם.",
            "Copy the link (the Share button). A YouTube video is embedded and loads on click; " +
            "for Instagram, TikTok and others the site shows a \"Watch the video\" button that opens it there.") }] }
  ];
}
