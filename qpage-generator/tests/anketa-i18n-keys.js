/*
 * Какие тексты анкеты нужно перевести: из anketa.js (T("…"), шаги, подписи, подсказки, ошибки) и из вопросов (config.js).
 * Возвращает список русских строк. Используется в tests/anketa-mock.js (проверка, что у каждой есть he и en).
 */
"use strict";
const fs = require("fs");
const path = require("path");

module.exports = function keys(config) {
  const src = fs.readFileSync(path.join(__dirname, "../anketa/anketa.js"), "utf8");
  const out = new Set();
  const add = (s) => { if (s && /[А-Яа-яЁё]/.test(s)) out.add(s); };
  // T("…") и T(a ? "…" : "…")
  for (const m of src.matchAll(/\bT\((?:[^"()]*?\?\s*)?"((?:[^"\\]|\\.)*)"(?:\s*:\s*"((?:[^"\\]|\\.)*)")?/g)) [m[1], m[2]].forEach((x) => { if (x) add(JSON.parse('"' + x + '"')); });
  // Объекты-словари в начале файла: STEP_DEFS, UP, DAYS_SHORT, DESIGN_TEXT, LABEL, HELP, SHORT, GROUPS, ERR
  const head = src.slice(src.indexOf("var STEP_DEFS"), src.indexOf("var STEPS = buildSteps()"));
  for (const m of head.matchAll(/(?:title|lead|help|item|add|[a-zA-Z]+): "((?:[^"\\]|\\.)*)"/g)) add(JSON.parse('"' + m[1] + '"'));
  for (const m of head.matchAll(/"([А-ЯЁ][а-яё]+)": "([А-ЯЁ][а-яё])"/g)) { add(m[1]); add(m[2]); }
  add("Ещё вопросы");
  (config.questions || []).forEach((q) => {
    if (!q.key) return;
    // Названия полей услуг и вопросов (там свои короткие) и вопросов-переключателей (там gatePage) не показываются.
    if (!/^(service|faq)\d/.test(q.key) && !q.gatePage) add(q.title);
    add(q.gatePage); (q.options || []).forEach(add);
  });
  (config.colors || []).forEach((c) => add(c.label));
  (config.designs || []).forEach((d) => add(d.label));
  return [...out];
};
