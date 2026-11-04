/*
 * Игровой цикл, управление, карточки действий, пауза и сохранение.
 */
(function () {
  var SIM = window.LG_SIM, B = window.LG_BALANCE, D = window.LG_DRAW;
  var SP = B.SPECIES, SLOTS = B.SLOTS, C = B.BALANCE;
  var SAVE_KEY = 'lastGardener.save.v1';
  var params = new URLSearchParams(location.search);
  var SPEED = Math.max(1, Math.min(200, Number(params.get('speed')) || 1)); // только для проверки

  var canvas = document.getElementById('scene');
  var ctx = canvas.getContext('2d');
  var $ = function (id) { return document.getElementById(id); };

  // ---------- Сохранение ----------
  var storageOk = true;
  function loadState() {
    if (params.has('fresh')) return SIM.newGame();
    try {
      var text = localStorage.getItem(SAVE_KEY);
      if (text) { var s = SIM.deserialize(text); if (s) return s; }
    } catch (e) { storageOk = false; }
    return SIM.newGame();
  }
  var state = loadState();
  function save() {
    try {
      state.gardenerX = g.x;
      localStorage.setItem(SAVE_KEY, SIM.serialize(state));
      storageOk = true;
    } catch (e) { storageOk = false; }
  }

  // ---------- Состояние интерфейса ----------
  var g = { x: state.gardenerX || 640, targetX: state.gardenerX || 640, facing: 1, phase: 0, action: null, actionT: 0, after: null, onArrive: null };
  var ui = { target: null, mode: 'normal', from: null, inspected: false, paused: false, intro: !state.introSeen, confirmReset: false, syncing: false, conflict: null, syncForm: false, confirmUnlink: false };
  var parts = [];
  var view = { scale: 1, ox: 0, oy: 0, cw: 0, ch: 0, dpr: 1, pan: false, viewW: 0 };
  var cam = { x: 0, holdUntil: 0 };
  var tAnim = 0;

  // ---------- Слова ----------
  var FEM = { rosette: true };
  function verb(species, m, f) { return FEM[species] ? f : m; }
  function eventText(e) {
    var n = SP[e.species].name;
    switch (e.type) {
      case 'bloom': return e.species === 'fern' ? n + ' спороносит — на листьях светятся точки.' : n + ' ' + verb(e.species, 'зацвёл', 'зацвела') + '.';
      case 'adult': return n + ' ' + verb(e.species, 'вырос', 'выросла') + '.';
      case 'seeds': return n + ': ' + (e.species === 'fern' ? 'споры созрели' : 'семена созрели') + '. Их можно собрать.';
      case 'warn': return n + ' ' + 'выглядит плохо. Стоит осмотреть.';
      case 'death': return n + ' ' + verb(e.species, 'погиб', 'погибла') + '. Остатки можно убрать и посадить новое.';
      case 'rescue': return 'В архиве нашлось семя: ' + n + '.';
    }
    return '';
  }

  // ---------- Иконки (рисованные, без эмодзи) ----------
  var ICON = {
    inspect: '<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L20 20"/>',
    water: '<path d="M4 10h11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M15 13l5-5"/><path d="M19 6l3 3"/><path d="M6 10a4 4 0 0 1 8 0"/>',
    little: '<path d="M12 4c3 4.5 5 7 5 10a5 5 0 0 1-10 0c0-3 2-5.5 5-10z"/>',
    move: '<path d="M12 3v9"/><path d="M7 12h10l-1.6 7.2a1 1 0 0 1-1 .8H9.6a1 1 0 0 1-1-.8z"/><path d="M9.5 6L12 3l2.5 3"/>',
    collect: '<ellipse cx="8" cy="15" rx="2.2" ry="3.2"/><ellipse cx="14" cy="12" rx="2.2" ry="3.2"/><ellipse cx="17" cy="18" rx="2" ry="3"/><path d="M4 21h16"/>',
    clear: '<path d="M5 20l7-7"/><path d="M11 9l4 4"/><path d="M13 7l4-4 4 4-4 4"/><path d="M4 21h7"/>',
    plant: '<path d="M12 21v-9"/><path d="M12 12C12 8 9 6 5 6c0 4 3 6 7 6z"/><path d="M12 14c0-3 3-5 6-5 0 3-3 5-6 5z"/><path d="M7 21h10"/>',
    pause: '<path d="M9 6v12M15 6v12"/>',
    play: '<path d="M8 5l11 7-11 7z"/>'
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICON[name] + '</svg>';
  }
  var SEED_COLOR = { sun: '#d9a94a', fern: '#6fb79a', rosette: '#c995a8' };
  function seedIcon(s) {
    return '<svg viewBox="0 0 24 24" class="seed" aria-hidden="true"><ellipse cx="12" cy="13" rx="6" ry="8" fill="' + SEED_COLOR[s] + '"/><path d="M12 6c1 3 1 9 0 14" stroke="rgba(60,40,20,.35)" stroke-width="1.4" fill="none"/></svg>';
  }

  // ---------- Раскладка экрана и камера ----------
  function layout() {
    var cw = window.innerWidth, ch = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    var portrait = ch > cw;
    var scale, oy;
    if (portrait) {
      scale = Math.min(ch * 0.58 / 680, cw / 520);
      oy = Math.max(64, ch * 0.4 - 345 * scale);
    } else {
      scale = Math.min(cw / 1250, ch / 690);
      oy = (ch - 690 * scale) / 2 - 15 * scale;
    }
    var viewW = cw / scale;
    view.scale = scale; view.oy = oy; view.cw = cw; view.ch = ch; view.dpr = dpr;
    view.viewW = viewW; view.pan = viewW < 1240; view.portrait = portrait;
    if (!view.pan) view.ox = (cw - D.W * scale) / 2;
    document.body.classList.toggle('portrait', portrait);
  }
  function camLimits() { return [20, Math.max(20, 1260 - view.viewW)]; }
  function updateCamera(dt, now) {
    if (!view.pan) return;
    var lim = camLimits();
    if (now > cam.holdUntil) {
      var focus = g.x;
      if (ui.target && ui.target.kind === 'slot') focus = (g.x + SLOTS[ui.target.i].x) / 2;
      var desired = Math.min(lim[1], Math.max(lim[0], focus - view.viewW / 2));
      cam.x += (desired - cam.x) * Math.min(1, dt * 2.5);
    }
    cam.x = Math.min(lim[1], Math.max(lim[0], cam.x));
    view.ox = -cam.x * view.scale;
  }

  // ---------- Садовник ----------
  function standX(x) {
    var side = g.x < x ? -1 : 1;
    var sx = x + side * 80;
    if (sx < 110) sx = x + 80;
    if (sx > 1170) sx = x - 80;
    return sx;
  }
  function walkTo(x, cb) {
    g.targetX = Math.max(100, Math.min(1180, x));
    g.onArrive = cb || null;
    g.lookAt = null;
  }
  function updateGardener(dt) {
    var dx = g.targetX - g.x;
    if (Math.abs(dx) > 2) {
      var stepLen = Math.min(Math.abs(dx), C.walkSpeed * dt);
      g.x += Math.sign(dx) * stepLen;
      g.facing = Math.sign(dx);
      g.phase += dt * 8.5;
    } else {
      g.x = g.targetX;
      g.phase = 0;
      if (g.onArrive) { var cb = g.onArrive; g.onArrive = null; cb(); }
    }
    if (g.action) {
      g.actionT -= dt;
      if (g.action === 'water' && Math.random() < dt * 30 && g.slot !== undefined) {
        var sx = SLOTS[g.slot].x;
        parts.push({ kind: 'drop', x: sx - g.facing * 6 + (Math.random() - 0.5) * 30, y: D.SOIL_Y - 60, vx: 0, vy: 90, life: 0.55, max: 0.55 });
      }
      if (g.actionT <= 0) {
        g.action = null;
        var fn = g.after; g.after = null;
        if (fn) fn();
      }
    }
  }
  function face(x) { g.facing = x >= g.x ? 1 : -1; }
  function perform(action, duration, slot, fn) {
    g.action = action; g.actionT = duration; g.after = fn; g.slot = slot;
    renderCard(true);
  }

  function updateParticles(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'drop') p.vy += 300 * dt;
      if (p.life <= 0) parts.splice(i, 1);
    }
  }
  function sparkle(i) {
    var x = SLOTS[i].x, top = D.plantTopY(state.pots[i].plant);
    for (var k = 0; k < 18; k++) {
      parts.push({ kind: 'spark', x: x + (Math.random() - 0.5) * 60, y: top + 20 + Math.random() * 60, vx: (Math.random() - 0.5) * 20, vy: -20 - Math.random() * 30, life: 1.2, max: 1.2 });
    }
  }

  // ---------- Выбор объектов ----------
  function hitTest(wx, wy) {
    for (var i = 0; i < SLOTS.length; i++) {
      var top = Math.min(D.plantTopY(state.pots[i].plant) - 20, D.SOIL_Y - 70);
      if (Math.abs(wx - SLOTS[i].x) < 64 && wy > top && wy < D.FLOOR + 12) return { kind: 'slot', i: i };
    }
    var A = D.ARCHIVE;
    if (wx > A.x - 10 && wx < A.x + A.w + 10 && wy > A.y - 10 && wy < A.y + A.h + 10) return { kind: 'archive' };
    var T = D.TANK;
    if (wx > T.x - 10 && wx < T.x + T.w + 40 && wy > T.y - 10 && wy < D.FLOOR + 10) return { kind: 'tank' };
    return null;
  }

  function select(target) {
    ui.target = target; ui.inspected = false; ui.confirmReset = false;
    hideCard();
    var x = target.kind === 'slot' ? SLOTS[target.i].x : target.kind === 'archive' ? D.ARCHIVE.x : D.TANK.x + 30;
    walkTo(standX(x), function () { face(x); showCard(); });
  }

  function tap(sx, sy) {
    if (ui.paused || ui.intro || ui.syncing || ui.conflict || g.action) return;
    var wx = (sx - view.ox) / view.scale, wy = (sy - view.oy) / view.scale;
    var hit = hitTest(wx, wy);
    if (ui.mode === 'transplant') {
      if (hit && hit.kind === 'slot' && hit.i !== ui.from) {
        var from = ui.from, to = hit.i;
        ui.mode = 'normal'; hideBanner();
        ui.target = { kind: 'slot', i: to };
        walkTo(standX(SLOTS[to].x), function () {
          face(SLOTS[to].x);
          perform('plant', 0.9, to, function () {
            SIM.transplant(state, from, to);
            save();
            toast('Пересажено. Растение поехало вместе со своей землёй.');
            showCard();
          });
        });
      } else if (hit && hit.kind === 'slot' && hit.i === ui.from) {
        cancelTransplant();
      }
      return;
    }
    if (hit) { select(hit); return; }
    if (wx > D.ROOM.x0 && wx < D.ROOM.x1 && wy > D.ROOM.y0 && wy < D.FLOOR + 40) {
      ui.target = null; hideCard();
      walkTo(wx);
    }
  }

  // ---------- Указатель: касание и мышь ----------
  var ptr = null;
  canvas.addEventListener('pointerdown', function (e) {
    ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, camX: cam.x, drag: false };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* не важно */ }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!ptr || ptr.id !== e.pointerId) return;
    var dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
    if (!ptr.drag && Math.sqrt(dx * dx + dy * dy) > 10) ptr.drag = true;
    if (ptr.drag && view.pan) {
      var lim = camLimits();
      cam.x = Math.min(lim[1], Math.max(lim[0], ptr.camX - dx / view.scale));
      cam.holdUntil = performance.now() + 4000;
    }
  });
  canvas.addEventListener('pointerup', function (e) {
    if (!ptr || ptr.id !== e.pointerId) return;
    if (!ptr.drag) tap(e.clientX, e.clientY);
    ptr = null;
  });
  canvas.addEventListener('pointercancel', function () { ptr = null; });

  // ---------- Карточка действий ----------
  var card = $('card'), cardBody = $('card-body'), cardActions = $('card-actions');
  var lastActionsSig = '';
  function hideCard() { card.classList.add('hidden'); lastActionsSig = ''; }
  function showCard() { card.classList.remove('hidden'); renderCard(true); }

  function btn(act, ic, label, arg, extra) {
    return '<button class="act ' + (extra || '') + '" data-act="' + act + '"' + (arg !== undefined ? ' data-arg="' + arg + '"' : '') + '><span class="pebble">' + ic + '</span><span class="lbl">' + label + '</span></button>';
  }

  function cardContent() {
    var t = ui.target;
    if (!t) return null;
    if (t.kind === 'archive') {
      var rows = Object.keys(SP).map(function (s) {
        var n = state.seeds[s];
        var note = n > 0 ? '' : (state.rescue[s] > 0 ? '<em>архив ищет семя…</em>' : '<em>пусто, пока растёт живое растение</em>');
        return '<li>' + seedIcon(s) + '<div><b>' + SP[s].name + '</b> — ' + n + ' ' + plural(n, 'шт.') + ' ' + note + '<br><small>' + SP[s].trait + '</small></div></li>';
      }).join('');
      return { title: 'Семенной архив', stage: 'старый шкаф станции',
        body: '<p>Здесь хранятся семена и споры. Если какой-то вид совсем исчезнет из сада, архив со временем найдёт для него ещё одно семя.</p><ul class="seeds">' + rows + '</ul>', actions: '' };
    }
    if (t.kind === 'tank') {
      return { title: 'Бак с водой', stage: 'конденсат станции',
        body: '<p>Вода собирается из влажного воздуха оранжереи. Её хватает на всех — экономить не нужно. Важно другое: сколько воды нужно каждому растению.</p>', actions: '' };
    }
    var i = t.i, pot = state.pots[i], p = pot.plant;
    var d = SIM.describe(state, i);
    var body = '<p class="look">' + d.look + '</p>';
    if (ui.inspected || !p) body += '<p class="hint">' + d.hint + '</p>';
    var acts = '';
    if (!p) {
      var any = false;
      Object.keys(SP).forEach(function (s) {
        if (state.seeds[s] > 0) { any = true; acts += btn('plant', icon('plant'), 'Посадить: ' + SP[s].name + ' (' + state.seeds[s] + ')', s, 'wide'); }
      });
      if (!any) body += '<p class="hint">Семян пока нет. Их дают цветущие растения, а архив в углу хранит запас.</p>';
      acts += btn('water', icon('water'), 'Полить') + btn('little', icon('little'), 'Немного');
    } else if (p.dead) {
      acts += btn('clear', icon('clear'), 'Убрать') + btn('inspect', icon('inspect'), 'Осмотреть');
    } else {
      if (!ui.inspected) acts += btn('inspect', icon('inspect'), 'Осмотреть');
      acts += btn('water', icon('water'), 'Полить') + btn('little', icon('little'), 'Немного');
      if (p.seedsReady > 0) acts += btn('collect', icon('collect'), 'Собрать ' + SP[p.species].seedWord);
      acts += btn('move', icon('move'), 'Пересадить');
    }
    return { title: d.title, stage: d.stage, body: body, actions: acts };
  }
  function plural(n, w) { return w; }

  function renderCard(force) {
    if (card.classList.contains('hidden')) return;
    var c = cardContent();
    if (!c) { hideCard(); return; }
    $('card-title').textContent = c.title;
    $('card-stage').textContent = c.stage;
    if (cardBody.innerHTML !== c.body) cardBody.innerHTML = c.body;
    var sig = c.actions + (g.action ? 'busy' : '');
    if (force || sig !== lastActionsSig) {
      cardActions.innerHTML = c.actions;
      cardActions.classList.toggle('busy', !!g.action);
      lastActionsSig = sig;
    }
    // карточка на противоположной стороне от растения (на широком экране)
    var tx = ui.target.kind === 'slot' ? SLOTS[ui.target.i].x : 1100;
    var screenX = tx * view.scale + view.ox;
    card.classList.toggle('on-left', screenX > view.cw / 2);
  }

  cardActions.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b || g.action || !ui.target || ui.target.kind !== 'slot') return;
    var i = ui.target.i, act = b.getAttribute('data-act'), arg = b.getAttribute('data-arg');
    var x = SLOTS[i].x;
    face(x);
    if (act === 'inspect') {
      perform('inspect', 1.0, i, function () { ui.inspected = true; renderCard(true); });
    } else if (act === 'water' || act === 'little') {
      perform('water', act === 'water' ? 1.3 : 0.7, i, function () {
        SIM.water(state, i, act === 'water' ? C.waterFull : C.waterLittle); save(); renderCard(true);
      });
    } else if (act === 'plant') {
      perform('plant', 1.0, i, function () {
        if (SIM.plantSeed(state, i, arg)) { toast('Посажено: ' + SP[arg].name + '. Первые дни семени нужна влажная земля.'); }
        save(); renderCard(true);
      });
    } else if (act === 'collect') {
      perform('collect', 1.0, i, function () {
        var sp = state.pots[i].plant.species;
        var n = SIM.collectSeeds(state, i);
        if (n) { sparkle(i); toast('Собрано: ' + n + ' — ' + SP[sp].name + '. Они лежат в архиве.'); }
        save(); renderCard(true);
      });
    } else if (act === 'clear') {
      perform('clear', 1.0, i, function () { SIM.clearPot(state, i); save(); renderCard(true); });
    } else if (act === 'move') {
      ui.mode = 'transplant'; ui.from = i; hideCard();
      showBanner('Куда пересадить? Нажмите на другой горшок. Если там есть растение, они поменяются местами.');
    }
  });
  $('card-close').addEventListener('click', function () { hideCard(); ui.target = null; });

  function showBanner(text) { $('banner-text').textContent = text; $('banner').classList.remove('hidden'); }
  function hideBanner() { $('banner').classList.add('hidden'); }
  function cancelTransplant() { ui.mode = 'normal'; hideBanner(); showCard(); }
  $('banner-cancel').addEventListener('click', cancelTransplant);

  // ---------- Сообщения ----------
  var toasts = [], toastTimer = 0;
  function toast(text) { if (text) toasts.push(text); }
  function updateToasts(dt) {
    var el = $('toast');
    toastTimer -= dt;
    if (toastTimer <= 0) {
      if (toasts.length) {
        el.textContent = toasts.shift();
        el.classList.add('show');
        toastTimer = 4.5;
      } else if (el.classList.contains('show')) {
        el.classList.remove('show');
      }
    }
  }

  // ---------- Мешочек с семенами ----------
  var lastHud = '';
  function renderHud() {
    var html = Object.keys(SP).map(function (s) { return '<span class="pouch-item" title="' + SP[s].name + '">' + seedIcon(s) + '<b>' + state.seeds[s] + '</b></span>'; }).join('');
    if (html !== lastHud) { $('pouch').innerHTML = html; lastHud = html; }
  }

  // ---------- Пауза ----------
  function setPaused(p) {
    ui.paused = p;
    ui.confirmReset = false;
    $('pause-overlay').classList.toggle('hidden', !p);
    document.body.classList.toggle('paused', p);
    $('reset-btn').textContent = 'Начать сад заново';
    $('pause-btn').innerHTML = icon(p ? 'play' : 'pause');
    $('pause-btn').setAttribute('aria-label', p ? 'Продолжить' : 'Пауза');
    $('save-note').textContent = storageOk ? 'Сад сохранён на этом устройстве.' : 'Не получается сохранить: браузер запрещает хранение данных (например, в частном режиме).';
    $('version-note').textContent = 'Версия игры: ' + (window.LG_VERSION || '—');
    if (p) save();
    ui.confirmUnlink = false;
    renderSyncBox();
    if (p) runSync('pause', true); else runSync('resume');
  }
  $('pause-btn').addEventListener('click', function () { if (!ui.intro) setPaused(!ui.paused); });
  $('resume-btn').addEventListener('click', function () { setPaused(false); });
  $('reset-btn').addEventListener('click', function () {
    if (!ui.confirmReset) { ui.confirmReset = true; $('reset-btn').textContent = 'Точно? Нажмите ещё раз'; return; }
    state = SIM.newGame(); state.introSeen = true;
    g.x = g.targetX = 640; g.action = null; g.onArrive = null;
    ui.target = null; ui.mode = 'normal'; hideCard(); hideBanner();
    save(); setPaused(false);
    toast('Новый сад. Те же три растения ждут вас.');
  });
  // Сад засыпает, когда игра уходит в фон или окно теряет фокус.
  document.addEventListener('visibilitychange', function () { if (document.hidden) { save(); if (!ui.intro) setPaused(true); } });
  window.addEventListener('blur', function () { if (!ui.intro && !params.has('nopause')) setPaused(true); });
  window.addEventListener('pagehide', save);

  // ---------- Вступление ----------
  if (ui.intro) $('intro').classList.remove('hidden');
  $('intro-btn').addEventListener('click', function () {
    ui.intro = false; state.introSeen = true; save();
    $('intro').classList.add('hidden');
    toast('Нажмите на растение — садовник подойдёт к нему.');
    if (view.pan) toast('Проведите пальцем по экрану, чтобы осмотреть всю оранжерею.');
  });

  // ---------- Сад на всех устройствах (синхронизация через GitHub игрока) ----------
  var SYNC = window.LG_SYNC;
  var sync = SYNC.create({
    storage: { get: function (k) { return localStorage.getItem(k); }, set: function (k, v) { localStorage.setItem(k, v); } },
    fetch: function (u, o) { return window.fetch(u, o); },
    ua: navigator.userAgent
  });
  var syncWarned = {};

  function gardenText() { save(); return SIM.serialize(state); }

  // Забрать сад из облака и показать его на этом устройстве.
  function applyRemote(remote) {
    var s = SIM.deserialize(remote.game);
    if (!s) { toast('Сад в облаке сохранён более новой версией игры. Откройте игру с интернетом, чтобы она обновилась.'); return false; }
    state = s;
    g.x = g.targetX = state.gardenerX || 640; g.action = null; g.onArrive = null; g.after = null;
    ui.target = null; ui.mode = 'normal'; hideCard(); hideBanner();
    parts.length = 0;
    cam.x = Math.min(camLimits()[1], Math.max(camLimits()[0], g.x - view.viewW / 2));
    if (state.introSeen && ui.intro) { ui.intro = false; $('intro').classList.add('hidden'); }
    save();
    sync.adopt(remote);
    lastHud = ''; renderHud();
    return true;
  }

  // reason: start | resume | pause | periodic | connect | check
  function runSync(reason, keepalive) {
    if (!sync.connected || params.has('fresh')) return Promise.resolve({ result: 'off' });
    var text = gardenText();
    var hold = reason === 'start' || reason === 'resume';
    var timedOut = false, timer = null;
    if (hold) {
      ui.syncing = true; showPill('Сверяю сад с облаком…');
      // Без связи долго не ждём: играем здесь, сад отправится позже.
      timer = setTimeout(function () { timedOut = true; ui.syncing = false; hidePill(); }, 6000);
    }
    renderSyncBox();
    return sync.sync(text, state.time < 120, keepalive).then(function (r) {
      if (timer) clearTimeout(timer);
      if (hold && !timedOut) { ui.syncing = false; hidePill(); }
      var unchanged = SIM.serialize(state) === text;
      if (r.result === 'pull') {
        if (unchanged && applyRemote(r.remote)) toast('Сад загружен с устройства «' + (r.remote.device || '?') + '».');
      } else if (r.result === 'conflict') {
        if (unchanged || !ui.conflict) showConflict(r.remote);
      } else if (r.result === 'badkey' || r.result === 'forbidden') {
        if (!syncWarned[r.result]) {
          syncWarned[r.result] = true;
          toast(r.result === 'badkey' ? 'Ключ GitHub больше не подходит. Сад сохраняется только здесь — подключите новый ключ в меню паузы.'
                                      : 'GitHub не дал доступ к сохранению. Проверьте ключ в меню паузы.');
        }
      } else if (r.result === 'pushed' && reason === 'connect') {
        toast('Готово: сад этого устройства теперь в облаке.');
      }
      if (reason === 'connect' && r.result === 'same') toast('Готово: синхронизация включена.');
      renderSyncBox();
      return r;
    });
  }

  function showPill(text) { $('sync-pill').textContent = text; $('sync-pill').classList.remove('hidden'); }
  function hidePill() { $('sync-pill').classList.add('hidden'); }

  function fmtWhen(ms) {
    if (!ms) return '—';
    var d = new Date(ms), now = new Date();
    var hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return 'сегодня в ' + hm;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) + ' в ' + hm;
  }
  function fmtGardenTime(sec) {
    var m = Math.floor(sec / 60), h = Math.floor(m / 60);
    return h ? h + ' ч ' + (m % 60) + ' мин' : m + ' мин';
  }
  function gardenSummary(s) {
    var alive = s.pots.filter(function (p) { return p.plant && !p.plant.dead; }).length;
    var seeds = Object.keys(s.seeds).reduce(function (a, k) { return a + (s.seeds[k] || 0); }, 0);
    var adults = s.pots.filter(function (p) { return p.plant && !p.plant.dead && p.plant.growth >= 1; }).length;
    return 'Время в саду: ' + fmtGardenTime(s.time) + '<br>Растений: ' + alive + ' (взрослых: ' + adults + ')<br>Семян в архиве: ' + seeds;
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------- Выбор, когда сад менялся в двух местах ----------
  function showConflict(remote) {
    var other = SIM.deserialize(remote.game);
    if (!other) { toast('Сад в облаке сохранён более новой версией игры. Откройте игру с интернетом, чтобы она обновилась.'); return; }
    save();
    ui.conflict = remote;
    $('conflict-remote').innerHTML = '<b>С устройства «' + esc(remote.device || '?') + '»</b><br><small>сохранён ' + fmtWhen(remote.savedAt) + '</small><p>' + gardenSummary(other) + '</p>';
    $('conflict-local').innerHTML = '<b>На этом устройстве' + (sync.device ? ' («' + esc(sync.device) + '»)' : '') + '</b><br><small>сейчас</small><p>' + gardenSummary(state) + '</p>';
    $('conflict').classList.remove('hidden');
  }
  function closeConflict() { ui.conflict = null; $('conflict').classList.add('hidden'); renderSyncBox(); }
  $('conflict-take').addEventListener('click', function () {
    var remote = ui.conflict; if (!remote) return;
    if (applyRemote(remote)) toast('Сад загружен с устройства «' + (remote.device || '?') + '».');
    closeConflict();
  });
  $('conflict-keep').addEventListener('click', function () {
    var remote = ui.conflict; if (!remote) return;
    var btn = $('conflict-keep'); btn.disabled = true; btn.textContent = 'Отправляю…';
    sync.keepLocal(gardenText(), remote).then(function (r) {
      btn.disabled = false; btn.textContent = 'Оставить сад этого устройства';
      if (r.result === 'pushed') { toast('Сад этого устройства сохранён в облаке.'); closeConflict(); }
      else toast('Не получилось связаться с облаком. Попробуйте ещё раз чуть позже.');
    });
  });

  // ---------- Блок синхронизации в меню паузы ----------
  function syncStatusText() {
    var st = sync.status;
    switch (st.kind) {
      case 'ok': return 'Сад в облаке. Последняя сверка: ' + fmtWhen(st.at) + '.';
      case 'busy': return 'Сверяю сад с облаком…';
      case 'offline': return 'Нет связи с облаком. Играйте спокойно — сад отправится, когда появится интернет.' + (st.at ? ' Последняя сверка: ' + fmtWhen(st.at) + '.' : '');
      case 'badkey': return 'Ключ GitHub не подходит или его срок истёк. Сад сохраняется только на этом устройстве.';
      case 'forbidden': return 'GitHub не дал доступ. При создании ключа должна стоять галочка «gist».';
      case 'error': return 'GitHub ответил с ошибкой. Попробуем ещё раз позже.' + (st.at ? ' Последняя сверка: ' + fmtWhen(st.at) + '.' : '');
      default: return 'Ещё не сверялся с облаком.';
    }
  }
  function renderSyncBox() {
    var box = $('sync-box'); if (!box) return;
    var html = '<h2>Сад на всех устройствах</h2>';
    var needKey = sync.connected && (sync.status.kind === 'badkey' || sync.status.kind === 'forbidden');
    if (ui.syncForm) {
      var dev = sync.device || SYNC.guessDevice(navigator.userAgent);
      html += '<ol class="steps">' +
        '<li><a href="' + SYNC.tokenUrl(dev) + '" target="_blank" rel="noopener">Открыть страницу ключа на GitHub</a>. В поле <b>Expiration</b> выберите <b>No expiration</b>, галочку <b>gist</b> не снимайте. Внизу нажмите <b>Generate token</b> и скопируйте ключ (он начинается с <b>ghp_</b>).</li>' +
        '<li>Вставьте ключ сюда:<input id="sync-token" type="text" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="ghp_…"></li>' +
        '<li>Название устройства:<input id="sync-device" type="text" autocomplete="off" value="' + esc(dev) + '"></li>' +
        '</ol><p id="sync-error" class="small warn"></p>' +
        '<button data-act="connect" class="primary">Подключить</button>' +
        '<button data-act="cancel" class="quiet">Отмена</button>';
    } else if (!sync.connected) {
      html += '<p class="small">Можно играть в один и тот же сад на телефоне и компьютере. Для этого подключите свой GitHub — один раз на каждом устройстве.</p>' +
        '<button data-act="open" class="soft">Подключить</button>';
    } else {
      html += '<p class="small">Это устройство: «' + esc(sync.device) + '». ' + syncStatusText() + '</p>';
      if (needKey) html += '<button data-act="open" class="soft">Ввести новый ключ</button>';
      else html += '<button data-act="check" class="soft"' + (sync.busy ? ' disabled' : '') + '>Сверить сейчас</button>';
      html += '<button data-act="unlink" class="quiet">' + (ui.confirmUnlink ? 'Точно отключить? Нажмите ещё раз' : 'Отключить на этом устройстве') + '</button>';
    }
    // Не перерисовываем форму, пока игрок в ней печатает.
    if (ui.syncForm && box.querySelector('#sync-token')) return;
    box.innerHTML = html;
  }
  $('sync-box').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'open') { ui.syncForm = true; renderSyncBox(); }
    else if (act === 'cancel') { ui.syncForm = false; $('sync-box').innerHTML = ''; renderSyncBox(); }
    else if (act === 'check') { runSync('check'); }
    else if (act === 'unlink') {
      if (!ui.confirmUnlink) { ui.confirmUnlink = true; renderSyncBox(); return; }
      ui.confirmUnlink = false; sync.disconnect(); renderSyncBox();
      toast('Синхронизация отключена. Сад остаётся на этом устройстве.');
    } else if (act === 'connect') {
      var token = $('sync-token').value.replace(/\s+/g, '');
      var device = $('sync-device').value;
      if (token.length < 20) { $('sync-error').textContent = 'Похоже, ключ вставлен не целиком. Скопируйте его ещё раз.'; return; }
      sync.connect(token, device);
      ui.syncForm = false; $('sync-box').innerHTML = ''; syncWarned = {};
      runSync('connect');
    }
  });

  // ---------- Главный цикл ----------
  var last = performance.now(), saveTimer = 0, cardTimer = 0, syncTimer = 0;
  function frame(now) {
    var dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); // большие паузы не догоняются
    last = now;
    if (!ui.paused && !ui.intro && !ui.syncing && !ui.conflict) {
      tAnim += dt;
      var events = SIM.step(state, dt * SPEED);
      events.forEach(function (e) { toast(eventText(e)); });
      updateGardener(dt);
      updateParticles(dt);
      saveTimer += dt;
      if (saveTimer > 5) { saveTimer = 0; save(); }
      syncTimer += dt;
      if (syncTimer > 60) { syncTimer = 0; runSync('periodic'); }
    } else if (ui.intro) {
      tAnim += dt * 0.5;
    }
    updateCamera(dt, now);
    D.render(ctx, view, state, g, ui, parts, tAnim);
    updateToasts(dt);
    cardTimer += dt;
    if (cardTimer > 0.4) { cardTimer = 0; renderCard(false); renderHud(); }
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', layout);
  layout();
  cam.x = Math.min(camLimits()[1], Math.max(camLimits()[0], g.x - view.viewW / 2));
  renderHud();
  $('pause-btn').innerHTML = icon('pause');
  requestAnimationFrame(frame);
  runSync('start');

  // Для автоматических проверок
  window.LG_DEBUG = { get state() { return state; }, ui: ui, gardener: g, view: view, tap: tap, save: save, setPaused: setPaused, get sync() { return sync; }, runSync: runSync };

  // Офлайн-режим: работает, когда игра открыта по адресу http(s), а не как файл.
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0 && !params.has('nosw')) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* офлайн просто не включится */ });
  }
})();
