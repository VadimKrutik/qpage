/*
 * QPage - данные сайта.
 * Это единственный файл, который нужно менять под конкретного клиента.
 * Общие данные (телефоны, цены, картинки, включённые блоки) - в разделе "site".
 * Тексты на каждом языке - в разделе "text". Порядок элементов в списках
 * (услуги, галерея, предложения) должен совпадать с порядком в "site".
 */
window.QPAGE = {
  site: {
    // Рабочий адрес сайта. Нужен для QR-кода; если пусто, берётся текущий адрес страницы.
    url: "",
    defaultLang: "ru",
    languages: ["ru", "he", "en"],
    // Плашка "демонстрационный сайт" вверху страницы. Для клиента - false.
    demoNotice: true,

    // Версия внешнего вида: "classic" (Классика), "showcase" (Витрина), "strict" (Строгий).
    // Генератор добавляет сюда и order - порядок блоков этой версии.
    design: "classic",

    theme: {
      accent: "#0b6e69",       // основной цвет (кнопки, ссылки)
      accentDark: "#084f4b",   // при наведении
      accentSoft: "#e3f2f1"    // светлый фон блоков
    },

    // Блоки, которые можно выключить (false), не трогая HTML.
    blocks: {
      about: true,      // 3. краткое описание
      services: true,   // 4. услуги и товары
      gallery: true,    // 5. фотографии
      offers: true,     // 6. подробное описание предложений
      contacts: true,   // 7, 9. контакты и кнопки связи
      map: true,        // 8. адрес и карта
      form: true,       // 10. форма обратной связи
      qr: true,         // 11. QR-код
      privacy: true,    // 12. конфиденциальность
      // Дополнительные блоки (показываются, только если здесь true):
      credentials: true,   // лицензии, дипломы, гарантии
      pricelist: true,     // прайс-лист
      steps: true,         // как мы работаем
      video: true,         // видео YouTube (загружается по кнопке)
      reviews: true,       // отзывы
      accessibility: true  // заявление о доступности
    },

    logo: "assets/img/logo.svg",
    // Фото владельца или мастера для первого экрана; пусто - без фото.
    mainPhoto: "",
    portrait: "",

    contacts: {
      phone: "+972500000000",          // для ссылки tel:
      phoneDisplay: "+972-50-000-0000", // как показывать
      whatsapp: "972500000000",        // номер без "+" для wa.me; пусто - кнопки нет
      telegram: "",                     // имя пользователя без "@"; пусто - кнопки нет
      email: "info@example.com"
    },

    map: {
      lat: 32.8156,
      lon: 34.9892,
      zoom: 16
    },

    // Цена в шекелях; null - без цены.
    services: [
      { icon: "wash", price: 250 },
      { icon: "fridge", price: 300 },
      { icon: "oven", price: 200 },
      { icon: "parts", price: null }
    ],

    // Официальное название и номер бизнеса для подвала (например «עוסק מורשה 123456789»); пусто - строки нет.
    legal: "",

    // Подпись «Сайт сделан на QPage» внизу: url - куда ведёт «Заказать сайт» (анкета заказа); пусто - без ссылки.
    madeBy: { url: "" },

    // Прайс: строки в том же порядке, что text.*.pricelist.items.
    // price - число в шекелях или null («по запросу»); group: true - заголовок группы.
    // link - ссылка на полный прайс (файл на Диске и т. п.); пусто - кнопки нет.
    pricelist: {
      rows: [
        { group: true },
        { price: 150 },
        { price: null },
        { group: true },
        { price: 350 },
        { price: 280 },
        { price: 45 }
      ],
      link: ""
    },

    // Ссылка на документ (лицензия, диплом); пусто - кнопки нет.
    // docs - фото документов (лицензии, дипломы); link - старый способ: ссылка на скан.
    credentials: { link: "", docs: [] },

    // Видео YouTube: код ролика из ссылки (youtube.com/watch?v=КОД). Загружается только по кнопке.
    // youtube - код ролика (встраивается по кнопке); или link - ссылка на видео в Instagram, TikTok…
    video: { youtube: "aqz-KE-bpKQ", link: "", host: "" },

    // Дата заявления о доступности (ГГГГ-ММ-ДД).
    accessibilityDate: "2026-10-25",

    gallery: [
      { src: "assets/img/photo-workshop.svg" },
      { src: "assets/img/photo-repair.svg" },
      { src: "assets/img/photo-parts.svg" },
      { src: "assets/img/photo-van.svg" }
    ],

    // Как работает форма:
    //  "demo"     - ничего не отправляет и честно об этом сообщает;
    //  "netlify"  - Netlify Forms (нужно добавить data-netlify="true" к <form> в index.html);
    //  "endpoint" - POST в формате JSON на адрес form.endpoint.
    // channel - куда доходит заявка: "email" (письмо от Netlify + кнопка «копия в WhatsApp»),
    //  "whatsapp" (кнопка открывает WhatsApp с готовым текстом заявки), "" - только в Netlify.
    form: {
      mode: "demo",
      endpoint: "",
      channel: ""
    }
  },

  text: {
    ru: {
      meta: {
        title: "Мастер Дом - ремонт бытовой техники в Хайфе",
        description: "Ремонт стиральных машин, холодильников и духовок на дому. Выезд мастера в день обращения."
      },
      ui: {
        skip: "Перейти к содержанию",
        contactEmail: "написать нам",
        contactPhone: "позвонить нам",
        demoLabel: "Демонстрационный сайт",
        quickContact: "Быстрая связь",
        demoNotice: "Демонстрационный сайт шаблона QPortall. Компания, адрес и телефоны вымышлены.",
        menu: "Меню",
        menuOpen: "Открыть меню",
        menuClose: "Закрыть меню",
        language: "Язык сайта",
        nav: "Основная навигация",
        navAbout: "О нас",
        navServices: "Услуги",
        navGallery: "Фото",
        navPrices: "Цены",
        navReviews: "Отзывы",
        navOffers: "Условия",
        navContacts: "Контакты",
        call: "Позвонить",
        whatsapp: "WhatsApp",
        telegram: "Telegram",
        email: "Написать письмо",
        writeUs: "Оставить заявку",
        priceFrom: "от {price}",
        priceOnRequest: "Цена по запросу",
        toTop: "Наверх",
        noscript: "Для переключения языка и работы формы включите JavaScript."
      },
      hero: {
        name: "Мастер Дом",
        kind: "Ремонт бытовой техники",
        tagline: "Чиним стиральные машины, холодильники и духовки у вас дома. Приезжаем в день обращения, даём гарантию 6 месяцев.",
        facts: ["Работаем с 2012 года", "Гарантия 6 месяцев", "Хайфа и Крайот"],
        logoAlt: "Логотип «Мастер Дом»"
      },
      story: {
        title: "Главный текст",
        text: []
      },
      about: {
        title: "Коротко о нас",
        text: [
          "Мы - небольшая команда из трёх мастеров. Больше 10 лет ремонтируем технику Bosch, Samsung, LG, Electrolux и других марок.",
          "Мастер приезжает с основными запчастями, поэтому большинство поломок устраняем за один визит. Цену называем до начала работы."
        ]
      },
      services: {
        title: "Услуги и товары",
        items: [
          { name: "Ремонт стиральных машин", text: "Не сливает воду, не крутит барабан, шумит или протекает." },
          { name: "Ремонт холодильников", text: "Не морозит, намерзает лёд, гудит, не работает дисплей." },
          { name: "Ремонт духовок и плит", text: "Не греет, не включается, сломан термостат или таймер." },
          { name: "Запчасти и фильтры", text: "Оригинальные запчасти, фильтры для воды, шланги и уплотнители." }
        ]
      },
      gallery: {
        title: "Фотографии",
        items: [
          { alt: "Мастерская: стол с инструментами и стиральная машина на ремонте", caption: "Наша мастерская" },
          { alt: "Мастер проверяет холодильник с помощью тестера", caption: "Диагностика на месте" },
          { alt: "Полка с упакованными запчастями", caption: "Запчасти всегда в наличии" },
          { alt: "Сервисный автомобиль у жилого дома", caption: "Выезжаем по всему городу" }
        ]
      },
      offers: {
        title: "Подробно об условиях",
        items: [
          { title: "Сколько стоит вызов мастера?", text: "Выезд и диагностика - 150 ₪. Если вы соглашаетесь на ремонт, стоимость диагностики не берём." },
          { title: "Как быстро приедет мастер?", text: "В будни - в день обращения, если звоните до 14:00. В пятницу - до 12:00. Точное время согласуем по телефону." },
          { title: "Какая гарантия?", text: "6 месяцев на работу и установленные запчасти. Гарантийный талон выдаём на месте, на иврите или русском." },
          { title: "Как оплатить?", text: "Наличными, банковской картой или через Bit. Выдаём счёт-квитанцию (קבלה)." }
        ]
      },
      credentials: {
        title: "Лицензии и гарантии",
        items: [
          "Мастера с сертификатами сервисных центров Bosch и Samsung",
          "Зарегистрированный бизнес (עוסק מורשה), выдаём счёт-квитанцию",
          "Гарантия 6 месяцев на работу и запчасти"
        ],
        link: "Посмотреть документ"
      },
      pricelist: {
        title: "Цены",
        items: [
          { name: "Вызов мастера" },
          { name: "Выезд и диагностика" },
          { name: "Срочный выезд в пятницу" },
          { name: "Ремонт" },
          { name: "Замена насоса стиральной машины" },
          { name: "Замена термостата холодильника" },
          { name: "Фильтр для воды" }
        ],
        note: "Цены с НДС, без стоимости крупных запчастей. Точную цену называем до начала работы.",
        link: "Открыть полный прайс"
      },
      steps: {
        title: "Как мы работаем",
        items: [
          "Вы звоните или пишете в WhatsApp и коротко описываете поломку.",
          "Договариваемся о времени, мастер приезжает в тот же день.",
          "Диагностика на месте, называем точную цену.",
          "Ремонтируем и выдаём гарантию на 6 месяцев."
        ]
      },
      video: {
        title: "Видео",
        note: "Видео загружается с YouTube только после нажатия кнопки.",
        show: "Смотреть видео",
        noteLink: "Видео откроется на {host} в новой вкладке.",
        frameTitle: "Видео: наша работа"
      },
      reviews: {
        title: "Отзывы клиентов",
        items: [
          { text: "Стиральная машина перестала сливать воду. Мастер приехал через два часа и всё починил за полчаса.", name: "Ольга, Хайфа" },
          { text: "Честно сказали, что холодильник чинить невыгодно, и не взяли денег за диагностику.", name: "Давид, Кирьят-Ям" },
          { text: "Аккуратно, вовремя, всё объяснили по-русски. Буду обращаться ещё.", name: "Ирина, Нешер" }
        ]
      },
      contacts: {
        title: "Контакты",
        phone: "Телефон",
        email: "Эл. почта",
        hours: "Часы работы",
        hoursText: "Вс–Чт 8:00-19:00, Пт 8:00-13:00",
        areas: "Где работаем?",
        areasText: "Хайфа, Крайот, Нешер, Тират-Кармель",
        actionsTitle: "Свяжитесь с нами"
      },
      map: {
        title: "Адрес и карта",
        address: "ул. Герцль 10, Хайфа, 3303910",
        note: "Карта загружается с сайта OpenStreetMap только после нажатия кнопки.",
        show: "Показать карту",
        frameTitle: "Карта: расположение мастерской",
        openGoogle: "Открыть в Google Maps",
        openWaze: "Маршрут в Waze"
      },
      form: {
        title: "Оставить заявку",
        demoBadge: "Демо-форма",
        demoText: "Форма работает в демонстрационном режиме: введённые данные никуда не отправляются и не сохраняются. Чтобы связаться с мастером, позвоните или напишите в WhatsApp.",
        intro: "Опишите поломку, и мы перезвоним.",
        required: "обязательное поле",
        name: "Имя",
        phone: "Телефон",
        phoneHint: "Например: 050-000-0000",
        email: "Эл. почта",
        emailHint: "Необязательно",
        message: "Что случилось?",
        messageHint: "Марка техники и признаки поломки",
        consent: "Я согласен(на) на обработку моих данных для ответа на заявку. Подробнее - в разделе {privacy}.",
        submit: "Отправить заявку",
        sending: "Отправляем…",
        errName: "Укажите имя (от 2 символов).",
        errPhone: "Укажите телефон: от 9 до 15 цифр.",
        errEmail: "Проверьте адрес эл. почты, например: name@example.com.",
        errMessage: "Опишите поломку (от 10 символов).",
        errConsent: "Нужно согласие на обработку данных.",
        errSummary: "Исправьте ошибки в форме: {count}.",
        resultDemo: "Заявка НЕ отправлена: это демонстрационная форма. Данные проверены и сразу удалены из памяти страницы. Чтобы связаться с мастером, позвоните по телефону {phone}.",
        resultOk: "Заявка отправлена. Мы перезвоним в рабочее время.",
        resultFail: "Не удалось отправить заявку. Попробуйте позже или позвоните по телефону {phone}.",
        submitWa: "Отправить в WhatsApp",
        resultWa: "Открыли WhatsApp с готовым текстом заявки. Нажмите там «Отправить», чтобы заявка дошла до нас.",
        waButton: "Отправить в WhatsApp",
        waAlso: "Можно продублировать заявку в WhatsApp:",
        waIntro: "Заявка с сайта"
      },
      qr: {
        title: "QR-код сайта",
        text: "Наведите камеру телефона, чтобы открыть этот сайт.",
        alt: "QR-код со ссылкой на сайт",
        share: "Поделиться",
        copied: "Ссылка на сайт скопирована.",
        download: "Скачать QR-код (SVG)",
        localNote: "Сайт открыт с компьютера как файл, поэтому QR-код ведёт на демонстрационный адрес. После публикации он будет вести на рабочий адрес."
      },
      accessibility: {
        title: "Доступность",
        summary: "Мы хотим, чтобы сайтом мог пользоваться каждый, в том числе люди с ограниченными возможностями.",
        more: "Заявление о доступности",
        items: [
          "Сайт сделан с учётом израильского стандарта ת״י 5568 и рекомендаций WCAG 2.1 на уровне AA.",
          "Сайтом можно пользоваться с клавиатуры, с программами чтения с экрана и при увеличении текста до 200%.",
          "У изображений есть текстовые описания, у полей формы - подписи и понятные сообщения об ошибках.",
          "Сайт правильно отображается на телефоне и компьютере; текст на иврите идёт справа налево.",
          "Карта и видео загружаются со сторонних сервисов только по нажатию кнопки; их доступность от нас не зависит.",
          "Если вам что-то неудобно или не работает, свяжитесь с нами: {contact}. Мы ответим и постараемся помочь.",
          "Заявление обновлено: {date}."
        ]
      },
      privacy: {
        title: "Конфиденциальность",
        summary: "Сайт не использует cookie и рекламу. Ваши данные нужны нам только для ответа на ваше обращение.",
        more: "Подробнее",
        items: [
          "Сайт не использует cookie, счётчики посещений и рекламные системы.",
          "В браузере сохраняется только выбранный язык сайта. Это не персональные данные; их можно удалить, очистив данные сайта в браузере.",
          "Данные из формы (имя, телефон, эл. почта, сообщение) нужны только для ответа на вашу заявку. Заявка хранится у хостинга сайта (Netlify) и приходит нам на эл. почту; если вы отправляете её через WhatsApp, текст проходит через WhatsApp. Мы не передаём данные другим лицам и не используем для рассылок. Закон не обязывает вас их сообщать, но без них мы не сможем ответить.",
          "Карта OpenStreetMap загружается только по вашему нажатию; в этот момент сервис OpenStreetMap получает ваш IP-адрес. Кнопки WhatsApp, Telegram, Google Maps и Waze открывают соответствующие сервисы.",
          "Видео YouTube загружается только по вашему нажатию; в этот момент YouTube (Google) получает ваш IP-адрес и может сохранить данные в браузере.",
          "Чтобы узнать, изменить или удалить свои данные, свяжитесь с нами: {contact}."
        ],
        demoNote: "Сейчас форма работает в демонстрационном режиме и никаких данных не собирает."
      },
      footer: {
        rights: "© {year} Мастер Дом",
        madeWith: "Сайт сделан на QPortall",
        orderSite: "Заказать сайт"
      }
    },

    he: {
      meta: {
        title: "מאסטר בית - תיקון מכשירי חשמל בחיפה",
        description: "תיקון מכונות כביסה, מקררים ותנורים בבית הלקוח. טכנאי מגיע ביום הפנייה."
      },
      ui: {
        skip: "דילוג לתוכן",
        contactEmail: "כתבו לנו",
        contactPhone: "התקשרו אלינו",
        demoLabel: "אתר הדגמה",
        quickContact: "יצירת קשר מהירה",
        demoNotice: "אתר הדגמה של תבנית QPortall. העסק, הכתובת ומספרי הטלפון בדויים.",
        menu: "תפריט",
        menuOpen: "פתיחת תפריט",
        menuClose: "סגירת תפריט",
        language: "שפת האתר",
        nav: "ניווט ראשי",
        navAbout: "עלינו",
        navServices: "שירותים",
        navGallery: "תמונות",
        navPrices: "מחירים",
        navReviews: "המלצות",
        navOffers: "תנאים",
        navContacts: "צור קשר",
        call: "התקשרו",
        whatsapp: "WhatsApp",
        telegram: "Telegram",
        email: "שלחו מייל",
        writeUs: "השאירו פנייה",
        priceFrom: "החל מ־{price}",
        priceOnRequest: "המחיר לפי בקשה",
        toTop: "לראש העמוד",
        noscript: "כדי להחליף שפה ולהשתמש בטופס, יש להפעיל JavaScript."
      },
      hero: {
        name: "מאסטר בית",
        kind: "תיקון מכשירי חשמל ביתיים",
        tagline: "מתקנים מכונות כביסה, מקררים ותנורים אצלכם בבית. מגיעים ביום הפנייה, עם אחריות ל־6 חודשים.",
        facts: ["פועלים מאז 2012", "אחריות ל־6 חודשים", "חיפה והקריות"],
        logoAlt: "הלוגו של מאסטר בית"
      },
      story: {
        title: "הטקסט המרכזי",
        text: []
      },
      about: {
        title: "בקצרה עלינו",
        text: [
          "אנחנו צוות קטן של שלושה טכנאים. כבר יותר מ־10 שנים אנחנו מתקנים מכשירים של Bosch, Samsung, LG, Electrolux ומותגים נוספים.",
          "הטכנאי מגיע עם חלקי החילוף הנפוצים, ולכן רוב התקלות מתוקנות בביקור אחד. את המחיר אנחנו אומרים לפני תחילת העבודה."
        ]
      },
      services: {
        title: "שירותים ומוצרים",
        items: [
          { name: "תיקון מכונות כביסה", text: "לא מרוקנת מים, התוף לא מסתובב, רעש או נזילה." },
          { name: "תיקון מקררים", text: "לא מקרר, הצטברות קרח, זמזום, תצוגה לא עובדת." },
          { name: "תיקון תנורים וכיריים", text: "לא מחמם, לא נדלק, תקלה בתרמוסטט או בטיימר." },
          { name: "חלקי חילוף ומסננים", text: "חלקים מקוריים, מסנני מים, צינורות ואטמים." }
        ]
      },
      gallery: {
        title: "תמונות",
        items: [
          { alt: "המעבדה: שולחן עם כלי עבודה ומכונת כביסה בתיקון", caption: "המעבדה שלנו" },
          { alt: "טכנאי בודק מקרר בעזרת מכשיר מדידה", caption: "אבחון במקום" },
          { alt: "מדף עם חלקי חילוף ארוזים", caption: "חלקי חילוף תמיד במלאי" },
          { alt: "רכב שירות ליד בניין מגורים", caption: "מגיעים לכל העיר" }
        ]
      },
      offers: {
        title: "התנאים בפירוט",
        items: [
          { title: "כמה עולה ביקור טכנאי?", text: "הגעה ואבחון - 150 ₪. אם מאשרים את התיקון, לא גובים תשלום על האבחון." },
          { title: "תוך כמה זמן מגיע טכנאי?", text: "בימי חול - ביום הפנייה, אם מתקשרים עד 14:00. ביום שישי - עד 12:00. את השעה המדויקת מתאמים בטלפון." },
          { title: "מה האחריות?", text: "6 חודשים על העבודה ועל החלקים שהותקנו. תעודת אחריות ניתנת במקום, בעברית או ברוסית." },
          { title: "איך משלמים?", text: "במזומן, בכרטיס אשראי או ב־Bit. ניתנת קבלה." }
        ]
      },
      credentials: {
        title: "רישיונות ואחריות",
        items: [
          "טכנאים עם הסמכה של מרכזי השירות של Bosch ו־Samsung",
          "עוסק מורשה, מוציאים חשבונית־קבלה",
          "אחריות לשישה חודשים על העבודה ועל החלקים"
        ],
        link: "לצפייה במסמך"
      },
      pricelist: {
        title: "מחירים",
        items: [
          { name: "קריאת שירות" },
          { name: "הגעה ואבחון" },
          { name: "הגעה דחופה ביום שישי" },
          { name: "תיקונים" },
          { name: "החלפת משאבה במכונת כביסה" },
          { name: "החלפת תרמוסטט במקרר" },
          { name: "מסנן מים" }
        ],
        note: "המחירים כוללים מע״מ, ללא עלות חלקים גדולים. את המחיר המדויק נמסור לפני תחילת העבודה.",
        link: "למחירון המלא"
      },
      steps: {
        title: "איך אנחנו עובדים",
        items: [
          "מתקשרים או כותבים ב־WhatsApp ומתארים בקצרה את התקלה.",
          "קובעים שעה, והטכנאי מגיע באותו יום.",
          "אבחון במקום ומחיר מדויק מראש.",
          "מתקנים ונותנים אחריות לשישה חודשים."
        ]
      },
      video: {
        title: "סרטון",
        note: "הסרטון נטען מ־YouTube רק לאחר לחיצה על הכפתור.",
        show: "לצפייה בסרטון",
        noteLink: "הסרטון ייפתח ב־{host} בלשונית חדשה.",
        frameTitle: "סרטון: העבודה שלנו"
      },
      reviews: {
        title: "לקוחות ממליצים",
        items: [
          { text: "מכונת הכביסה הפסיקה לנקז. הטכנאי הגיע תוך שעתיים ותיקן הכול בחצי שעה.", name: "אולגה, חיפה" },
          { text: "אמרו ביושר שלא כדאי לתקן את המקרר, ולא לקחו כסף על האבחון.", name: "דוד, קריית ים" },
          { text: "מסודרים, בזמן, והסבירו הכול ברוסית. אפנה אליהם שוב.", name: "אירינה, נשר" }
        ]
      },
      contacts: {
        title: "צור קשר",
        phone: "טלפון",
        email: "דוא״ל",
        hours: "שעות פעילות",
        hoursText: "א׳–ה׳ \u20668:00-19:00\u2069, ו׳ \u20668:00-13:00\u2069",  // \u2066…\u2069 - время слева направо
        areas: "איפה אנחנו עובדים?",
        areasText: "חיפה, הקריות, נשר, טירת כרמל",
        actionsTitle: "דברו איתנו"
      },
      map: {
        title: "כתובת ומפה",
        address: "רחוב הרצל 10, חיפה, 3303910",
        note: "המפה נטענת מאתר OpenStreetMap רק לאחר לחיצה על הכפתור.",
        show: "הצגת המפה",
        frameTitle: "מפה: מיקום המעבדה",
        openGoogle: "פתיחה ב־Google Maps",
        openWaze: "ניווט ב־Waze"
      },
      form: {
        title: "השארת פנייה",
        demoBadge: "טופס הדגמה",
        demoText: "הטופס פועל במצב הדגמה: הפרטים שתזינו לא נשלחים ולא נשמרים. כדי ליצור קשר עם טכנאי, התקשרו או כתבו ב־WhatsApp.",
        intro: "תארו את התקלה ונחזור אליכם.",
        required: "שדה חובה",
        name: "שם",
        phone: "טלפון",
        phoneHint: "לדוגמה: 050-000-0000",
        email: "דוא״ל",
        emailHint: "לא חובה",
        message: "מה קרה?",
        messageHint: "סוג המכשיר וסימני התקלה",
        consent: "אני מסכים/ה לעיבוד הפרטים שלי לצורך מענה לפנייה. פרטים נוספים בסעיף {privacy}.",
        submit: "שליחת הפנייה",
        sending: "שולחים…",
        errName: "נא להזין שם (2 תווים לפחות).",
        errPhone: "נא להזין טלפון: 9 עד 15 ספרות.",
        errEmail: "נא לבדוק את כתובת הדוא״ל, לדוגמה: name@example.com.",
        errMessage: "נא לתאר את התקלה (10 תווים לפחות).",
        errConsent: "נדרשת הסכמה לעיבוד הפרטים.",
        errSummary: "יש לתקן שגיאות בטופס: {count}.",
        resultDemo: "הפנייה לא נשלחה: זהו טופס הדגמה. הפרטים נבדקו ונמחקו מיד מזיכרון הדף. כדי ליצור קשר עם טכנאי, התקשרו למספר {phone}.",
        resultOk: "הפנייה נשלחה. נחזור אליכם בשעות הפעילות.",
        resultFail: "לא הצלחנו לשלוח את הפנייה. נסו שוב מאוחר יותר או התקשרו למספר {phone}.",
        submitWa: "שליחה בוואטסאפ",
        resultWa: "פתחנו את וואטסאפ עם נוסח הפנייה. לחצו שם על \"שליחה\" כדי שהפנייה תגיע אלינו.",
        waButton: "שליחה בוואטסאפ",
        waAlso: "אפשר לשלוח עותק של הפנייה גם בוואטסאפ:",
        waIntro: "פנייה מהאתר"
      },
      qr: {
        title: "קוד QR של האתר",
        text: "כוונו את מצלמת הטלפון כדי לפתוח את האתר.",
        alt: "קוד QR עם קישור לאתר",
        share: "שיתוף",
        copied: "הקישור לאתר הועתק.",
        download: "הורדת קוד QR (SVG)",
        localNote: "האתר פתוח מהמחשב כקובץ, ולכן קוד ה־QR מוביל לכתובת הדגמה. לאחר הפרסום הוא יוביל לכתובת האמיתית."
      },
      accessibility: {
        title: "נגישות",
        summary: "חשוב לנו שכל אחד יוכל להשתמש באתר, כולל אנשים עם מוגבלויות.",
        more: "הצהרת נגישות",
        items: [
          "האתר נבנה בהתאם לתקן הישראלי ת״י 5568 ולהנחיות WCAG 2.1 ברמה AA.",
          "ניתן להשתמש באתר באמצעות המקלדת, עם תוכנות קוראות מסך ובהגדלת הטקסט עד 200%.",
          "לתמונות יש תיאור טקסטואלי, ולשדות הטופס יש תוויות והודעות שגיאה ברורות.",
          "האתר מוצג כראוי בטלפון ובמחשב; הטקסט בעברית מוצג מימין לשמאל.",
          "המפה והסרטון נטענים משירותים חיצוניים רק לאחר לחיצה על כפתור; הנגישות שלהם אינה בשליטתנו.",
          "אם משהו אינו נוח או אינו עובד, פנו אלינו: {contact}. נחזור אליכם וננסה לעזור.",
          "ההצהרה עודכנה: {date}."
        ]
      },
      privacy: {
        title: "פרטיות",
        summary: "האתר אינו משתמש בעוגיות ובפרסום. הפרטים שלכם משמשים אותנו רק כדי לענות לפנייה שלכם.",
        more: "פרטים נוספים",
        items: [
          "האתר אינו משתמש בעוגיות (cookies), במוני כניסות או במערכות פרסום.",
          "בדפדפן נשמרת רק שפת האתר שבחרתם. זה אינו מידע אישי, וניתן למחוק אותו בניקוי נתוני האתר בדפדפן.",
          "הפרטים מהטופס (שם, טלפון, דוא״ל, הודעה) משמשים רק למענה לפנייה שלכם. הפנייה נשמרת אצל ספק האחסון של האתר (Netlify) ומגיעה אלינו בדוא״ל; אם תשלחו אותה בוואטסאפ, הנוסח עובר דרך וואטסאפ. איננו מעבירים את הפרטים לגורמים אחרים ואיננו משתמשים בהם לדיוור. אין חובה חוקית למסור אותם, אך בלעדיהם לא נוכל לחזור אליכם.",
          "מפת OpenStreetMap נטענת רק לאחר לחיצה שלכם; ברגע זה שירות OpenStreetMap מקבל את כתובת ה־IP שלכם. הכפתורים WhatsApp, Telegram, Google Maps ו־Waze פותחים את השירותים האלה.",
          "סרטון YouTube נטען רק לאחר לחיצה שלכם; ברגע זה YouTube (Google) מקבל את כתובת ה־IP שלכם ועשוי לשמור נתונים בדפדפן.",
          "כדי לעיין בפרטים שלכם, לתקן או למחוק אותם, פנו אלינו: {contact}."
        ],
        demoNote: "כרגע הטופס פועל במצב הדגמה ואינו אוסף מידע."
      },
      footer: {
        rights: "© {year} מאסטר בית",
        madeWith: "האתר נבנה עם QPortall",
        orderSite: "להזמנת אתר"
      }
    },

    en: {
      meta: {
        title: "Master Home - appliance repair in Haifa",
        description: "Washing machine, fridge and oven repair at your home. A technician arrives on the day you call."
      },
      ui: {
        skip: "Skip to content",
        contactEmail: "write to us",
        contactPhone: "call us",
        demoLabel: "Demo site",
        quickContact: "Quick contact",
        demoNotice: "This is a QPortall template demo. The business, address and phone numbers are fictional.",
        menu: "Menu",
        menuOpen: "Open menu",
        menuClose: "Close menu",
        language: "Site language",
        nav: "Main navigation",
        navAbout: "About",
        navServices: "Services",
        navGallery: "Photos",
        navPrices: "Prices",
        navReviews: "Reviews",
        navOffers: "Terms",
        navContacts: "Contact",
        call: "Call",
        whatsapp: "WhatsApp",
        telegram: "Telegram",
        email: "Send an email",
        writeUs: "Request a callback",
        priceFrom: "from {price}",
        priceOnRequest: "Price on request",
        toTop: "Back to top",
        noscript: "Please enable JavaScript to switch languages and use the form."
      },
      hero: {
        name: "Master Home",
        kind: "Home appliance repair",
        tagline: "We fix washing machines, fridges and ovens at your home. Same-day visits and a 6-month warranty.",
        facts: ["Since 2012", "6-month warranty", "Haifa and the Krayot"],
        logoAlt: "Master Home logo"
      },
      story: {
        title: "Main text",
        text: []
      },
      about: {
        title: "About us",
        text: [
          "We are a small team of three technicians. For over 10 years we have been repairing Bosch, Samsung, LG, Electrolux and other brands.",
          "Our technician brings the common spare parts, so most faults are fixed in a single visit. We tell you the price before we start."
        ]
      },
      services: {
        title: "Services and products",
        items: [
          { name: "Washing machine repair", text: "Won't drain, drum won't spin, noisy or leaking." },
          { name: "Fridge repair", text: "Not cooling, ice build-up, humming, display not working." },
          { name: "Oven and stove repair", text: "Not heating, won't turn on, faulty thermostat or timer." },
          { name: "Spare parts and filters", text: "Original parts, water filters, hoses and seals." }
        ]
      },
      gallery: {
        title: "Photos",
        items: [
          { alt: "Workshop: a bench with tools and a washing machine under repair", caption: "Our workshop" },
          { alt: "A technician checking a fridge with a tester", caption: "On-site diagnostics" },
          { alt: "A shelf of packaged spare parts", caption: "Parts always in stock" },
          { alt: "A service van next to an apartment building", caption: "We cover the whole city" }
        ]
      },
      offers: {
        title: "Terms in detail",
        items: [
          { title: "How much is a technician visit?", text: "Call-out and diagnostics cost 150 ₪. If you go ahead with the repair, diagnostics are free." },
          { title: "How soon can you come?", text: "On weekdays, the same day if you call before 14:00. On Fridays, before 12:00. We agree on the exact time by phone." },
          { title: "What is the warranty?", text: "6 months on labour and installed parts. You get a warranty card on the spot, in Hebrew or Russian." },
          { title: "How can I pay?", text: "Cash, credit card or Bit. We issue a receipt." }
        ]
      },
      credentials: {
        title: "Licences and warranty",
        items: [
          "Technicians certified by Bosch and Samsung service centres",
          "Registered business (Osek Murshe), receipts issued",
          "6-month warranty on work and parts"
        ],
        link: "View document"
      },
      pricelist: {
        title: "Prices",
        items: [
          { name: "Call-out" },
          { name: "Visit and diagnostics" },
          { name: "Urgent visit on Friday" },
          { name: "Repairs" },
          { name: "Washing machine pump replacement" },
          { name: "Fridge thermostat replacement" },
          { name: "Water filter" }
        ],
        note: "Prices include VAT, excluding major parts. We give you the exact price before starting work.",
        link: "Open the full price list"
      },
      steps: {
        title: "How we work",
        items: [
          "Call or message us on WhatsApp and briefly describe the problem.",
          "We agree on a time and the technician comes the same day.",
          "On-site diagnostics and an exact price up front.",
          "We fix it and give you a 6-month warranty."
        ]
      },
      video: {
        title: "Video",
        note: "The video loads from YouTube only after you press the button.",
        show: "Watch the video",
        noteLink: "The video opens on {host} in a new tab.",
        frameTitle: "Video: our work"
      },
      reviews: {
        title: "Customer reviews",
        items: [
          { text: "Our washing machine stopped draining. The technician came within two hours and fixed it in half an hour.", name: "Olga, Haifa" },
          { text: "They honestly told us the fridge was not worth repairing and did not charge for the diagnostics.", name: "David, Kiryat Yam" },
          { text: "Neat, on time, and everything was explained in Russian. I will call them again.", name: "Irina, Nesher" }
        ]
      },
      contacts: {
        title: "Contact",
        phone: "Phone",
        email: "Email",
        hours: "Opening hours",
        hoursText: "Sun–Thu 8:00-19:00, Fri 8:00-13:00",
        areas: "Where do we work?",
        areasText: "Haifa, the Krayot, Nesher, Tirat Carmel",
        actionsTitle: "Get in touch"
      },
      map: {
        title: "Address and map",
        address: "10 Herzl St, Haifa, 3303910",
        note: "The map is loaded from OpenStreetMap only after you press the button.",
        show: "Show map",
        frameTitle: "Map: workshop location",
        openGoogle: "Open in Google Maps",
        openWaze: "Directions in Waze"
      },
      form: {
        title: "Request a callback",
        demoBadge: "Demo form",
        demoText: "This form is in demo mode: what you enter is not sent or stored anywhere. To reach a technician, call or message us on WhatsApp.",
        intro: "Describe the problem and we will call you back.",
        required: "required",
        name: "Name",
        phone: "Phone",
        phoneHint: "For example: 050-000-0000",
        email: "Email",
        emailHint: "Optional",
        message: "What happened?",
        messageHint: "Appliance brand and symptoms",
        consent: "I agree to my data being processed to respond to this request. See the {privacy} section for details.",
        submit: "Send request",
        sending: "Sending…",
        errName: "Please enter your name (at least 2 characters).",
        errPhone: "Please enter a phone number: 9 to 15 digits.",
        errEmail: "Please check the email address, e.g. name@example.com.",
        errMessage: "Please describe the problem (at least 10 characters).",
        errConsent: "Consent to data processing is required.",
        errSummary: "Please fix the errors in the form: {count}.",
        resultDemo: "Your request was NOT sent: this is a demo form. The data was checked and immediately discarded from the page. To reach a technician, call {phone}.",
        resultOk: "Your request has been sent. We will call you back during opening hours.",
        resultFail: "We could not send your request. Please try again later or call {phone}.",
        submitWa: "Send via WhatsApp",
        resultWa: "We opened WhatsApp with your request ready. Tap Send there so it reaches us.",
        waButton: "Send via WhatsApp",
        waAlso: "You can also send a copy of your request via WhatsApp:",
        waIntro: "Request from the website"
      },
      qr: {
        title: "Site QR code",
        text: "Point your phone camera at the code to open this site.",
        alt: "QR code linking to this site",
        share: "Share",
        copied: "The site link has been copied.",
        download: "Download QR code (SVG)",
        localNote: "The site is opened as a local file, so the QR code points to a demo address. Once published, it will point to the live address."
      },
      accessibility: {
        title: "Accessibility",
        summary: "We want everyone to be able to use this site, including people with disabilities.",
        more: "Accessibility statement",
        items: [
          "The site follows the Israeli standard IS 5568 and the WCAG 2.1 guidelines at level AA.",
          "You can use the site with a keyboard, with screen readers and with text enlarged up to 200%.",
          "Images have text descriptions, and form fields have labels and clear error messages.",
          "The site works on phones and computers; Hebrew text runs right to left.",
          "The map and video load from third-party services only after you press a button; their accessibility is outside our control.",
          "If something is hard to use or does not work, contact us: {contact}. We will reply and try to help.",
          "Statement updated: {date}."
        ]
      },
      privacy: {
        title: "Privacy",
        summary: "This site uses no cookies or ads. We use your details only to respond to your request.",
        more: "More details",
        items: [
          "This site uses no cookies, visitor counters or advertising systems.",
          "Your browser only stores the language you chose. This is not personal data, and you can remove it by clearing this site's data in your browser.",
          "Form data (name, phone, email, message) is used only to respond to your request. Requests are stored by the site host (Netlify) and reach us by email; if you send yours via WhatsApp, the text passes through WhatsApp. We do not share the data with anyone else or use it for mailings. You are not legally required to provide it, but without it we cannot reply.",
          "The OpenStreetMap map loads only when you press the button; at that moment OpenStreetMap receives your IP address. The WhatsApp, Telegram, Google Maps and Waze buttons open those services.",
          "The YouTube video loads only when you press the button; at that moment YouTube (Google) receives your IP address and may store data in your browser.",
          "To see, correct or delete your data, contact us: {contact}."
        ],
        demoNote: "The form is currently in demo mode and collects no data."
      },
      footer: {
        rights: "© {year} Master Home",
        madeWith: "Built with QPortall",
        orderSite: "Order a website"
      }
    }
  }
};
