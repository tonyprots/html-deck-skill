// Аудит вёрстки HTML-деки. Вставлять целиком в javascript_tool Browser pane
// при вьюпорте ровно 1280×720 (resize_window), после скриншота (иначе пейн спит, innerWidth=0).
// Возвращает JSON: viewport/k/stage должны быть [1280,720]/1/[1280,720]; chrome.ok — логотип и кнопки на полях; bad — слайды с проблемами (footer-gap — контент ближе 12 px к кнопкам, rule-gap — линия ближе 8 px к соседу, code-chip-line-start — код с подложкой в начале строки, hand-overlap — пометка от руки ближе 8 px к блоку, hand-many — больше одной пометки на слайде, underfill — контент занимает меньше 80% высоты тела и пустоты больше 120 px, hollow — растянутый блок заполнен содержимым меньше чем на 45%, void — пустая полоса внутри блока шире 35% его высоты, sparse-rows — строка таблицы или таймлайна в 2,5 раза выше текста, detached — число в строке оторвано от подписи, ring-overlap — обводка от руки налезла на слово, head-lines — заголовок длиннее двух строк).
(() => {
  const R = [];
  // слайды появляются с анимацией (fade + translateY): замер сразу после смены .on
  // ловит кадр анимации и даёт ложные перекрытия на 7–10 px. На время аудита анимацию гасим.
  const still = document.createElement('style');
  still.textContent = '#deck .slide,#deck .slide *{transition:none!important;animation:none!important}';
  document.head.appendChild(still);
  const deck = document.querySelector('#deck');
  const slides = [...document.querySelectorAll('#deck > .slide')];
  const cur = slides.findIndex(s => s.classList.contains('on'));
  const vis = e => e.getClientRects().length > 0;
  const rect = e => e.getBoundingClientRect();
  const num = v => parseFloat(v) || 0;
  // rgb()/rgba() — каналы 0–255; color(srgb …) из color-mix — каналы 0–1, альфа после «/».
  const parse = c => {
    const m = (c.replace(/^color\(srgb/, '').match(/[\d.]+(e-?\d+)?/g) || []).map(Number);
    const k = c.startsWith('color(srgb') ? 255 : 1;
    return { r:(m[0]||0)*k, g:(m[1]||0)*k, b:(m[2]||0)*k, a: m.length>3 ? m[3] : 1 };
  };
  const lum = ({r,g,b}) => { const f = v => { v/=255; return v<=.03928 ? v/12.92 : ((v+.055)/1.055)**2.4 }; return .2126*f(r)+.7152*f(g)+.0722*f(b) };
  // Режим темы — по фону сцены; акцентные заливки — по вычисленным --measured и --flame (пробный элемент).
  const DARK = lum(parse(getComputedStyle(deck).backgroundColor)) < .2;
  const ACCENTS = ['--measured', '--flame'].map(v => { const p = document.createElement('i'); p.style.background = `var(${v})`;
    deck.appendChild(p); const c = getComputedStyle(p).backgroundColor; p.remove(); return c; });
  // фон-картинка из одних тонких линий без повтора (уголки чертежа, риски) под текст не ложится — считаем по цвету заливки
  const thinOnly = cs => {
    // слоёв в списках столько же, сколько в шорткате, включая пустой последний под цвет: берём только слои с картинкой
    const n = (cs.backgroundImage.match(/gradient\(|url\(/g) || []).length;
    const rep = cs.backgroundRepeat.split(',').slice(0, n), sz = cs.backgroundSize.split(',').slice(0, n);
    return rep.every(x => x.includes('no-repeat')) && sz.every(x => { const px = x.trim().split(/\s+/).map(v => v.endsWith('px') ? parseFloat(v) : Infinity); return Math.min(...px) <= 4; });
  };
  const bgOf = el => {
    let acc = null, grad = false;
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== 'none' && !thinOnly(cs)) grad = true;
      const c = parse(cs.backgroundColor);
      if (c.a > 0) {
        if (!acc) acc = c;
        else { const a = acc.a + c.a*(1-acc.a); acc = { r:(acc.r*acc.a + c.r*c.a*(1-acc.a))/a, g:(acc.g*acc.a + c.g*c.a*(1-acc.a))/a, b:(acc.b*acc.a + c.b*c.a*(1-acc.a))/a, a }; }
        if (acc.a >= .999) break;
      }
    }
    if (!acc) acc = { r:255,g:255,b:255,a:1 };
    if (acc.a < .999) { const a = acc.a; acc = { r:acc.r*a+255*(1-a), g:acc.g*a+255*(1-a), b:acc.b*a+255*(1-a), a:1 }; }
    return { bg: acc, grad };
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05) };
  const ONE = '.tag,.pill,.chip,.bar-val,.slide-num,.dv-nav li,.mx-col,.steps2-h'; // .bl (тезис бенто-плитки) переносится по замыслу — не проверяем
  const name = e => (e.className && String(e.className)) || e.tagName;

  slides.forEach((s, i) => {
    if (window.go) go(i); else { slides.forEach(x => x.classList.remove('on')); s.classList.add('on'); }
    const dr = rect(deck), sr = rect(s), cs = getComputedStyle(s);
    const r = { i, title: ((s.querySelector('h2,.dv-title,h1')||{}).textContent||'').slice(0,50), issues: [] };
    const ovY = s.scrollHeight - s.clientHeight, ovX = s.scrollWidth - s.clientWidth;
    if (ovY > 1 || ovX > 1) r.issues.push({ type:'slide-overflow', y: ovY, x: ovX });
    const body = s.querySelector('.body');
    if (body) {
      const kids = [...body.children].filter(vis);
      if (kids.length) {
        const above = s.querySelector(':scope > .lede') || s.querySelector(':scope > .slide-head') || s.querySelector(':scope > h2');
        const topGap = above ? Math.round(rect(kids[0]).top - rect(above).bottom) : null;
        const botLimit = sr.bottom - num(cs.paddingBottom);
        const botGap = Math.round(botLimit - rect(kids[kids.length-1]).bottom);
        if (topGap !== null && topGap < 8) r.issues.push({ type:'body-top-gap', gap: topGap });
        if (botGap < 0) r.issues.push({ type:'body-bottom-overflow', gap: botGap });
        // недозаполненный слайд: контент стоит своей высотой, снизу (или сверху и снизу) пустота.
        // Правило «пустота лечится воздухом» без замера не срабатывало ни разу — шаблон сам нарушал его на 7 слайдах из 15.
        const availTop = above ? rect(above).bottom : sr.top + num(cs.paddingTop);
        const avail = botLimit - availTop, content = rect(kids[kids.length-1]).bottom - rect(kids[0]).top;
        const free = Math.round(avail - content), fill = +(content / avail).toFixed(2);
        if (free > 120 && fill < 0.8 && !s.classList.contains('thanks')) r.issues.push({ type:'underfill', free, fill, fix:'главный блок .grow или крупнее кегль' });
        for (let k = 1; k < kids.length; k++) {
          const g = Math.round(rect(kids[k]).top - rect(kids[k-1]).bottom);
          if (g < 8) r.issues.push({ type:'body-sibling-gap', between:[name(kids[k-1]), name(kids[k])], gap: g });
        }
      }
    }
    // полый блок и дыра внутри: рамку растянули, а содержимое осталось мелким. Мерим объединение вертикальных
    // отрезков детей (стоящие рядом номер и текст не складываются) и самую широкую пустую полосу между ними.
    s.querySelectorAll('.card,.sv,.ls-i,.fs li,.mx-cell,.tile:not(.main):not(.warm),.sq4 .sq,.donut,.skl').forEach(b => {
      if (!vis(b)) return;
      const st = getComputedStyle(b), br = rect(b);
      const top = br.top + num(st.paddingTop) + num(st.borderTopWidth), bot = br.bottom - num(st.paddingBottom) - num(st.borderBottomWidth);
      const inner = bot - top;
      if (inner < 160) return;
      const iv = [...b.children].filter(vis).map(c => [Math.max(rect(c).top, top), Math.min(rect(c).bottom, bot)]).filter(x => x[1] > x[0]).sort((x, y) => x[0] - y[0]);
      let used = 0, gap = 0, cur = top;
      iv.forEach(([a, z]) => { if (a > cur) gap = Math.max(gap, a - cur); used += Math.max(0, z - Math.max(a, cur)); cur = Math.max(cur, z); });
      gap = Math.max(gap, bot - cur);
      if (used / inner < 0.45) r.issues.push({ type:'hollow', el: name(b), used: Math.round(used), inner: Math.round(inner), fix:'больше содержимого и кегля или не растягивать блок' });
      else if (gap > Math.max(110, inner * 0.35)) r.issues.push({ type:'void', el: name(b), gap: Math.round(gap), inner: Math.round(inner), fix:'дыра внутри блока: блок ниже или содержимое крупнее' });
    });
    // рыхлые строки таблицы и таймлайна: строка выше текста в ней в 2,5 раза — растянули таблицу, а не кегль
    s.querySelectorAll('tr, .tlrow').forEach(row => {
      if (!vis(row)) return;
      const h = rect(row).height; let txt = 0;
      row.querySelectorAll(':scope > td, :scope > th, :scope > span').forEach(c => { const rg = document.createRange(); rg.selectNodeContents(c); txt = Math.max(txt, rg.getBoundingClientRect().height); });
      if (txt && h > 80 && h / txt > 2.5) r.issues.push({ type:'sparse-rows', el: name(row), h: Math.round(h), text: Math.round(txt), fix:'не растягивать таблицу: крупнее кегль и поля, больше строк' });
    });
    // оторванное значение: в строке легенды или списка между подписью и числом пустота шире 200 px
    s.querySelectorAll('.dleg li, .skl li').forEach(li => {
      const tr = c => { const rg = document.createRange(); rg.selectNodeContents(c); const b = rg.getBoundingClientRect(); return b.width ? b : rect(c); };  // текст, а не ячейка сетки
      const cs2 = [...li.children].filter(vis).map(tr).sort((x, y) => x.left - y.left);
      for (let k = 1; k < cs2.length; k++) {
        const g = cs2[k].left - cs2[k-1].right;
        if (g > 200 && Math.abs(cs2[k].top - cs2[k-1].top) < 20) { r.issues.push({ type:'detached', el: name(li), gap: Math.round(g), fix:'число рядом с подписью: узкая колонка, а не 1fr' }); break; }
      }
    });
    // заголовок длиннее двух строк: широкий шрифт темы или длинная мысль — сокращать, а не мельчить
    s.querySelectorAll(':scope > .slide-head h2, :scope > h2').forEach(h => {
      const lh = num(getComputedStyle(h).lineHeight) || num(getComputedStyle(h).fontSize) * 1.1;
      const n = Math.round(rect(h).height / lh);
      if (n > 2 && !s.classList.contains('cover')) r.issues.push({ type:'head-lines', lines: n, fix:'заголовок в две строки: короче мысль' });
    });
    // обводка от руки налезла на соседнее слово
    s.querySelectorAll('.hand-ring').forEach(hr => {
      const sv = hr.querySelector('svg'), nx = hr.nextSibling;
      if (!sv || !nx || nx.nodeType !== 3 || !nx.textContent.trim()) return;
      const at = nx.textContent.search(/\S/), rg = document.createRange(); rg.setStart(nx, at); rg.setEnd(nx, at + 1);
      const g = rg.getBoundingClientRect().left - rect(sv).right;
      if (g < 4) r.issues.push({ type:'ring-overlap', gap: Math.round(g), fix:'шире поле .hand-ring справа' });
    });
    const flow = [...s.children].filter(e => vis(e) && getComputedStyle(e).position !== 'absolute' && !e.classList.contains('body'));
    for (let k = 1; k < flow.length; k++) {
      const g = Math.round(rect(flow[k]).top - rect(flow[k-1]).bottom);
      if (g < 8) r.issues.push({ type:'sibling-gap', between:[name(flow[k-1]), name(flow[k])], gap: g });
    }
    const abs = [...s.querySelectorAll('*'), deck.querySelector('.brand'), deck.querySelector('.nav')]
      .filter(e => e && vis(e) && getComputedStyle(e).position === 'absolute');
    const solid = [...s.querySelectorAll('.card,.tile,.layer,.bet,.matrix,.steps2,.bars,table,.note,.lede,h2,.dv-nav,.meta,.tl,.stack,.bento')].filter(vis);
    abs.forEach(a => solid.forEach(b => {
      if (a === b || a.contains(b) || b.contains(a)) return;
      const ra = rect(a), rb = rect(b);
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 0 && oy > 0) r.issues.push({ type:'absolute-overlap', a: name(a), b: name(b), px:[Math.round(ox),Math.round(oy)] });
    }));
    s.querySelectorAll('.card,.mx-cell,.tile,.bet,.layer,.ls').forEach(c => {
      const d = c.scrollHeight - c.clientHeight, dx = c.scrollWidth - c.clientWidth;
      if (d > 1 || dx > 1) r.issues.push({ type:'box-overflow', el: name(c), y: d, x: dx, text: c.textContent.trim().slice(0,40) });
    });
    s.querySelectorAll('*').forEach(e => {
      if (!vis(e)) return;
      const er = rect(e);
      if (!er.width && !er.height) return;
      if (er.left < dr.left - 1 || er.right > dr.right + 1 || er.top < dr.top - 1 || er.bottom > dr.bottom + 1)
        r.issues.push({ type:'outside-stage', el: name(e), box:[er.left,er.top,er.right,er.bottom].map(Math.round) });
    });
    s.querySelectorAll(ONE).forEach(e => {
      if (!vis(e)) return;
      const st = getComputedStyle(e), lh = num(st.lineHeight) || num(st.fontSize) * 1.3;
      const inner = rect(e).height - num(st.paddingTop) - num(st.paddingBottom);
      if (inner > lh * 1.6) r.issues.push({ type:'label-wrapped', el: name(e), text: e.textContent.trim().slice(0,30) });
    });
    const walker = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n; (n = walker.nextNode()); ) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement; if (!el || seen.has(el) || !vis(el)) continue; seen.add(el);
      const st = getComputedStyle(el);
      const fg = parse(st.color); if (fg.a === 0) continue;
      const { bg, grad } = bgOf(el);
      const size = num(st.fontSize), bold = num(st.fontWeight) >= 700;
      const large = size >= 24 || (size >= 18.66 && bold);
      const need = large ? 3 : 4.5;
      const rt = ratio(fg, bg);
      if (rt < need || grad) r.issues.push({ type: grad ? 'contrast-on-gradient-check-manually' : 'contrast', el: name(el), ratio:+rt.toFixed(2), need, size, text: n.textContent.trim().slice(0,30) });
    }
    s.querySelectorAll('.bar-row').forEach(row => {
      const fill = row.querySelector('.bar-fill'), val = row.querySelector('.bar-val');
      if (!fill || !val) return;
      const w = num(fill.style.width), v = num(val.textContent.replace(',', '.'));
      if (w && v && Math.abs(w - v) > 1) r.issues.push({ type:'bar-width-vs-label', width: w, label: v });
    });
    // Светлая тема: тёмная заливка блока или кнопки — чужая дизайн-системе («откуда ты взял такую дизайн-систему»).
    // Тёмная тема (фон сцены тёмный): наоборот, светлая плашка слепит — light-fill. Акцентные заливки
    // (--measured, --flame) в обоих случаях задуманы и не считаются. Видео и картинки не в счёт.
    s.querySelectorAll('*').forEach(e => {
      if (!vis(e) || /^(VIDEO|IMG|SVG|CANVAS|PICTURE)$/i.test(e.tagName) || e.closest('svg')) return;
      const raw = getComputedStyle(e).backgroundColor, bgc = parse(raw); if (bgc.a < .5) return;
      const er = rect(e); if (er.width * er.height < 1500) return;
      if (ACCENTS.includes(raw)) return;
      if (!DARK && lum(bgc) < .06) r.issues.push({ type:'dark-fill', el: name(e), text: e.textContent.trim().slice(0,30) });
      if (DARK && lum(bgc) > .5) r.issues.push({ type:'light-fill', el: name(e), text: e.textContent.trim().slice(0,30) });
    });
    // пометка от руки поверх слайда (.hand.pin) не налезает на блоки: зазор до заголовка, лида и блоков тела ≥ 8 px.
    s.querySelectorAll('.hand.pin').forEach(h => {
      if (!vis(h)) return; const hr = rect(h);
      s.querySelectorAll('.slide-head, .lede, .body > *, .body > * > *').forEach(b => {
        if (!vis(b) || b.contains(h) || h.contains(b)) return; const br = rect(b);
        const gx = Math.max(br.left - hr.right, hr.left - br.right), gy = Math.max(br.top - hr.bottom, hr.top - br.bottom);
        if (Math.max(gx, gy) < 8) r.issues.push({ type:'hand-overlap', el: name(b), gap: Math.round(Math.max(gx, gy)) });
      });
    });
    if (s.querySelectorAll('.hand').length > 1) r.issues.push({ type:'hand-many', n: s.querySelectorAll('.hand').length });
    // подвал: от нижнего края контента до верха кнопок не меньше 12 px («кнопки прилипли к блокам»).
    // Меряется при погашенной анимации (см. still выше), иначе кадр translateY даёт ложные 7 px.
    const navEl = deck.querySelector('.nav');
    if (navEl && vis(navEl)) {
      let low = 0;
      s.querySelectorAll('*').forEach(e => { if (vis(e) && getComputedStyle(e).position !== 'absolute') { const er = rect(e); if (er.width && er.height) low = Math.max(low, er.bottom); } });
      const gap = Math.round(rect(navEl).top - low);
      if (low && gap < 12) r.issues.push({ type:'footer-gap', gap });
    }
    // код с подложкой в начале строки читается как отступ («имя скилла кодом в начале строки выглядит как отступ»).
    s.querySelectorAll('code,.mono').forEach(c => {
      if (!vis(c)) return;
      const st = getComputedStyle(c);
      // только видимый чип (подложка или рамка); голый padding — намеренный отступ, как в дереве папок
      if (parse(st.backgroundColor).a < .05 && num(st.borderLeftWidth) < 1) return;
      let a = c.parentElement;
      while (a && a !== s && /^inline/.test(getComputedStyle(a).display)) a = a.parentElement;
      if (!a) return;
      const as = getComputedStyle(a), first = c.getClientRects()[0];
      const left = rect(a).left + num(as.borderLeftWidth) + num(as.paddingLeft) + num(as.textIndent);
      if (first && Math.abs(first.left - left) < 1.5) r.issues.push({ type:'code-chip-line-start', text: c.textContent.trim().slice(0,30) });
    });
    // линия-разделитель (border-top/bottom) вплотную к соседу: полоска над сноской «слишком близко к Фавиконке» (там же).
    s.querySelectorAll('*').forEach(e => {
      if (!vis(e) || e.closest('svg,table')) return;
      const st = getComputedStyle(e), er = rect(e);
      if (er.width < 40) return;
      const sib = (el, dir) => { let x = el[dir]; while (x && !vis(x)) x = x[dir]; return x; };
      // мерить до букв, а не до коробки: у коробки снизу полстроки интерлиньяжа, глаз его не видит как зазор
      const glyphs = el => { const out = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let t; (t = w.nextNode()); ) if (t.textContent.trim()) { const rg = document.createRange(); rg.selectNodeContents(t); out.push(...rg.getClientRects()); }
        return out.filter(q => q.height); };
      if (num(st.borderTopWidth) >= 1 && st.borderTopStyle !== 'none') {
        const p = sib(e, 'previousElementSibling'), gl = p ? glyphs(p) : [];
        if (gl.length) { const g = Math.round(er.top - Math.max(...gl.map(q => q.bottom))); if (g >= 0 && g < 8) r.issues.push({ type:'rule-gap', el: name(e), side:'top', gap: g }); }
      }
      if (num(st.borderBottomWidth) >= 1 && st.borderBottomStyle !== 'none') {
        const n = sib(e, 'nextElementSibling'), gl = n ? glyphs(n) : [];
        if (gl.length) { const g = Math.round(Math.min(...gl.map(q => q.top)) - er.bottom); if (g >= 0 && g < 8) r.issues.push({ type:'rule-gap', el: name(e), side:'bottom', gap: g }); }
      }
    });
    const broken = [...s.querySelectorAll('img')].filter(im => im.complete && !im.naturalWidth).length;
    if (broken) r.issues.push({ type:'broken-img', count: broken });
    s.querySelectorAll('.card .big').forEach(b => { const fs = num(getComputedStyle(b).fontSize); if (fs < 40) r.issues.push({ type:'big-shrunk', size: fs }); });
    s.querySelectorAll('*').forEach(e => { if (vis(e) && e.textContent.trim() && num(getComputedStyle(e).fontSize) < 12 && !e.children.length) r.issues.push({ type:'font-below-12', el: name(e), size: num(getComputedStyle(e).fontSize) }); });
    R.push(r);
  });
  if (window.go) go(cur >= 0 ? cur : 0); else { slides.forEach(x => x.classList.remove('on')); slides[cur >= 0 ? cur : 0].classList.add('on'); }
  still.remove();
  // логотип и кнопки на полях контента: левый край логотипа и правый край кнопок — на --slide-pad от краёв сцены
  const pad = num(getComputedStyle(document.documentElement).getPropertyValue('--slide-pad')), dr0 = rect(deck);
  const brandEl = deck.querySelector('.brand'), navEl0 = deck.querySelector('.nav');
  const chrome = {
    brandLeft: brandEl && vis(brandEl) ? Math.round(rect(brandEl).left - dr0.left - pad) : null,
    navRight: navEl0 && vis(navEl0) ? Math.round(dr0.right - pad - rect(navEl0).right) : null,
  };
  chrome.ok = [chrome.brandLeft, chrome.navRight].every(v => v === null || Math.abs(v) <= 1);
  const icon = document.querySelector('link[rel~="icon"]');
  // favicon: true — своя SVG; 'template' — осталась иконка из assets/template.html (отпечаток её пути); false — нет или не SVG
  let iconOk = false;
  try {
    const svg = icon ? decodeURIComponent(icon.href.split(',')[1] || '').trim() : '';
    iconOk = svg.includes('M7 6v20M25 6v20') ? 'template' : svg.startsWith('<svg');
  } catch (e) {}
  return JSON.stringify({ viewport:[innerWidth, innerHeight], k:getComputedStyle(document.documentElement).getPropertyValue('--k').trim(),
    mode: DARK ? 'dark' : 'light', stage:(r => [r.width, r.height].map(Math.round))(rect(deck)), favicon: iconOk, chrome, fkey: [...document.scripts].some(s => s.textContent.includes('requestFullscreen')), slides: slides.length, bad: R.filter(r => r.issues.length) }, null, 1);
})()
