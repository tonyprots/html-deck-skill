/* Пульт с телефона для HTML-деки. Самодостаточный блок: подшивается в любую
   деку этого семейства и НИЧЕГО в ней не правит — ни разметки, ни стилей, ни
   обработчиков. Всё, на что он опирается, — договор, общий для всех дек:

     .slide            секции слайдов, текущая помечена классом is-on
     data-title        заголовок слайда (для оглавления на телефоне)
     data-sec          раздел (группирует оглавление)
     .notes            заметки докладчика внутри слайда
     window.deckGo(n)  переход на слайд по индексу с нуля

   Нет `deckGo` — блок шлёт деке стрелки, это работает везде.

   Подшивает скрипт `scripts/add-clicker.py`. Адрес ретранслятора он же и
   подставляет вместо __RELAY__.

   ЧТО ВАЖНО ЗНАТЬ, ПРЕЖДЕ ЧЕМ ПРАВИТЬ

   1. Пульт молчит, пока его не позвали. Без `?r=<код>` в адресе и без
      клавиши R дека не делает ни одного сетевого запроса: она должна
      открываться с флешки офлайн ровно так же, как с сайта.
   2. Телефон отдаёт не событие «вперёд», а состояние: номер слайда и
      погашен ли экран. Событие терялось бы — ретранслятор хранит одну
      последнюю команду, и второе быстрое нажатие затирало бы первое.
   3. Код придумывает телефон. Код, набранный на экране в кабинете,
      прочитал бы весь зал.
   4. Клавиатура, колесо и щелчок по экрану работают всегда. Пульт —
      добавка; обрыв связи не должен менять в деке ничего, кроме надписи
      в углу.
*/
(function () {
  'use strict';

  /* Адрес ретранслятора берётся в три приёма, от менее надёжного к более:

       1. __RELAY__ — зашит при сборке. Работает, когда деку открыли не с
          сайта: с флешки, из письма, из архива. Может устареть.
       2. /p/relay.json — рядом с деками на сайте. Дека живёт годами и
          расходится копиями, а функция-ретранслятор переживает пересоздание
          и меняет адрес. Один файл рядом чинит все копии разом; зашитый
          адрес пришлось бы перешивать в каждой.
       3. ?relay= — только на свою машину, для прогона до выкатки. Чужой
          адрес отсюда не принимается: иначе параметр в ссылке стал бы
          способом увести управление на посторонний сервер. */
  var RELAY = '__RELAY__', pinned = false;
  try {
    var ovr = new URLSearchParams(location.search).get('relay');
    if (ovr && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(ovr)) { RELAY = ovr; pinned = true; }
  } catch (e) {}

  var asked = null;
  function address() {
    if (pinned) return Promise.resolve();
    if (asked) return asked;
    asked = fetch('/p/relay.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && typeof d.url === 'string' && /^https:\/\//.test(d.url)) RELAY = d.url;
      })
      .catch(function () { /* дека открыта не с сайта — остаётся зашитый */ });
    return asked;
  }

  var slides = [].slice.call(document.querySelectorAll('.slide'));
  if (!slides.length) return;

  var code = null, timer = null, lastSeq = null, told = null, primed = false;
  var fails = 0, beat = 0, blank = null;

  // ── Отметка в углу ────────────────────────────────────────────────────
  /* Селится в линейку навигации, если она есть: докладчик и без того косится
     в этот угол. Нет линейки — становится сам, тем же неброским шрифтом. */
  var mark = document.createElement('span');
  var ruler = document.querySelector('.ruler');
  if (ruler) {
    mark.style.cssText = 'margin-left:14px;white-space:nowrap;line-height:20px;font-size:13px;opacity:.75';
    ruler.appendChild(mark);
  } else {
    mark.style.cssText = 'position:fixed;left:22px;bottom:10px;z-index:9;font:13px sans-serif;opacity:.75';
    document.body.appendChild(mark);
  }
  function say(text, bad) {
    mark.textContent = text;
    mark.style.color = bad ? '#9B1C1C' : 'inherit';
  }

  // ── Поле для кода ─────────────────────────────────────────────────────
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:22px;bottom:46px;z-index:10;display:none;' +
    'align-items:baseline;gap:10px;padding:10px 14px;border-radius:10px;' +
    'background:#fff;color:#1A1A22;border:1px solid #CDD0DC;font:14px sans-serif;' +
    'box-shadow:0 8px 28px rgba(20,24,60,.14)';
  box.innerHTML = '<span>Код с телефона</span>' +
    '<input type="text" maxlength="12" autocomplete="off" autocapitalize="off" spellcheck="false" ' +
    'style="font:17px ui-monospace,Menlo,monospace;letter-spacing:.14em;width:7em;padding:3px 6px;' +
    'border:1px solid #CDD0DC;border-radius:6px;background:#F1F2F7;color:#1A1A22">' +
    '<span style="opacity:.6">' + location.host + '/p/pult</span>';
  document.body.appendChild(box);
  var input = box.querySelector('input');

  input.addEventListener('keydown', function (e) {
    // Буквы кода — не команды деки. Слушатель висит на самом поле, поэтому
    // до обработчика деки на document событие не доходит.
    e.stopPropagation();
    if (e.key === 'Enter') { box.style.display = 'none'; start(input.value); input.blur(); }
    else if (e.key === 'Escape') { box.style.display = 'none'; input.blur(); }
  });

  // ── Гашение экрана ────────────────────────────────────────────────────
  /* Чёрный лист поверх деки: когда нужно, чтобы зал смотрел на говорящего,
     а не на слайд. Ставится с телефона, снимается оттуда же. */
  function setBlank(on) {
    if (on && !blank) {
      blank = document.createElement('div');
      blank.style.cssText = 'position:fixed;inset:0;z-index:99;background:#000';
      document.body.appendChild(blank);
    } else if (!on && blank) {
      blank.parentNode.removeChild(blank);
      blank = null;
    }
  }

  // ── Где дека сейчас ───────────────────────────────────────────────────
  function at() {
    for (var k = 0; k < slides.length; k++) {
      if (slides[k].classList.contains('is-on')) return k + 1;
    }
    // Дека без js-режима показывает все слайды разом — тогда позиция
    // берётся из адреса, как её понимает сама дека.
    var h = parseInt((location.hash || '').slice(1), 10);
    return isNaN(h) ? 1 : Math.min(slides.length, Math.max(1, h));
  }

  function go(n) {
    n = Math.max(1, Math.min(slides.length, n));
    if (typeof window.deckGo === 'function') { window.deckGo(n - 1); return; }
    // Запасной путь для деки без deckGo: шлём ей столько стрелок, сколько
    // нужно. Медленнее, но работает в любой деке этого семейства.
    var d = n - at(), key = d > 0 ? 'ArrowRight' : 'ArrowLeft';
    for (var k = 0; k < Math.abs(d); k++) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
    }
  }

  // ── Связь ─────────────────────────────────────────────────────────────
  function poll() {
    if (!code) return;
    var url = RELAY + '?c=' + code + '&r=deck&t=' + slides.length + '&_=' + (++beat);
    /* Счётчик в адресе — не украшение: пока дека стоит на одном слайде, её
       запрос не меняется ни знаком, и кеширующий прокси в зале вправе
       отдавать прежний ответ. Тогда команды не доедут никогда, а понять
       это на месте будет нечем.

       Позицию дека сообщает, когда та изменилась, и заново раз в четыре
       секунды: иначе телефон не отличит «стоит на седьмом» от «закрылась».
       Порог молчания короче порога недоверия на телефоне (девять секунд). */
    var now = Date.now(), n = at();
    if (told === null || told.n !== n || now - told.at > 4000) {
      url += '&s=' + n + '&p=' + encodeURIComponent(location.pathname);
      told = { n: n, at: now };
    }
    fetch(url, { cache: 'no-store', mode: 'cors' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || d.ok !== true) throw new Error('отказ');
        fails = 0;
        /* Тот же порог, что и у команд ниже: телефон отмечается раз в
           четыре секунды, двенадцать — это три пропущенных отметки. */
        var quiet = d.age === null || d.age > 12;
        say('пульт ' + code + (quiet ? ' · телефон молчит' : ''), quiet);
        /* Первый круг только запоминает метку: команда, отданная до того,
           как дека включила пульт, — эхо прошлого сеанса, а не нажатие. */
        if (!primed) { primed = true; lastSeq = d.seq || null; return; }
        if (!d.seq || d.seq === lastSeq) return;
        lastSeq = d.seq;
        // Возраст считает ретранслятор: часы телефона и часы этой машины
        // расходятся на минуты, сравнивать их метки между собой нельзя.
        if (d.age === null || d.age > 12) return;
        setBlank(d.b === 1);
        if (d.n) go(d.n);
        else if (d.cmd === 'next') go(at() + 1);
        else if (d.cmd === 'prev') go(at() - 1);
        else if (d.cmd === 'first') go(1);
        else if (d.cmd === 'last') go(slides.length);
        told = null;                       // новую позицию сообщить сразу
      })
      .catch(function () {
        // Одиночный обрыв на плохой сети — не повод пугать докладчика.
        if (++fails >= 3) say('пульт ' + code + ' · нет связи', true);
      });
  }

  function start(c) {
    c = String(c || '').trim().toLowerCase();
    if (!/^[a-z0-9]{4,12}$/.test(c)) { say('пульт: код не подходит', true); return; }
    if (timer) clearInterval(timer);
    code = c; lastSeq = null; told = null; primed = false; fails = 0;
    say('пульт ' + c + ' · связь…');
    address().then(function () {
      if (code !== c) return;                 // передумали, пока спрашивали
      if (!/^https?:\/\//.test(RELAY)) { say('пульт: ретранслятор не настроен', true); code = null; return; }
      poll();
      timer = setInterval(poll, 700);
    });
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null; code = null; lastSeq = null; told = null; primed = false;
    setBlank(false);
    say('');
  }

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
      // preventDefault обязателен: без него та же «r» напечатается в поле,
      // которое она только что открыла и на которое навела фокус.
      e.preventDefault();
      if (code) { stop(); return; }        // второе нажатие выключает
      box.style.display = 'flex';
      input.value = '';
      input.focus();
    }
  });

  window.deckPult = { start: start, stop: stop, at: at };

  try {
    var armed = new URLSearchParams(location.search).get('r');
    if (armed) start(armed);
  } catch (e) {}
})();
