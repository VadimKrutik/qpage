const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const jsQR = require('jsqr'); const { PNG } = require('pngjs');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const BASE = 'http://localhost:8099/';
const SHOTS = process.argv[2];
const results = []; const ok = (name, cond, info='') => { results.push({name, pass: !!cond, info}); };

(async () => {
  const browser = await chromium.launch();
  const viewports = { phone: {width:360,height:740}, tablet:{width:768,height:1024}, desktop:{width:1366,height:900} };
  for (const lang of ['ru','he','en']) {
    for (const [vpName, vp] of Object.entries(viewports)) {
      const ctx = await browser.newContext({ viewport: vp, locale: 'en-US' });
      const page = await ctx.newPage();
      const errs = [];
      page.on('console', m => { if (m.type()==='error' || m.type()==='warning') errs.push(m.text()); });
      page.on('pageerror', e => errs.push('PAGEERROR '+e.message));
      await page.goto(BASE + '?lang=' + lang, { waitUntil: 'networkidle' });
      const info = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir,
        h1: document.querySelector('h1 .hero-name').textContent, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
        title: document.title }));
      ok(`${lang}/${vpName}: lang+dir`, info.lang===lang && info.dir===(lang==='he'?'rtl':'ltr'), JSON.stringify([info.lang,info.dir]));
      ok(`${lang}/${vpName}: no horizontal scroll`, info.sw <= info.cw, `${info.sw} vs ${info.cw}`);
      ok(`${lang}/${vpName}: no console errors/warnings`, errs.length===0, errs.join(' | '));
      // overflowing elements check
      const wide = await page.evaluate(() => { const w=document.documentElement.clientWidth; return [...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect(); return r.width>0 && (r.right>w+1 || r.left< -1) && !e.closest('.sprite,.hp,.skip-link,.visually-hidden')}).map(e=>e.tagName+'.'+e.className).slice(0,5)});
      ok(`${lang}/${vpName}: no element outside viewport`, wide.length===0, wide.join(','));
      await page.screenshot({ path: path.join(SHOTS, `${lang}-${vpName}.png`), fullPage: true });
      if (vpName === 'desktop' || vpName==='phone') {
        await page.evaluate(AXE);
        const axe = await page.evaluate(async () => { const r = await axe.run(document, { runOnly: ['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice'] }); return r.violations.map(v => v.id + '(' + v.impact + '): ' + v.nodes.length + ' ' + v.nodes.slice(0,2).map(n=>n.target.join(' ')).join(' ; ')); });
        ok(`${lang}/${vpName}: axe violations`, axe.length===0, axe.join(' || '));
      }
      await ctx.close();
    }
  }

  // Language switching by clicking, persistence, URL
  {
    const ctx = await browser.newContext({ viewport: {width:1366,height:900}, locale:'ru-RU' });
    const page = await ctx.newPage(); const errs=[]; page.on('pageerror', e=>errs.push(e.message));
    await page.goto(BASE, { waitUntil:'networkidle' });
    const h0 = await page.textContent('h1');
    ok('default (ru browser) -> ru', await page.evaluate(()=>document.documentElement.lang)==='ru', h0);
    await page.click('[data-lang="he"]');
    const he = await page.evaluate(()=>({h1:document.querySelector('h1 .hero-name').textContent, dir:document.documentElement.dir, url:location.search, svc:document.querySelector('#services-list h3').textContent, price:document.querySelector('.card-price').textContent, pressed:document.querySelector('[data-lang="he"]').getAttribute('aria-pressed'), title: document.title}));
    ok('click HE switches content+dir+url', he.h1==='מאסטר בית' && he.dir==='rtl' && he.url==='?lang=he' && he.pressed==='true', JSON.stringify(he));
    await page.click('[data-lang="en"]');
    const en = await page.evaluate(()=>({h1:document.querySelector('h1 .hero-name').textContent, dir:document.documentElement.dir, price:document.querySelector('.card-price').textContent}));
    ok('click EN switches', en.h1==='Master Home' && en.dir==='ltr', JSON.stringify(en));
    await page.goto(BASE, { waitUntil:'networkidle' });
    ok('choice persists after reload', await page.evaluate(()=>document.documentElement.lang)==='en');
    // all data-i18n nodes non-empty in every language
    for (const l of ['ru','he','en']) {
      await page.click(`[data-lang="${l}"]`);
      const empty = await page.evaluate(()=>[...document.querySelectorAll('[data-i18n]')].filter(n=>!n.closest('[hidden]') && !n.textContent.trim()).map(n=>n.getAttribute('data-i18n')));
      ok(`${l}: all texts filled`, empty.length===0, empty.join(','));
    }
    ok('switch: no page errors', errs.length===0, errs.join('|'));
    await ctx.close();
  }

  // Links, form, map, QR
  {
    const ctx = await browser.newContext({ viewport: {width:1366,height:900} });
    const page = await ctx.newPage(); const errs=[]; page.on('pageerror', e=>errs.push(e.message));
    const reqs=[]; page.on('request', r=>reqs.push(r.method()+' '+r.url()));
    await page.goto(BASE+'?lang=ru', { waitUntil:'networkidle' });
    const hrefs = await page.evaluate(()=>[...document.querySelectorAll('[data-contact]')].map(a=>[a.dataset.contact,a.getAttribute('href'),a.hidden]));
    ok('contact links', JSON.stringify(hrefs).includes('tel:+972500000000') && JSON.stringify(hrefs).includes('https://wa.me/972500000000') && JSON.stringify(hrefs).includes('mailto:info@example.com'), JSON.stringify(hrefs));
    ok('telegram hidden when empty', hrefs.filter(h=>h[0]==='telegram').every(h=>h[2]===true));
    // all in-page anchors resolve
    const broken = await page.evaluate(()=>[...document.querySelectorAll('a[href^="#"]')].map(a=>a.getAttribute('href')).filter(h=>h.length>1 && !document.getElementById(h.slice(1))));
    ok('in-page anchors resolve', broken.length===0, broken.join(','));
    // empty submit
    await page.click('#f-submit');
    const e1 = await page.evaluate(()=>({inv:[...document.querySelectorAll('[aria-invalid="true"]')].map(n=>n.name), focus:document.activeElement.id, summary:document.querySelector('#error-summary').innerText, result:document.querySelector('#form-result').textContent}));
    ok('empty submit -> 4 errors, focus summary, no result', e1.inv.join()==='name,phone,message,consent' && e1.focus==='error-summary' && e1.result==='', JSON.stringify(e1));
    // errors relocalize
    await page.click('[data-lang="he"]');
    const heErr = await page.textContent('#f-name-err');
    ok('errors translated on switch', heErr.includes('נא להזין שם'), heErr);
    await page.click('[data-lang="ru"]');
    // invalid values
    await page.fill('#f-name','А'); await page.fill('#f-phone','12ab'); await page.fill('#f-email','bad@'); await page.fill('#f-message','коротко');
    await page.click('#f-submit');
    const e2 = await page.evaluate(()=>[...document.querySelectorAll('[aria-invalid="true"]')].map(n=>n.name));
    ok('invalid values rejected', e2.join()==='name,phone,email,message,consent', e2.join());
    // valid
    await page.fill('#f-name','Вадим'); await page.fill('#f-phone','050-123-4567'); await page.fill('#f-email','vadim@example.com'); await page.fill('#f-message','Стиральная машина не сливает воду');
    await page.check('#f-consent');
    const before = reqs.length;
    await page.click('#f-submit'); await page.waitForTimeout(500);
    const r = await page.evaluate(()=>({cls:document.querySelector('#form-result').className, text:document.querySelector('#form-result').textContent, inv:document.querySelectorAll('[aria-invalid="true"]').length, ls: JSON.stringify(localStorage)}));
    const newReqs = reqs.slice(before);
    ok('valid demo submit: honest NOT-sent message', r.cls.includes('is-demo') && r.text.includes('НЕ отправлена') && r.inv===0, r.text);
    ok('demo submit makes no network request', newReqs.length===0, newReqs.join(','));
    ok('form data not stored in localStorage', !r.ls.includes('Вадим') && !r.ls.includes('4567'), r.ls);
    await page.click('[data-lang="he"]');
    const heRes = await page.textContent('#form-result');
    ok('demo result translated', heRes.includes('לא נשלחה'), heRes);
    await page.screenshot({ path: path.join(SHOTS, 'form-demo-he.png'), fullPage:false, clip: await page.locator('#form').boundingBox().then(b=>({x:0,y:b.y,width:1366,height:Math.min(b.height,1400)})) });
    // map: placeholder until click
    ok('no third-party requests before map click', !reqs.some(u=>!u.includes('localhost')), reqs.filter(u=>!u.includes('localhost')).join(','));
    await page.click('#map-show');
    const frame = await page.getAttribute('#map-frame','src');
    ok('map iframe on click', frame && frame.startsWith('https://www.openstreetmap.org/export/embed.html') && frame.includes('marker=32.8156,34.9892'), frame);
    ok('map links', (await page.getAttribute('#map-google','href')).includes('32.8156,34.9892') && (await page.getAttribute('#map-waze','href')).includes('ll=32.8156,34.9892'));
    // QR decode
    await page.locator('#qr-code').scrollIntoViewIfNeeded();
    const buf = await page.locator('#qr-code').screenshot();
    const png = PNG.sync.read(buf); const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    ok('QR decodes to site url', code && code.data === BASE+'?lang=he', code && code.data);
    const dl = await page.getAttribute('#qr-download','href');
    ok('QR download link', dl && dl.startsWith('blob:'), dl);
    // keyboard: skip link
    await page.goto(BASE+'?lang=ru', { waitUntil:'networkidle' });
    await page.keyboard.press('Tab');
    const sk = await page.evaluate(()=>{const a=document.activeElement; const r=a.getBoundingClientRect(); return {cls:a.className, top:r.top, outline:getComputedStyle(a).outlineStyle}});
    ok('Tab -> visible skip link', sk.cls==='skip-link' && sk.top>=0, JSON.stringify(sk));
    await page.keyboard.press('Enter');
    ok('skip link moves focus to main', await page.evaluate(()=>document.activeElement.id)==='main');
    // tab through everything: every focusable gets visible outline
    const noOutline=[]; for (let i=0;i<60;i++){ await page.keyboard.press('Tab'); const f=await page.evaluate(()=>{const a=document.activeElement; const cs=getComputedStyle(a); return {id:a.id||a.tagName+':'+(a.textContent||'').trim().slice(0,20), o:cs.outlineStyle, w:cs.outlineWidth}}); if(!f.id.startsWith('BODY') && (f.o==='none'||f.w==='0px')) noOutline.push(f.id); }
    ok('focus visible on tabbed elements', noOutline.length===0, noOutline.join(','));
    ok('links/form/map/QR: no page errors', errs.length===0, errs.join('|'));
    await ctx.close();
  }

  // Mobile menu
  {
    const ctx = await browser.newContext({ viewport: {width:360,height:740} });
    const page = await ctx.newPage();
    await page.goto(BASE+'?lang=he', { waitUntil:'networkidle' });
    ok('mobile: nav hidden initially', !(await page.isVisible('#site-nav')));
    await page.click('#menu-toggle');
    ok('mobile: menu opens, aria-expanded', await page.isVisible('#site-nav') && (await page.getAttribute('#menu-toggle','aria-expanded'))==='true');
    await page.screenshot({ path: path.join(SHOTS, 'he-phone-menu.png') });
    await page.keyboard.press('Escape');
    ok('mobile: Escape closes menu', !(await page.isVisible('#site-nav')));
    ok('mobile: call bar visible', await page.isVisible('#mobile-bar'));
    await ctx.close();
  }

  // file:// open
  {
    const ctx = await browser.newContext(); const page = await ctx.newPage(); const errs=[];
    page.on('pageerror', e=>errs.push(e.message)); page.on('console', m=>{ if(m.type()==='error') errs.push(m.text()) });
    await page.goto('file://' + process.argv[3] + '/index.html');
    const h = await page.evaluate(()=>({h1:document.querySelector('h1 .hero-name').textContent, note:!document.querySelector('#qr-local-note').hidden}));
    ok('file:// opens without errors', h.h1 && errs.length===0, JSON.stringify(h)+errs.join('|'));
    ok('file://: QR shows local note', h.note);
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter(r=>!r.pass);
  results.forEach(r=>console.log((r.pass?'PASS ':'FAIL ')+r.name+(r.info && !r.pass ? '  -> '+r.info : '')));
  console.log(`\n${results.length-failed.length}/${results.length} passed`);
  fs.writeFileSync(path.join(SHOTS,'results.json'), JSON.stringify(results,null,1));
})();
