/* Трансканада — поведение всех страниц.
   Каждый блок включается, только если его разметка есть на странице.
   Прокрутка — только скриптом: html{scroll-behavior:smooth} ломает ScrollTrigger. */
(function () {
  'use strict';

  var doc = document;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var small = matchMedia('(max-width: 760px)').matches;
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  function q(s, r) { return (r || doc).querySelector(s); }
  function qa(s, r) { return [].slice.call((r || doc).querySelectorAll(s)); }

  /* ── типограф для строк, которые собирает скрипт ── */
  var NB = ' ';
  var SHORT = 'в|к|с|о|у|а|и|я|во|ко|со|об|на|за|по|до|из|от|не|ни|но|да|же|ли|бы|то|над|под|при|про|для|без|как|где|или|это|все|всё|уже|ещё|так|вы|мы|он|она|они|их|его|её|если|когда|чтобы';
  var RX_SHORT = new RegExp('(^|[\\s(«„—–])(' + SHORT + ') (?=\\S)', 'gi');
  var MONTHS = 'января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря';
  function typo(s) {
    if (!s) return s;
    var prev;
    do { prev = s; s = s.replace(RX_SHORT, function (m, a, w) { return a + w + NB; }); } while (s !== prev);
    return s
      .replace(/ ([—–])/g, NB + '$1')
      .replace(new RegExp('(\\d) (' + MONTHS + ')', 'g'), '$1' + NB + '$2')
      .replace(/(\d) (₽|км|ч|мин|дн|дней|дня|день|месяц|месяца|месяцев|недели|недель|CAD|%)/g, '$1' + NB + '$2')
      .replace(/(\d) (\d{3})/g, '$1' + NB + '$2');
  }
  function money(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NB) + NB + '₽'; }

  var data = {};
  try { data = JSON.parse((q('#siteData') || {}).textContent || '{}'); } catch (e) { data = {}; }
  function tourById(id) { return (data.tours || []).filter(function (t) { return t.id === id; })[0]; }
  function dateById(id) { return (data.dates || []).filter(function (d) { return d.id === id; })[0]; }

  /* ── шапка и меню ── */
  var head = q('#head'), burger = q('#burger');
  function setMenu(open) {
    if (!head || !burger) return;
    head.classList.toggle('is-open', open);
    doc.body.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Меню');
    doc.body.style.overflow = open ? 'hidden' : '';
    // полоса прокрутки пропадает только на время блокировки: место под неё держим, чтобы вёрстка не съезжала вбок
    doc.documentElement.style.scrollbarGutter = open ? 'stable' : '';
    // пункты стоят в разметке до бургера: без этого Tab из бургера уходит в страницу под меню
    if (open && getComputedStyle(burger).display !== 'none') {
      var first = q('.head__menu a, .head__menu button');
      if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 40);
    }
  }
  if (head && burger) {
    burger.addEventListener('click', function (e) {
      e.stopPropagation();
      setMenu(!head.classList.contains('is-open'));
    });
    doc.addEventListener('click', function (e) {
      if (head.classList.contains('is-open') && !head.contains(e.target)) setMenu(false);
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && head.classList.contains('is-open')) { setMenu(false); burger.focus(); }
    });
    addEventListener('resize', function () { if (innerWidth > 1100) setMenu(false); });
    qa('.head__menu a').forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
  }

  /* ── кнопка записи внизу экрана на телефоне ── */
  var dock = q('#dock'), foot = q('.foot');
  function onScroll() {
    if (head) head.classList.toggle('is-solid', scrollY > 24);
    if (dock) {
      var nearFoot = foot && foot.getBoundingClientRect().top < innerHeight - 60;
      dock.classList.toggle('is-on', scrollY > innerHeight * 0.9 && !nearFoot);
    }
  }
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── якоря внутри страницы ── */
  doc.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    var t = id && doc.getElementById(id);
    if (!t) return;
    e.preventDefault();
    t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    if (history.replaceState) history.replaceState(null, '', '#' + id);
  });

  /* ── фото появляются при прокрутке; текст не прячем никогда ── */
  var rv = qa('.rv');
  if (rv.length && 'IntersectionObserver' in window && !reduce) {
    doc.documentElement.classList.add('rv-ready');
    var rio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); rio.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -6% 0px' });
    rv.forEach(function (el) { rio.observe(el); });
  }
  /* клавиатура: фото под фокусом показываем сразу, без анимации */
  doc.addEventListener('focusin', function (e) {
    var r = e.target.closest && e.target.closest('.rv');
    if (r && !r.classList.contains('is-in')) { r.style.transition = 'none'; r.classList.add('is-in'); }
  });

  /* ── ролики: адрес подставляем, когда блок доехал до экрана; играет только видимый ── */
  // кнопки паузы больше нет: фон двигается всегда. Старый выбор «выключить видео» стираем, иначе ролики у того,
  // кто нажимал паузу, так и стояли бы
  try { localStorage.removeItem('tk-video-off'); } catch (e) {}
  function loadVideo(v) {
    if (v.dataset.loaded) return true;
    if (small && v.hasAttribute('data-desktop-only')) return false;
    var src = (small && v.dataset.srcSm) || v.dataset.src;
    if (!src) return false;
    v.src = src;
    v.dataset.loaded = '1';
    return true;
  }
  function playVideo(v) {
    if (reduce || saveData || !loadVideo(v)) return;
    var p = v.play();
    if (p && p.catch) p.catch(function () {});
  }
  /* Панели направлений стоят друг на друге: накрытая панель для IntersectionObserver
     остаётся видимой, и её ролик играл бы под следующей. Поэтому для них — своя проверка. */
  var dests = qa('.dest');
  var destVids = dests.map(function (d, i) { return { v: q('video[data-src]', d), d: d, next: dests[i + 1] }; })
    .filter(function (x) { return x.v; });
  function destVideos() {
    destVids.forEach(function (x) {
      var r = x.d.getBoundingClientRect();
      var shown = r.top < innerHeight * 0.45 && r.bottom > innerHeight * 0.55;
      var covered = x.next && x.next.getBoundingClientRect().top < innerHeight * 0.55;
      if (shown && !covered) playVideo(x.v);
      else if (!x.v.paused) x.v.pause();
    });
  }
  if (destVids.length) {
    addEventListener('scroll', destVideos, { passive: true });
    addEventListener('resize', destVideos);
    destVideos();
  }
  var vids = qa('video[data-src]').filter(function (v) { return !v.closest('.dest'); });
  if (vids.length && 'IntersectionObserver' in window) {
    var vio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var v = en.target;
        if (en.intersectionRatio >= 0.55) {
          playVideo(v);
        } else if (!v.paused) {
          v.pause();
        }
      });
    }, { threshold: [0, 0.55] });
    vids.forEach(function (v) { vio.observe(v); });
  }

  /* ── местное время в панелях направлений ── */
  var clocks = qa('[data-tz]');
  function tick() {
    clocks.forEach(function (el) {
      var out = q('[data-clock]', el);
      if (!out) return;
      try {
        out.textContent = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: el.getAttribute('data-tz') }).format(new Date());
      } catch (e) { out.textContent = ''; }
    });
  }
  if (clocks.length) { tick(); setInterval(tick, 20000); }

  /* ── когда вы свободны: месяц показывает заезды ── */
  var mBtns = qa('#monthBtns button'), mOut = q('#monthOut');
  function tripCard(d) {
    var t = tourById(d.tour) || {};
    return '<li class="mtrip"><img src="' + t.img + '" alt="" loading="lazy" width="96" height="72">' +
      '<div><p class="mtrip__when">' + typo(d.when) + '</p><a class="mtrip__name" href="' + t.url + '">' + typo(t.name) + '</a></div>' +
      '<button class="btn btn--gold" type="button" data-book data-tour="' + d.tour + '" data-date="' + d.id + '">Записаться</button></li>';
  }
  function renderMonth(m) {
    var info = (data.months || [])[m];
    if (!info) return;
    mBtns.forEach(function (b, i) { b.setAttribute('aria-pressed', i === m ? 'true' : 'false'); });
    var trips = (data.dates || []).filter(function (d) { return (d.months || []).indexOf(m) >= 0; });
    var html = '<div class="mout__head"><p class="mout__name">' + info.name + '</p><p class="mout__note">' + typo(info.note) + '</p></div>';
    if (trips.length) {
      html += '<ul class="mout__list">' + trips.map(tripCard).join('') + '</ul>';
    } else {
      html += '<div class="mout__empty"><p>' + typo(info.empty) + '</p><button class="btn btn--ghost" type="button" data-book>Собрать поездку под ваши даты</button></div>';
    }
    mOut.innerHTML = html;
  }
  if (mBtns.length && mOut && data.months) {
    mBtns.forEach(function (b, i) { b.addEventListener('click', function () { renderMonth(i); }); });
  }

  /* ── запись: окно на всех страницах, на странице контактов — форма в потоке ── */
  var dlg = q('#book'), form = q('#bookForm');
  if (form) {
    var fTour = q('#bTour'), fDate = q('#bDate'), fName = q('#bName'), fTel = q('#bTel'), fAgree = q('#bAgree');
    var err = q('#bErr'), ok = q('#bOk'), okText = q('#bOkText'), gBox = q('#bookGuide');
    var isDialog = !!(dlg && dlg.showModal && dlg.contains(form));

    var showGuide = function () {
      if (!gBox) return;
      var d = dateById(fDate.value);
      var t = d ? tourById(d.tour) : tourById(fTour.value);
      var g = t && data.guides && data.guides[t.guide];
      if (!g) { gBox.hidden = true; return; }
      gBox.hidden = false;
      q('img', gBox).src = g.face;
      q('b', gBox).textContent = g.name;
      q('span', gBox).textContent = typo('Ведёт маршрут «' + t.short + '» и ответит на вопросы до оплаты');
    };
    var fillDates = function (tourId, dateId) {
      var list = (data.dates || []).filter(function (d) { return !tourId || d.tour === tourId; });
      var opts = list.map(function (d) {
        var t = tourById(d.tour) || {};
        return '<option value="' + d.id + '">' + typo(d.when + (tourId ? '' : ' · ' + t.short)) + '</option>';
      }).join('');
      // без тура заезд не подставляем: иначе рядом с «Пока не выбрал» стоят чужие даты и гид
      fDate.innerHTML = tourId ? opts + '<option value="">Другие даты</option>'
                               : '<option value="">' + typo('Пока не знаю') + '</option>' + opts;
      fDate.value = dateId || (tourId && list[0] ? list[0].id : '');
      showGuide();
    };
    var openBook = function (tourId, dateId) {
      setMenu(false);
      form.hidden = false;
      if (ok) ok.hidden = true;
      if (err) err.textContent = '';
      if (dateId && !tourId) { var dd = dateById(dateId); if (dd) tourId = dd.tour; }
      fTour.value = tourId || '';
      fillDates(tourId || '', dateId || '');
      if (isDialog) {
        if (!dlg.open) dlg.showModal();
        doc.body.style.overflow = 'hidden';
        doc.documentElement.style.scrollbarGutter = 'stable';
      } else {
        form.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        // третий разбор: после прокрутки к форме фокус остаётся на body, с клавиатуры человек теряет место
        fName.focus({ preventScroll: true });
      }
    };
    var closeBook = function () {
      if (isDialog && dlg.open) dlg.close();
      if (!isDialog) { form.hidden = false; if (ok) ok.hidden = true; fName.focus({ preventScroll: true }); }
    };

    doc.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-book]');
      if (!b) return;
      e.preventDefault();
      openBook(b.getAttribute('data-tour') || '', b.getAttribute('data-date') || '');
    });
    fTour.addEventListener('change', function () { fillDates(fTour.value, ''); });
    fDate.addEventListener('change', function () {
      var d = dateById(fDate.value);
      if (d && fTour.value !== d.tour) { fTour.value = d.tour; fillDates(d.tour, d.id); return; }
      showGuide();
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var tel = fTel.value.trim();
      var msg = '';
      if (!fName.value.trim()) msg = 'Напишите, как к вам обращаться.';
      else if (tel.replace(/\D/g, '').length < 10 && !/^@?[a-z0-9_]{5,}$/i.test(tel)) msg = 'Нужен телефон или имя пользователя в Telegram.';
      else if (fAgree && !fAgree.checked) msg = 'Отметьте согласие на обработку данных: без него мы не можем вам написать.';
      [fName, fTel, fAgree].forEach(function (f) { if (f) { f.removeAttribute('aria-invalid'); f.removeAttribute('aria-describedby'); } });
      err.textContent = typo(msg);
      if (msg) {
        // ошибка встаёт сразу под полем, которое нужно поправить: строку под формой на телефоне
        // закрывает клавиатура (второй куратор, 15 сентября 2026)
        var telOk = tel.replace(/\D/g, '').length >= 10 || /^@?[a-z0-9_]{5,}$/i.test(tel);
        var bad = !fName.value.trim() ? fName : !telOk ? fTel : (fAgree || fTel);
        bad.setAttribute('aria-invalid', 'true');
        bad.setAttribute('aria-describedby', err.id);
        var holder = bad.closest('.fld, .check') || bad;
        holder.parentNode.insertBefore(err, holder.nextSibling);
        bad.focus();
        return;
      }
      form.insertBefore(err, form.querySelector('[type=submit]'));
      var t = tourById(fTour.value), d = dateById(fDate.value);
      okText.textContent = typo((t ? t.name : 'Поездка по Канаде') + (d ? ', ' + d.when : '') +
        '. Ответим в течение часа в рабочее время: пришлём программу, договор и список документов для визы.');
      form.hidden = true;
      ok.hidden = false;
      var okT = q('.book__t', ok);
      if (okT) { okT.setAttribute('tabindex', '-1'); okT.focus(); }
      form.reset();
      fillDates('', '');
    });
    [q('#bookClose'), q('#bOkClose')].forEach(function (b) { if (b) b.addEventListener('click', closeBook); });
    if (isDialog) {
      dlg.addEventListener('close', function () { doc.body.style.overflow = ''; doc.documentElement.style.scrollbarGutter = ''; });
      dlg.addEventListener('click', function (e) { if (e.target === dlg) closeBook(); });
    }
    if (!isDialog) fillDates('', '');
  }

  /* ── каталог: фильтр по тому, что хочется увидеть ── */
  var chips = qa('#filter button'), tcards = qa('.tcards .tcard'), found = q('#found');
  if (chips.length && tcards.length) {
    chips.forEach(function (c) {
      c.addEventListener('click', function () {
        var f = c.getAttribute('data-f');
        chips.forEach(function (x) { x.setAttribute('aria-pressed', x === c ? 'true' : 'false'); });
        var n = 0;
        tcards.forEach(function (card) {
          var keep = f === 'all' || (' ' + card.getAttribute('data-tags') + ' ').indexOf(' ' + f + ' ') >= 0;
          card.hidden = !keep;
          if (keep) n++;
        });
        if (found) found.textContent = typo('Показано ' + n + ' из ' + tcards.length);
        if (window.ScrollTrigger) ScrollTrigger.refresh();
      });
    });
  }

  /* ── программа по дням ── */
  var tabs = qa('.prog [role="tab"]'), prog = null;
  try { prog = JSON.parse((q('#progData') || {}).textContent || 'null'); } catch (e) { prog = null; }
  if (tabs.length && prog) {
    var pImg = q('#progImg'), pDay = q('#progDay'), pH = q('#progH'), pText = q('#progText'), pMeta = q('#progMeta');
    var showDay = function (i, focus) {
      var d = prog[i];
      if (!d) return;
      tabs.forEach(function (t, k) {
        t.setAttribute('aria-selected', k === i ? 'true' : 'false');
        t.tabIndex = k === i ? 0 : -1;
      });
      if (pImg) { pImg.srcset = d.srcset; pImg.src = d.img; pImg.alt = d.alt; }
      pDay.textContent = 'День ' + (i + 1);
      pH.textContent = d.title;
      pText.textContent = d.text;
      pMeta.innerHTML = d.meta.map(function (m) { return '<li>' + m + '</li>'; }).join('');
      if (focus) tabs[i].focus();
    };
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { showDay(i); });
      t.addEventListener('keydown', function (e) {
        var k = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : (e.key === 'ArrowUp' || e.key === 'ArrowLeft') ? -1 : 0;
        if (!k) return;
        e.preventDefault();
        showDay((i + k + tabs.length) % tabs.length, true);
      });
    });
  }

  /* ── цена поездки целиком ── */
  var calc = q('#calc');
  if (calc) {
    var total = q('#calcTotal');
    var recalc = function () {
      var sum = +calc.getAttribute('data-base') || 0;
      qa('input:checked', calc).forEach(function (i) { sum += +i.value || 0; });
      total.textContent = money(sum);
    };
    calc.addEventListener('change', recalc);
    recalc();
  }

  /* ── визовый календарь ── */
  var vSel = q('#vcalMonth'), vSteps = qa('#vcalSteps [data-off]'), vNote = q('#vcalNote');
  if (vSel && vSteps.length) {
    var fmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    var renderVisa = function () {
      var parts = vSel.value.split('-');
      var start = new Date(+parts[0], +parts[1] - 1, 1), now = new Date(), late = false;
      vSteps.forEach(function (li) {
        var d = new Date(start.getTime() - (+li.getAttribute('data-off')) * 864e5);
        q('.vcal__date', li).textContent = typo('до ' + fmt.format(d).replace(/\s*г\.$/, ''));
        var past = d < now;
        li.classList.toggle('is-late', past);
        if (past) late = true;
      });
      if (vNote) {
        vNote.textContent = typo(late
          ? 'Часть сроков уже прошла. Подать можно, но есть риск не успеть: выберите месяц позже или напишите нам, проверим по текущим срокам.'
          : 'Успеваете. Даты посчитаны с запасом на дополнительную проверку анкеты.');
      }
    };
    vSel.addEventListener('change', renderVisa);
    renderVisa();
  }

  /* ── фокус с клавиатуры в стопке направлений: следующая панель накрывает предыдущую,
        поэтому панель с фокусом выводим к её собственному началу ── */
  qa('.dest').forEach(function (panel) {
    panel.addEventListener('focusin', function () {
      // сразу, а не в requestAnimationFrame: в прогоне хука прокрутка из кадра не срабатывала, и фокус
      // оставался под следующей панелью. После этой прокрутки элемент уже на экране, и браузер к нему не прокручивает
      panel.style.position = 'relative';
      var top = Math.round(panel.getBoundingClientRect().top + scrollY);
      panel.style.position = '';
      if (Math.abs(scrollY - top) > 4) window.scrollTo(0, top);
    });
  });

  /* ── фото крупно ── */
  var lb = q('#lb'), lbBtns = qa('[data-lb]');
  if (lb && lb.showModal && lbBtns.length) {
    var lbImg = q('#lbImg'), lbCap = q('#lbCap'), cur = 0;
    var showLb = function (i) {
      cur = (i + lbBtns.length) % lbBtns.length;
      var b = lbBtns[cur], img = q('img', b);
      lbImg.src = b.getAttribute('data-full') || (img && img.src) || '';
      lbImg.alt = img ? img.alt : '';
      lbCap.textContent = b.getAttribute('data-cap') || '';
    };
    lbBtns.forEach(function (b, i) { b.addEventListener('click', function () { showLb(i); lb.showModal(); }); });
    q('#lbNext').addEventListener('click', function () { showLb(cur + 1); });
    q('#lbPrev').addEventListener('click', function () { showLb(cur - 1); });
    q('#lbClose').addEventListener('click', function () { lb.close(); });
    // закрывается кликом везде, кроме самого фото и кнопок: figure с полями занимает всё окно
    lb.addEventListener('click', function (e) { if (!e.target.closest('img, button')) lb.close(); });
    // на телефоне листается свайпом
    var sx = null;
    lb.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') sx = e.clientX; });
    lb.addEventListener('pointerup', function (e) {
      if (sx === null) return;
      var dx = e.clientX - sx;
      sx = null;
      if (Math.abs(dx) > 40) showLb(cur + (dx < 0 ? 1 : -1));
    });
    lb.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') showLb(cur + 1);
      if (e.key === 'ArrowLeft') showLb(cur - 1);
    });
  }

  /* ── движение: слово-окно, стопка направлений, день маршрута ── */
  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
    var mm = gsap.matchMedia();
    mm.add({ motion: '(prefers-reduced-motion: no-preference)', wide: '(min-width: 900px)' }, function (ctx) {
      var c = ctx.conditions;
      if (!c.motion) return;

      var hero = q('.hero');
      if (hero && q('.hero__word')) {
        gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: hero, start: 'top top', pin: true, scrub: 0.5, anticipatePin: 1, invalidateOnRefresh: true,
            end: function () { return '+=' + Math.round(innerHeight * (c.wide ? 0.9 : 0.7)); }
          }
        })
          .to('.hero__word', { scale: c.wide ? 2.4 : 2, duration: 1 }, 0)
          .to('.hero__mask', { opacity: 0, duration: 0.6 }, 0.4)
          .to('.hero__shade', { opacity: 1, duration: 0.6 }, 0.4);
      }

      // Панели направлений. Разбор куратора курсов, 15 сентября 2026: «скроллы усилить на основных блоках».
      // Следующая панель входит карточкой со скруглёнными углами и раскрывается на весь экран, фото в ней отъезжает
      // с 1,3 до 1, строки текста поднимаются по очереди. Предыдущая панель в это время уходит в темноту: гаснет текст,
      // фото уменьшается под вуалью. Границы считаем от контейнера .dests: панели липкие, и замер по прилипшей панели врёт.
      // Вход и уход анимируют разные элементы, чтобы твины разных панелей не спорили за одно свойство. На телефоне без
      // раскрытия карточкой: clip-path на весь экран с роликом там дорог.
      var destsBox = q('.dests'), dests = qa('.dest');
      // Верх панели в потоке меряем с отключённым прилипанием: панели идут не встык (замер 15 сентября 2026 — шаг
      // 1022 px при высоте 730), и расчёт «номер × высота» запускал вход следующей панели на 292 px раньше.
      var destTop = function (i) {
        var d = dests[i];
        d.style.position = 'relative';
        var top = d.getBoundingClientRect().top + scrollY;
        d.style.position = '';
        return top;
      };
      dests.forEach(function (d, i) {
        var media = q('.dest__media', d), prev = dests[i - 1];
        var words = qa('.dest__name, .dest__line, .dest__main .btn, .dest__facts > div', d);
        var tl = gsap.timeline({
          defaults: { ease: 'none', immediateRender: false },
          scrollTrigger: {
            trigger: destsBox, scrub: 0.4, invalidateOnRefresh: true,
            start: function () { return destTop(i) - innerHeight; },
            end: function () { return destTop(i); }
          }
        });
        if (c.wide) tl.fromTo(d, { clipPath: 'inset(18% 8% 0% 8% round 32px)' }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', duration: 1 }, 0);
        if (media) tl.fromTo(media, { scale: c.wide ? 1.3 : 1.18 }, { scale: 1, duration: 1 }, 0);
        if (words.length) tl.fromTo(words, { y: 64, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, stagger: 0.04 }, 0.5);
        if (prev) {
          var veil = q('.dest__veil', prev), pin = q('.dest__in', prev), shot = q('.dest__media img, .dest__media video', prev);
          if (veil) tl.fromTo(veil, { opacity: 0 }, { opacity: 0.72, duration: 1 }, 0);
          if (pin) tl.fromTo(pin, { y: 0, opacity: 1 }, { y: -80, opacity: 0, duration: 0.7 }, 0);
          if (shot && c.wide) tl.fromTo(shot, { scale: 1 }, { scale: 0.9, duration: 1 }, 0);
        }
      });

      var dayPin = q('.day__pin'), track = q('#dayTrack'), rail = q('#dayRail');
      // Кадры ленты сдвигаются внутри рамок, пока лента едет: она читается как вид из окна, а не как ряд плоских
      // картинок. 15 сентября 2026 Артём заметил, что у водопада (вертикальный кадр) сдвиг шёл поперёк ленты и бросался
      // в глаза, а у горизонтальных кадров шёл вдоль ленты и терялся в её движении. Теперь все кадры сдвигаются одинаково:
      // по вертикали и на одну долю рамки, с запасом у края. Разные оси и доли в одном ряду ловит hooks/checks/pan-uniform.js.
      // max-width и max-height из общего сброса снимаем: с ними высота 120 % обрезается до 100 %, и сдвиг открывает край кадра.
      var panMoments = function (trig) {
        qa('.moment', track).forEach(function (m) {
          var pic = q('.moment__pic', m), img = pic && q('img', pic);
          if (!img || !pic.clientHeight) return;
          gsap.set(img, { position: 'absolute', left: 0, top: '-10%', width: '100%', height: '120%', maxWidth: 'none', maxHeight: 'none' });
          gsap.fromTo(img, { yPercent: -7 }, { yPercent: 7, ease: 'none', scrollTrigger: trig(m) });
        });
      };
      if (c.wide && dayPin && track && rail) {
        // левое поле ленты повторяем справа: в конце последняя карточка не упирается в край окна
        var dist = function () {
          var padL = parseFloat(getComputedStyle(rail).paddingLeft) || 0;
          return Math.max(0, track.scrollWidth + padL * 2 - rail.clientWidth);
        };
        // блок встаёт посередине места под шапкой, а не посередине окна: иначе верх уходит под шапку
        var dayStart = function () {
          var hh = head ? head.getBoundingClientRect().height : 0, free = innerHeight - hh - dayPin.offsetHeight;
          return 'top ' + Math.round(hh + Math.max(0, free) / 2) + 'px';
        };
        var dayTween = gsap.to(track, {
          x: function () { return -dist(); }, ease: 'none',
          scrollTrigger: {
            trigger: dayPin, start: dayStart, pin: true, scrub: 0.6, invalidateOnRefresh: true,
            end: function () { return '+=' + dist(); }
          }
        });
        panMoments(function (m) {
          return { trigger: m, containerAnimation: dayTween, start: 'left right', end: 'right left', scrub: 0.6 };
        });
        if (dayPin.closest('.day')) dayPin.closest('.day').classList.add('is-pinned');
      } else if (track && rail) {
        // на телефоне ленту листают пальцем: кадры сдвигаются от прокрутки самой ленты
        panMoments(function (m) {
          return { trigger: m, scroller: rail, horizontal: true, start: 'left right', end: 'right left', scrub: true };
        });
      }
      // без пина лента листается сама: прокрутку прячем только под пином
      return function () { var dayBox = q('.day'); if (dayBox) dayBox.classList.remove('is-pinned'); };
    });
    addEventListener('load', function () { ScrollTrigger.refresh(); });
  }
})();
