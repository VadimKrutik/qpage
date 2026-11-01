// ===================== Обновление скрипта из GitHub =====================
// Меню «QPortall → Обновить скрипт QPortall»: берёт 6 файлов из папки qpage-generator/dist репозитория
// на GitHub, сам записывает их в этот проект (Apps Script API) и переводит веб-приложение анкеты
// (развертывание из ANKETA_API) на новую версию. Вставлять файлы руками больше не нужно.
// Один раз: включить Apps Script API, заменить appsscript.json (нужны права script.projects и
// script.deployments), «Подключить обновления» - ключ GitHub только на чтение этого репозитория.
var UPDATE_REPO = "VadimKrutik/qpage";
var UPDATE_BRANCH = "main";
var UPDATE_DIR = "qpage-generator/dist/";
// файл в dist → файл в проекте Apps Script
var UPDATE_FILES = [
  ["QPortall-1-kod.gs", "Code"], ["QPortall-2-shablon.gs", "Shablon"], ["QPortall-3-shablon2.gs", "Shablon2"],
  ["QPortall-4-anketa.gs", "Anketa"], ["QPortall-5-yadro.gs", "Yadro"], ["QPortall-6-stranica.gs", "Stranica"]
];
var GITHUB_TOKEN_PAGE = "https://github.com/settings/personal-access-tokens/new";
var APPS_SCRIPT_API_PAGE = "https://script.google.com/home/usersettings";

function connectUpdates() {
  var has = !!PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN");
  var html = HtmlService.createHtmlOutput(
    '<div style="font:14px/1.5 Arial,sans-serif">' +
    '<p>Тогда новые версии скрипта ставятся сами: «QPortall → Обновить скрипт QPortall».</p>' +
    '<ol style="padding-left:20px">' +
    '<li>Откройте <a href="' + GITHUB_TOKEN_PAGE + '" target="_blank" rel="noopener">страницу ключей GitHub</a>. ' +
    'Token name - QPortall, Expiration - No expiration (или самый долгий срок).</li>' +
    '<li>Repository access - Only select repositories - <b>qpage</b>.</li>' +
    '<li>Permissions - Repository permissions - Contents - <b>Read-only</b>. Внизу «Generate token».</li>' +
    '<li>Скопируйте ключ и вставьте сюда.</li></ol>' +
    '<input id="t" style="width:100%;padding:6px;font:14px monospace" placeholder="github_pat_..." autocomplete="off">' +
    '<p style="color:#555">' + (has ? "Сейчас подключено. Пустое поле и «Сохранить» - отключить." :
      "Ключ только читает файлы репозитория qpage. Никому его не пересылайте.") + '</p>' +
    '<button id="b" style="padding:6px 16px">Сохранить</button> <span id="m"></span>' +
    '<script>document.getElementById("b").onclick=function(){var m=document.getElementById("m");m.textContent="Проверяю…";' +
    'google.script.run.withSuccessHandler(function(r){m.innerHTML=r;}).withFailureHandler(function(e){m.textContent=e.message;})' +
    '.saveGithubToken(document.getElementById("t").value);};</script></div>')
    .setWidth(560).setHeight(430);
  SpreadsheetApp.getUi().showModalDialog(html, "QPortall - подключить обновления");
}

// Вызывается из окна connectUpdates. Возвращает HTML-строку для окна.
function saveGithubToken(token) {
  var p = PropertiesService.getScriptProperties();
  token = String(token || "").trim();
  if (!token) { p.deleteProperty("GITHUB_TOKEN"); return "Обновления отключены. Окно можно закрыть."; }
  var r = github("/repos/" + UPDATE_REPO, token);
  if (r.getResponseCode() === 401) throw new Error("GitHub не принял ключ. Скопируйте его ещё раз целиком.");
  if (r.getResponseCode() !== 200) throw new Error("Ключ не видит репозиторий qpage. Проверьте шаг 2 (Only select repositories - qpage).");
  p.setProperty("GITHUB_TOKEN", token);
  return "<b>Подключено.</b> Окно можно закрыть и запустить «QPortall → Обновить скрипт QPortall».";
}

function github(path, token, raw) {
  return UrlFetchApp.fetch("https://api.github.com" + path, {
    headers: { Authorization: "Bearer " + token, Accept: raw ? "application/vnd.github.raw" : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28" },
    muteHttpExceptions: true
  });
}

function scriptApi(method, path, body) {
  var opt = { method: method, headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  if (body) { opt.contentType = "application/json"; opt.payload = JSON.stringify(body); }
  var r = UrlFetchApp.fetch("https://script.googleapis.com/v1/projects/" + ScriptApp.getScriptId() + path, opt);
  var code = r.getResponseCode(), text = r.getContentText();
  if (code === 200) return text ? JSON.parse(text) : {};
  if (/has not been used|not enabled|SERVICE_DISABLED|User has not enabled/i.test(text))
    throw new Error("Включите Apps Script API: " + APPS_SCRIPT_API_PAGE + " → «Google Apps Script API» → Вкл. Через минуту запустите обновление ещё раз.");
  if (code === 403 && /insufficient|scope|PERMISSION_DENIED/i.test(text))
    throw new Error("У скрипта нет прав на обновление. Замените appsscript.json (инструкция у Claude) и запустите ещё раз.\nОтвет Google: " +
      text.replace(/\s+/g, " ").slice(0, 300));
  throw new Error("Apps Script API " + code + ": " + text.slice(0, 300));
}

function updateScript() {
  var p = PropertiesService.getScriptProperties(), token = p.getProperty("GITHUB_TOKEN");
  if (!token) { connectUpdates(); return; }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(240000)) throw new Error("QPortall: сейчас собирается сайт. Запустите обновление через пару минут.");
  try { notify(updateScriptNow(p, token)); }
  catch (e) { notify("Обновить не получилось. " + e.message); }
  finally { lock.releaseLock(); }
}

function updateScriptNow(p, token) {
  // 1. Последний коммит и файлы из него (все из одного коммита, чтобы не смешать версии).
  var c = github("/repos/" + UPDATE_REPO + "/commits/" + UPDATE_BRANCH, token);
  if (c.getResponseCode() === 401) throw new Error("GitHub не принял ключ (истёк?). QPortall → Подключить обновления.");
  if (c.getResponseCode() !== 200) throw new Error("GitHub ответил " + c.getResponseCode() + ".");
  var commit = JSON.parse(c.getContentText()), sha = commit.sha;
  var when = Utilities.formatDate(new Date(commit.commit.committer.date), "Asia/Jerusalem", "dd.MM.yyyy HH:mm");
  if (sha === p.getProperty("UPDATE_SHA")) return "Уже стоит последняя версия (" + when + ").";
  var fresh = {};
  UPDATE_FILES.forEach(function (f) {
    var r = github("/repos/" + UPDATE_REPO + "/contents/" + UPDATE_DIR + f[0] + "?ref=" + sha, token, true);
    var src = r.getResponseCode() === 200 ? r.getContentText("UTF-8") : "";
    if (src.length < 1000) throw new Error("Не скачался файл " + f[0] + " (" + r.getResponseCode() + "). Ничего не изменено.");
    fresh[f[1]] = src;
  });
  if (!/function updateScriptNow\(/.test(fresh.Code)) throw new Error("В новом Code нет обновления скрипта. Ничего не изменено.");

  // 2. Записываем файлы в проект; остальные файлы и appsscript.json не трогаем.
  var files = scriptApi("get", "/content").files || [], changed = [];
  UPDATE_FILES.forEach(function (f) {
    var name = f[1], have = null;
    files.forEach(function (x) { if (x.type === "SERVER_JS" && x.name.toLowerCase() === name.toLowerCase()) have = x; });
    if (!have) throw new Error("В проекте нет файла " + name + " (есть: " + files.map(function (x) { return x.name; }).join(", ") +
      "). Ничего не изменено.");
    if (have.source !== fresh[name]) { have.source = fresh[name]; changed.push(have.name); }
  });
  if (changed.length) scriptApi("put", "/content", { scriptId: ScriptApp.getScriptId(), files: files });

  // 3. Веб-приложение анкеты - на новую версию (раньше: «Развернуть → Управление развертываниями → Новая версия»).
  var web = "", m = /\/macros\/s\/([^/]+)\/exec/.exec(p.getProperty("ANKETA_API") || "");
  if (m && changed.length) {
    var v = scriptApi("post", "/versions", { description: "QPortall " + when });
    scriptApi("put", "/deployments/" + m[1], { deploymentConfig: {
      scriptId: ScriptApp.getScriptId(), versionNumber: v.versionNumber, manifestFileName: "appsscript", description: "QPortall " + when } });
    web = "\nПриём анкет переведён на новую версию (" + v.versionNumber + ").";
  }
  p.setProperty("UPDATE_SHA", sha);
  p.setProperty("UPDATE_DATE", when);
  if (!changed.length) return "Уже стоит последняя версия (" + when + ").";
  var page = changed.some(function (n) { return /^(anketa|stranica)$/i.test(n); }) ?
    "\nАнкета изменилась: нажмите «QPortall → Опубликовать анкету QPortall»." : "";
  return "Скрипт обновлён до версии от " + when + ". Изменены: " + changed.join(", ") + "." + web + page +
    "\nОбновите страницу таблицы (F5), чтобы меню взяло новую версию.";
}
