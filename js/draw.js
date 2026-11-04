/*
 * Вся графика рисуется кодом на Canvas: комната, космос, растения, садовник.
 * Мир имеет размер 1280×720 «точек», камера масштабирует его под экран.
 */
(function (root) {
  var B = root.LG_BALANCE, SIM = root.LG_SIM;
  var SLOTS = B.SLOTS;
  var W = 1280, H = 720;
  var FLOOR = 610, BENCH_H = 30, POT_H = 56;
  var SOIL_Y = FLOOR - BENCH_H - POT_H + 8;
  var ROOM = { x0: 60, y0: 74, x1: 1220, y1: FLOOR };
  var WIN = { x: 235, y: 250, r: 100 };
  var LAMP_X = 615;
  var ARCHIVE = { x: 1110, y: FLOOR - 250, w: 92, h: 250 };
  var TANK = { x: 425, y: FLOOR - 150, w: 58, h: 150 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mix(a, b, t) {
    t = clamp(t, 0, 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function rgb(c, a) {
    return a === undefined ? 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'
      : 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
  }
  function shade(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
  function rand(seed) { var x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  // ---------- Космос вокруг станции (в экранных координатах) ----------
  var STARS = [];
  for (var i = 0; i < 260; i++) STARS.push({ x: rand(i), y: rand(i + 500), r: 0.4 + rand(i + 900) * 1.3, p: rand(i + 77) * 6.28 });

  function drawSpace(ctx, cw, ch, t) {
    var g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, '#0a0f1c'); g.addColorStop(1, '#121a2c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    for (var i = 0; i < STARS.length; i++) {
      var s = STARS[i];
      var a = 0.35 + 0.35 * Math.sin(t * 0.6 + s.p);
      ctx.fillStyle = 'rgba(210,220,255,' + a.toFixed(2) + ')';
      ctx.fillRect(s.x * cw, s.y * ch, s.r, s.r);
    }
  }

  // ---------- Иллюминатор с планетой ----------
  function drawWindow(ctx, t, day) {
    ctx.save();
    ctx.beginPath(); ctx.arc(WIN.x, WIN.y, WIN.r, 0, Math.PI * 2); ctx.clip();
    var g = ctx.createLinearGradient(0, WIN.y - WIN.r, 0, WIN.y + WIN.r);
    g.addColorStop(0, rgb(mix([6, 10, 22], [26, 36, 62], day))); g.addColorStop(1, rgb(mix([10, 14, 28], [40, 50, 78], day)));
    ctx.fillStyle = g; ctx.fillRect(WIN.x - WIN.r, WIN.y - WIN.r, WIN.r * 2, WIN.r * 2);
    for (var i = 0; i < 40; i++) {
      ctx.fillStyle = 'rgba(220,225,255,' + (0.25 + 0.5 * rand(i + 40) * (1 - day * 0.6)).toFixed(2) + ')';
      ctx.fillRect(WIN.x - WIN.r + rand(i + 3) * WIN.r * 2, WIN.y - WIN.r + rand(i + 9) * WIN.r * 1.3, 1.2, 1.2);
    }
    // Солнце: видно днём, уходит за край планеты к ночи
    var phase = (t % B.BALANCE.dayLength) / B.BALANCE.dayLength;
    var sunY = WIN.y - 40 + (1 - day) * 120;
    var sunX = WIN.x + 55 - Math.sin(phase * 6.283) * 20;
    if (day > 0.02) {
      var sg = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, 70);
      sg.addColorStop(0, 'rgba(255,240,205,' + day + ')'); sg.addColorStop(0.15, 'rgba(255,220,170,' + (0.6 * day) + ')');
      sg.addColorStop(1, 'rgba(255,200,150,0)');
      ctx.fillStyle = sg; ctx.fillRect(WIN.x - WIN.r, WIN.y - WIN.r, WIN.r * 2, WIN.r * 2);
    }
    // Планета: пыльная, без огней. Полосы медленно плывут.
    var px = WIN.x - 30, py = WIN.y + 250, pr = 230;
    ctx.save();
    ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.clip();
    var pg = ctx.createRadialGradient(px + 60, py - 200, 20, px, py, pr);
    pg.addColorStop(0, rgb(mix([40, 38, 44], [176, 156, 128], day)));
    pg.addColorStop(1, rgb(mix([14, 14, 20], [92, 80, 72], day)));
    ctx.fillStyle = pg; ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    for (var b = 0; b < 7; b++) {
      var off = ((t * 3 + b * 97) % 520) - 260;
      ctx.fillStyle = rgb(mix([24, 22, 28], [140, 118, 98], day), 0.45);
      ctx.beginPath();
      ctx.ellipse(px + off, py - pr + 26 + b * 13, 70 + rand(b) * 60, 4 + rand(b + 3) * 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Тонкая дымка атмосферы
    ctx.strokeStyle = 'rgba(150,180,220,' + (0.25 + 0.25 * day) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py, pr + 2, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.restore();
    // Рама
    ctx.lineWidth = 18; ctx.strokeStyle = '#4b5668';
    ctx.beginPath(); ctx.arc(WIN.x, WIN.y, WIN.r + 9, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = '#6c7a8e';
    ctx.beginPath(); ctx.arc(WIN.x, WIN.y, WIN.r + 1, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#7b889b';
    for (var k = 0; k < 12; k++) {
      var a = k / 12 * Math.PI * 2;
      ctx.beginPath(); ctx.arc(WIN.x + Math.cos(a) * (WIN.r + 9), WIN.y + Math.sin(a) * (WIN.r + 9), 2.5, 0, 6.3); ctx.fill();
    }
    // Блик на стекле
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(WIN.x, WIN.y, WIN.r - 22, Math.PI * 1.15, Math.PI * 1.45); ctx.stroke();
  }

  // ---------- Комната ----------
  function drawRoom(ctx, t, day) {
    // Корпус станции — «кукольный дом» в разрезе
    roundRect(ctx, ROOM.x0 - 26, ROOM.y0 - 30, ROOM.x1 - ROOM.x0 + 52, FLOOR - ROOM.y0 + 92, 34);
    ctx.fillStyle = '#2a3242'; ctx.fill();
    ctx.strokeStyle = '#3d4759'; ctx.lineWidth = 3; ctx.stroke();
    // антенна и огонёк на крыше
    ctx.strokeStyle = '#3d4759'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(980, ROOM.y0 - 30); ctx.lineTo(980, ROOM.y0 - 70); ctx.stroke();
    ctx.fillStyle = 'rgba(255,150,120,' + (0.4 + 0.4 * Math.sin(t * 1.3)) + ')';
    ctx.beginPath(); ctx.arc(980, ROOM.y0 - 72, 4, 0, 6.3); ctx.fill();

    // Задняя стена
    var g = ctx.createLinearGradient(0, ROOM.y0, 0, FLOOR);
    g.addColorStop(0, '#53627a'); g.addColorStop(1, '#3f4b5f');
    ctx.fillStyle = g; ctx.fillRect(ROOM.x0, ROOM.y0, ROOM.x1 - ROOM.x0, FLOOR - ROOM.y0);
    // панели
    ctx.strokeStyle = 'rgba(25,32,45,0.35)'; ctx.lineWidth = 2;
    for (var x = ROOM.x0 + 145; x < ROOM.x1; x += 145) {
      ctx.beginPath(); ctx.moveTo(x, ROOM.y0 + 40); ctx.lineTo(x, FLOOR - 60); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(ROOM.x0, FLOOR - 60); ctx.lineTo(ROOM.x1, FLOOR - 60); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(ROOM.x0, FLOOR - 60, ROOM.x1 - ROOM.x0, 3);
    // заклёпки
    ctx.fillStyle = 'rgba(20,26,38,0.4)';
    for (x = ROOM.x0 + 20; x < ROOM.x1; x += 48) { ctx.fillRect(x, FLOOR - 52, 3, 3); ctx.fillRect(x, ROOM.y0 + 44, 3, 3); }
    // труба под потолком
    ctx.fillStyle = '#66738a'; ctx.fillRect(ROOM.x0, ROOM.y0 + 8, ROOM.x1 - ROOM.x0, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(ROOM.x0, ROOM.y0 + 10, ROOM.x1 - ROOM.x0, 3);
    ctx.fillStyle = '#4c586c';
    for (x = ROOM.x0 + 90; x < ROOM.x1; x += 210) ctx.fillRect(x, ROOM.y0 + 4, 12, 24);
    // кабель с провисом
    ctx.strokeStyle = '#2f3848'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(ROOM.x0 + 380, ROOM.y0 + 26);
    ctx.quadraticCurveTo(ROOM.x0 + 470, ROOM.y0 + 70, LAMP_X, ROOM.y0 + 26); ctx.stroke();
    // вентиляционная решётка
    ctx.fillStyle = '#39445a'; roundRect(ctx, 760, 130, 90, 54, 6); ctx.fill();
    ctx.strokeStyle = '#2a3346'; ctx.lineWidth = 3;
    for (var v = 0; v < 5; v++) { ctx.beginPath(); ctx.moveTo(768, 140 + v * 9); ctx.lineTo(842, 140 + v * 9); ctx.stroke(); }
    // полочка с инструментами
    ctx.fillStyle = '#6d5a48'; ctx.fillRect(880, 250, 150, 8);
    ctx.fillStyle = '#596479'; roundRect(ctx, 892, 222, 22, 28, 4); ctx.fill();
    ctx.fillStyle = '#8a6e52'; roundRect(ctx, 922, 230, 30, 20, 3); ctx.fill();
    ctx.fillStyle = '#7d8a6a'; roundRect(ctx, 960, 214, 16, 36, 7); ctx.fill();
    ctx.strokeStyle = '#a0a8b4'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(990, 250); ctx.lineTo(1006, 216); ctx.stroke();
    // маленькая рамка с фотографией прошлого мира
    ctx.fillStyle = '#7a6550'; ctx.fillRect(452, 175, 44, 34);
    var fg = ctx.createLinearGradient(0, 179, 0, 205);
    fg.addColorStop(0, '#9fb4c8'); fg.addColorStop(0.6, '#b9c4a6'); fg.addColorStop(1, '#7f9a6c');
    ctx.fillStyle = fg; ctx.fillRect(456, 179, 36, 26);

    // бак с водой
    ctx.fillStyle = '#5e6f86'; roundRect(ctx, TANK.x, TANK.y, TANK.w, TANK.h, 12); ctx.fill();
    ctx.fillStyle = 'rgba(120,170,210,0.55)'; roundRect(ctx, TANK.x + 18, TANK.y + 24, 12, TANK.h - 50, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(TANK.x + 6, TANK.y + 10, 4, TANK.h - 24);
    ctx.fillStyle = '#4a5568'; ctx.fillRect(TANK.x + TANK.w - 4, TANK.y + TANK.h - 40, 16, 8);
    // лейка у бака
    drawCan(ctx, TANK.x + 82, FLOOR - 4, 0, 1);

    // архив семян
    var A = ARCHIVE;
    ctx.fillStyle = '#4a4f5c'; roundRect(ctx, A.x, A.y, A.w, A.h, 8); ctx.fill();
    ctx.fillStyle = '#5b6170'; roundRect(ctx, A.x + 6, A.y + 6, A.w - 12, A.h - 12, 6); ctx.fill();
    for (var r = 0; r < 5; r++) {
      for (var c = 0; c < 2; c++) {
        var dx = A.x + 12 + c * 36, dy = A.y + 18 + r * 44;
        ctx.fillStyle = '#6b7282'; roundRect(ctx, dx, dy, 32, 36, 4); ctx.fill();
        ctx.fillStyle = '#b8a27c'; ctx.fillRect(dx + 11, dy + 15, 10, 4);
      }
    }
    var glow = 0.5 + 0.2 * Math.sin(t * 0.8);
    ctx.fillStyle = 'rgba(150,230,170,' + glow + ')';
    ctx.beginPath(); ctx.arc(A.x + A.w / 2, A.y - 1 + 10, 3, 0, 6.3); ctx.fill();

    // пол
    ctx.fillStyle = '#323b4b'; ctx.fillRect(ROOM.x0, FLOOR, ROOM.x1 - ROOM.x0, 36);
    ctx.fillStyle = '#414c5f'; ctx.fillRect(ROOM.x0, FLOOR, ROOM.x1 - ROOM.x0, 5);
    ctx.strokeStyle = 'rgba(15,20,30,0.45)'; ctx.lineWidth = 2;
    for (x = ROOM.x0 + 60; x < ROOM.x1; x += 60) { ctx.beginPath(); ctx.moveTo(x, FLOOR + 6); ctx.lineTo(x, FLOOR + 36); ctx.stroke(); }

    // лампа над центром
    ctx.strokeStyle = '#2f3848'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(LAMP_X, ROOM.y0 + 24); ctx.lineTo(LAMP_X, 200); ctx.stroke();
    ctx.fillStyle = '#6a5a4a';
    ctx.beginPath(); ctx.moveTo(LAMP_X - 34, 228); ctx.lineTo(LAMP_X - 14, 200); ctx.lineTo(LAMP_X + 14, 200); ctx.lineTo(LAMP_X + 34, 228); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffe2a8'; ctx.beginPath(); ctx.ellipse(LAMP_X, 229, 22, 5, 0, 0, 6.3); ctx.fill();
    // холодная полоска света в углу
    ctx.fillStyle = 'rgba(170,200,230,0.55)'; ctx.fillRect(900, ROOM.y0 + 30, 120, 4);
  }

  function drawBenches(ctx) {
    for (var i = 0; i < SLOTS.length; i++) {
      var x = SLOTS[i].x;
      ctx.fillStyle = '#4d5567'; roundRect(ctx, x - 58, FLOOR - BENCH_H, 116, BENCH_H, 4); ctx.fill();
      ctx.fillStyle = '#5d6679'; ctx.fillRect(x - 58, FLOOR - BENCH_H, 116, 5);
      ctx.fillStyle = '#3a4152'; ctx.fillRect(x - 50, FLOOR - 8, 10, 8); ctx.fillRect(x + 40, FLOOR - 8, 10, 8);
    }
  }

  // ---------- Горшок и почва ----------
  function drawPot(ctx, x, moisture, selected, t) {
    var top = FLOOR - BENCH_H - POT_H, bot = FLOOR - BENCH_H;
    if (selected) {
      ctx.fillStyle = 'rgba(255,224,160,' + (0.22 + 0.08 * Math.sin(t * 3)) + ')';
      ctx.beginPath(); ctx.ellipse(x, bot + 4, 70, 12, 0, 0, 6.3); ctx.fill();
    }
    ctx.fillStyle = '#7b8aa0';
    ctx.beginPath(); ctx.moveTo(x - 44, top + 8); ctx.lineTo(x + 44, top + 8); ctx.lineTo(x + 34, bot); ctx.lineTo(x - 34, bot); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath(); ctx.moveTo(x - 36, top + 12); ctx.lineTo(x - 26, top + 12); ctx.lineTo(x - 20, bot - 4); ctx.lineTo(x - 28, bot - 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath(); ctx.moveTo(x + 18, top + 12); ctx.lineTo(x + 42, top + 12); ctx.lineTo(x + 33, bot); ctx.lineTo(x + 14, bot); ctx.closePath(); ctx.fill();
    // ободок
    ctx.fillStyle = '#b08a64'; roundRect(ctx, x - 48, top, 96, 12, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,230,190,0.25)'; ctx.fillRect(x - 44, top + 2, 88, 2);
    // почва: сухая — светлая и в трещинах, сырая — тёмная с блеском
    var dry = [150, 128, 104], wet = [58, 42, 34];
    var c = mix(dry, wet, clamp(moisture * 1.25, 0, 1));
    ctx.fillStyle = rgb(c);
    ctx.beginPath(); ctx.ellipse(x, top + 7, 42, 6, 0, 0, 6.3); ctx.fill();
    if (moisture < 0.15) {
      ctx.strokeStyle = 'rgba(80,62,48,0.8)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - 26, top + 6); ctx.lineTo(x - 14, top + 9); ctx.lineTo(x - 4, top + 5);
      ctx.moveTo(x + 8, top + 8); ctx.lineTo(x + 20, top + 5); ctx.lineTo(x + 30, top + 8); ctx.stroke();
    }
    if (moisture > 0.82) {
      ctx.fillStyle = 'rgba(170,200,230,0.45)';
      ctx.beginPath(); ctx.ellipse(x + 14, top + 6, 14, 2.2, 0, 0, 6.3); ctx.fill();
    }
    return top + 7;
  }

  // ---------- Растения ----------
  var YELLOW = [196, 178, 92], BROWN = [128, 96, 62], PALE = [176, 190, 138], DRY = [112, 88, 62];

  function plantLook(p) {
    var sp = B.SPECIES[p.species];
    var v = p.health / 100;
    var c = sp.color.slice();
    c = mix(c, [c[0] * (0.92 + p.variant * 0.16), c[1] * (0.95 + p.variant * 0.1), c[2]], 1);
    c = mix(c, PALE, p.marks.pale * 0.7);
    if (v < 0.75) c = mix(c, YELLOW, (0.75 - v) / 0.6);
    if (v < 0.3) c = mix(c, BROWN, (0.3 - v) / 0.3);
    c = mix(c, [150, 140, 80], p.marks.rot * 0.35);
    if (p.dead) c = DRY;
    var droop = clamp(p.issues.dry * 0.9 + p.marks.thirst * 0.4 + (1 - v) * 0.7 + p.marks.rot * 0.3, 0, 1);
    if (p.dead) droop = 1;
    return { c: c, droop: droop, scorch: p.dead ? 0 : p.marks.scorch };
  }

  function leaf(ctx, len, wid, col, scorch) {
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.45, -wid, len, 0);
    ctx.quadraticCurveTo(len * 0.45, wid, 0, 0);
    ctx.fillStyle = rgb(col); ctx.fill();
    if (scorch > 0.08) {
      ctx.save(); ctx.clip();
      ctx.fillStyle = rgb(BROWN, Math.min(0.9, scorch + 0.2));
      ctx.fillRect(len * (1 - 0.15 - scorch * 0.35), -wid, len, wid * 2);
      ctx.restore();
    }
    ctx.strokeStyle = rgb(shade(col, 0.72)); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(len * 0.82, 0); ctx.stroke();
    // светлая сторона листа
    ctx.fillStyle = 'rgba(255,255,230,0.10)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.45, -wid, len, 0); ctx.quadraticCurveTo(len * 0.45, -wid * 0.3, 0, 0); ctx.fill();
  }

  function sprout(ctx, p, look, sway) {
    var h = 4 + p.growth * 160;
    if (p.growth < 0.02) {
      ctx.fillStyle = 'rgba(70,52,40,0.9)';
      ctx.beginPath(); ctx.ellipse(0, -1, 9, 3, 0, 0, 6.3); ctx.fill();
      return;
    }
    ctx.strokeStyle = rgb(shade(look.c, 0.85)); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(sway * 2, -h / 2, sway * 3, -h); ctx.stroke();
    ctx.save(); ctx.translate(sway * 3, -h);
    ctx.save(); ctx.rotate(-0.5 + look.droop); leaf(ctx, 6 + h * 0.5, 3 + h * 0.15, look.c, 0); ctx.restore();
    ctx.save(); ctx.scale(-1, 1); ctx.rotate(-0.5 + look.droop); leaf(ctx, 6 + h * 0.5, 3 + h * 0.15, look.c, 0); ctx.restore();
    ctx.restore();
  }

  function bez(t, p0, p1, p2) { var u = 1 - t; return u * u * p0 + 2 * u * t * p1 + t * t * p2; }

  function drawSun(ctx, p, look, sway, t) {
    var s = 0.12 + 0.88 * p.growth;
    var leggy = 1 + p.marks.pale * 0.35;
    var Hh = (30 + 230 * s) * leggy;
    var nLeaves = Math.max(1, Math.round(1 + 7 * s));
    if (p.dead) nLeaves = Math.ceil(nLeaves / 2);
    var tipX = sway * Hh * 0.06 + (p.dead ? 30 : look.droop * 16);
    var tipY = -Hh * (p.dead ? 0.6 : 1 - look.droop * 0.08);
    var cx = 0, cy = -Hh * 0.55;
    ctx.strokeStyle = rgb(shade(look.c, 0.78)); ctx.lineWidth = 2.5 + 4 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(cx, cy, tipX, tipY); ctx.stroke();
    for (var k = 0; k < nLeaves; k++) {
      var f = (k + 1) / (nLeaves + 1.2);
      var lx = bez(f, 0, cx, tipX), ly = bez(f, 0, cy, tipY);
      var side = k % 2 ? 1 : -1;
      var size = (18 + 34 * s) * (1 - 0.35 * f);
      var leafSway = Math.sin(t * 1.1 + k + p.variant * 6) * 0.06;
      ctx.save(); ctx.translate(lx, ly); ctx.scale(side, 1);
      ctx.rotate(-0.55 + look.droop * 1.25 + leafSway + sway * 0.08 * side);
      leaf(ctx, size, size * 0.42, mix(look.c, shade(look.c, 0.85), f), look.scorch);
      ctx.restore();
    }
    // Цветок смотрит в сторону иллюминатора
    if (p.growth >= 1 && !p.dead) {
      ctx.save(); ctx.translate(tipX, tipY); ctx.rotate(-0.35 + look.droop * 0.9);
      var b = p.bloom, fade = clamp(p.health / 80, 0.4, 1);
      if (p.seedsReady > 0) {
        for (var i = 0; i < 10; i++) {
          ctx.save(); ctx.rotate(i / 10 * 6.283 + 0.3); ctx.translate(0, 14);
          ctx.fillStyle = 'rgba(200,150,80,0.7)'; ctx.beginPath(); ctx.ellipse(0, 6, 4, 9, 0, 0, 6.3); ctx.fill(); ctx.restore();
        }
        ctx.fillStyle = '#5e4630'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#8a6a44';
        for (var d = 0; d < 14; d++) { var a = d * 2.4; var rr = 3 + (d % 5) * 2.4; ctx.fillRect(Math.cos(a) * rr - 1, Math.sin(a) * rr - 1, 2.4, 2.4); }
      } else if (b >= 0.15) {
        var open = clamp((b - 0.15) / 0.2, 0, 1);
        var pc = mix([238, 186, 78], [210, 190, 140], 1 - fade);
        for (var j = 0; j < 12; j++) {
          ctx.save(); ctx.rotate(j / 12 * 6.283 + Math.sin(t * 0.7) * 0.03);
          ctx.fillStyle = rgb(j % 2 ? pc : shade(pc, 0.92));
          ctx.beginPath(); ctx.ellipse(0, -(9 + 9 * open), 5 + 2 * open, 7 + 9 * open, 0, 0, 6.3); ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = '#7a5434'; ctx.beginPath(); ctx.arc(0, 0, 9 + 2 * open, 0, 6.3); ctx.fill();
        ctx.fillStyle = 'rgba(255,220,150,0.25)'; ctx.beginPath(); ctx.arc(-2, -2, 4, 0, 6.3); ctx.fill();
      } else {
        var bs = 5 + 30 * b;
        ctx.fillStyle = rgb(mix(look.c, [190, 180, 90], b * 4));
        ctx.beginPath(); ctx.ellipse(0, -bs * 0.4, bs * 0.55, bs * 0.8, 0, 0, 6.3); ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawFern(ctx, p, look, sway, t) {
    var s = 0.15 + 0.85 * p.growth;
    var n = 3 + Math.round(6 * s);
    if (p.dead) n = Math.max(2, Math.ceil(n / 2));
    var spore = !p.dead && p.growth >= 1 && p.bloom > 0;
    var ripe = p.seedsReady > 0;
    for (var k = 0; k < n; k++) {
      var a0 = -1.15 + 2.3 * (k + 0.5) / n + (rand(p.id * 13 + k) - 0.5) * 0.25;
      var sign = a0 < 0 ? -1 : 1;
      var len = (35 + 125 * s) * (0.72 + 0.28 * Math.cos(a0)) * (0.85 + rand(p.id + k) * 0.3);
      var steps = 12, x = 0, y = 0, dir = a0;
      var pts = [[0, 0]];
      var bend = 0.5 + look.droop * 1.5;
      var segLen = len / steps;
      var fs = Math.sin(t * 0.9 + k * 1.7 + p.variant * 5) * 0.05 + sway * 0.25;
      for (var i = 1; i <= steps; i++) {
        var u = i / steps;
        dir = a0 + sign * u * u * bend + fs * u;
        x += Math.sin(dir) * segLen; y -= Math.cos(dir) * segLen;
        pts.push([x, y, dir]);
      }
      var col = mix(look.c, shade(look.c, 0.8), (k % 3) * 0.2);
      ctx.strokeStyle = rgb(shade(col, 0.7)); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(0, 0);
      for (i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
      for (i = 1; i < pts.length; i++) {
        var u2 = i / steps;
        var lsz = (1 - u2 * 0.75) * (4 + 9 * s);
        if (p.dead && rand(k * 31 + i) > 0.5) continue;
        for (var side = -1; side <= 1; side += 2) {
          ctx.save(); ctx.translate(pts[i][0], pts[i][1]);
          ctx.rotate(pts[i][2] + side * (1.25 - look.droop * 0.35));
          ctx.fillStyle = rgb(col);
          ctx.beginPath(); ctx.ellipse(0, -lsz * 0.55, lsz * 0.32, lsz * 0.6, 0, 0, 6.3); ctx.fill();
          if (look.scorch > 0.12 && u2 > 0.4) {
            ctx.fillStyle = rgb(BROWN, Math.min(0.85, look.scorch)); ctx.beginPath(); ctx.ellipse(0, -lsz * 0.95, lsz * 0.25, lsz * 0.25, 0, 0, 6.3); ctx.fill();
          }
          if (spore && i % 2 === 0 && u2 < 0.85) {
            var pulse = 0.45 + 0.35 * Math.sin(t * 1.6 + i + k);
            ctx.fillStyle = ripe ? 'rgba(240,210,120,' + (0.6 + pulse * 0.4) + ')' : 'rgba(150,240,210,' + (pulse * Math.min(1, p.bloom * 2)) + ')';
            ctx.beginPath(); ctx.arc(0, -lsz * 0.5, 1.6, 0, 6.3); ctx.fill();
          }
          ctx.restore();
        }
      }
      // молодой лист закручен улиткой
      if (!p.dead && k === Math.floor(n / 2) && p.growth < 0.9) {
        var last = pts[pts.length - 1];
        ctx.strokeStyle = rgb(mix(look.c, [150, 190, 110], 0.4)); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(last[0] + 3, last[1], 4, 0, 5); ctx.stroke();
      }
    }
  }

  function drawRosette(ctx, p, look, sway, t) {
    var s = 0.15 + 0.85 * p.growth;
    var n = 5 + Math.round(10 * s);
    if (p.dead) n = Math.ceil(n * 0.6);
    var leaves = [];
    for (var k = 0; k < n; k++) {
      var th = k * 2.39996 + p.variant;
      var inner = 1 - k / n; // поздние листья — внутренние
      leaves.push({ th: th, inner: inner, depth: Math.sin(th), k: k });
    }
    leaves.sort(function (a, b) { return a.depth - b.depth; });
    var fat = 1 - 0.35 * p.marks.thirst;
    for (var i = 0; i < leaves.length; i++) {
      var L = leaves[i];
      var len = (16 + 46 * s) * (0.55 + 0.45 * (1 - L.inner));
      var up = 0.25 + 0.6 * L.inner - look.droop * 0.35;
      var tipx = Math.cos(L.th) * len * (0.95 - 0.5 * L.inner) + sway * 4 * L.inner;
      var tipy = -len * up + Math.sin(L.th) * len * 0.22;
      var ang = Math.atan2(tipy, tipx), dist = Math.sqrt(tipx * tipx + tipy * tipy);
      var col = mix(look.c, [196, 214, 204], L.inner * 0.35);
      col = shade(col, 0.82 + 0.18 * (L.depth + 1) / 2);
      if (p.marks.rot > 0.15 && L.inner < 0.35) col = mix(col, [120, 110, 60], p.marks.rot);
      ctx.save(); ctx.translate(0, -2); ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(0, 0);
      var w = dist * 0.3 * fat;
      ctx.quadraticCurveTo(dist * 0.4, -w, dist, 0);
      ctx.quadraticCurveTo(dist * 0.4, w, 0, 0);
      ctx.fillStyle = rgb(col); ctx.fill();
      ctx.strokeStyle = 'rgba(230,240,235,0.35)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
    if (!p.dead && p.growth >= 1 && p.bloom > 0) {
      var hb = (40 + 80 * Math.min(1, p.bloom * 3));
      var ex = 26 + sway * 6, ey = -hb;
      ctx.strokeStyle = '#8c9a7e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.quadraticCurveTo(4, -hb * 0.7, ex, ey); ctx.stroke();
      if (p.bloom >= 0.15 || p.seedsReady) {
        for (var j = 0; j < 5; j++) {
          var f = 0.55 + j * 0.1;
          var bx = bez(f, 0, 4, ex), by = bez(f, -10, -hb * 0.7, ey);
          ctx.save(); ctx.translate(bx, by + 5); ctx.rotate(Math.sin(t * 1.2 + j) * 0.12);
          if (p.seedsReady > 0) { ctx.fillStyle = '#8a6b4a'; ctx.beginPath(); ctx.ellipse(0, 4, 3, 5, 0, 0, 6.3); ctx.fill(); }
          else {
            ctx.fillStyle = '#d896a8';
            ctx.beginPath(); ctx.moveTo(-5, 7); ctx.quadraticCurveTo(0, -4, 5, 7); ctx.closePath(); ctx.fill();
          }
          ctx.restore();
        }
      }
    }
  }

  function plantTopY(p) {
    if (!p) return SOIL_Y - 30;
    var s = p.growth;
    if (p.species === 'sun') return SOIL_Y - 30 - 240 * s;
    if (p.species === 'fern') return SOIL_Y - 30 - 130 * s;
    return SOIL_Y - 30 - (p.bloom > 0 ? 110 : 50 * s);
  }

  function drawPlant(ctx, p, x, y, t) {
    var look = plantLook(p);
    var sway = Math.sin(t * 0.8 + p.variant * 10) * (p.dead ? 0.1 : 1) * (0.6 + 0.4 * Math.sin(t * 0.23 + p.id));
    ctx.save(); ctx.translate(x, y);
    if (p.growth < 0.08 && !p.dead) sprout(ctx, p, look, sway);
    else if (p.species === 'sun') drawSun(ctx, p, look, sway, t);
    else if (p.species === 'fern') drawFern(ctx, p, look, sway, t);
    else drawRosette(ctx, p, look, sway, t);
    ctx.restore();
  }

  // ---------- Лейка и садовник ----------
  function drawCan(ctx, x, y, tilt, scale) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.rotate(tilt);
    ctx.fillStyle = '#8fa39b';
    roundRect(ctx, -13, -24, 26, 24, 4); ctx.fill();
    ctx.strokeStyle = '#8fa39b'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(12, -8); ctx.lineTo(28, -24); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -26, 9, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#7a8e86'; ctx.fillRect(25, -28, 7, 6);
    ctx.restore();
  }

  function drawGardener(ctx, g, t) {
    var walking = Math.abs(g.targetX - g.x) > 2;
    var ph = g.phase;
    var crouch = g.action === 'inspect' || g.action === 'plant' || g.action === 'collect' || g.action === 'clear' ? 14 : 0;
    var breathe = Math.sin(t * 1.6) * 1.2;
    ctx.save(); ctx.translate(g.x, FLOOR); ctx.scale(g.facing, 1);
    // тень
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(0, 2, 30, 6, 0, 0, 6.3); ctx.fill();
    var legSwing = walking ? Math.sin(ph) * 0.45 : 0;
    var hipY = -64 + crouch;
    // ноги
    ctx.lineCap = 'round'; ctx.lineWidth = 13;
    [[-1, legSwing], [1, -legSwing]].forEach(function (L, idx) {
      ctx.strokeStyle = idx === 0 ? '#6e6248' : '#7d7052';
      var kx = Math.sin(L[1]) * 30 + (crouch ? 10 : 0), ky = hipY + 32 - crouch * 0.4;
      var fx = Math.sin(L[1]) * 42 + (crouch ? 2 : 0);
      ctx.beginPath(); ctx.moveTo(L[0] * 5, hipY); ctx.lineTo(kx + L[0] * 4, ky); ctx.lineTo(fx + L[0] * 4, -8); ctx.stroke();
      ctx.fillStyle = '#34363e'; roundRect(ctx, fx + L[0] * 4 - 7, -10, 20, 10, 4); ctx.fill();
    });
    // тело
    var bodyTop = -128 + crouch + breathe * 0.3;
    ctx.fillStyle = '#9b6a4f'; roundRect(ctx, -19, bodyTop, 38, 70, 12); ctx.fill(); // рубашка
    ctx.fillStyle = '#8a7a55'; roundRect(ctx, -18, bodyTop + 22, 36, 50, 9); ctx.fill(); // комбинезон
    ctx.fillStyle = '#8a7a55'; ctx.fillRect(-14, bodyTop + 4, 6, 22); ctx.fillRect(8, bodyTop + 4, 6, 22);
    ctx.fillStyle = '#76683f'; roundRect(ctx, -8, bodyTop + 30, 16, 12, 3); ctx.fill(); // карман
    // руки
    var armSwing = walking ? -Math.sin(ph) * 0.5 : 0;
    var shoulderY = bodyTop + 12;
    ctx.strokeStyle = '#9b6a4f'; ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(-10, shoulderY); ctx.lineTo(-10 + Math.sin(-armSwing) * 26, shoulderY + 48); ctx.stroke();
    var handX, handY;
    if (g.action === 'water') { handX = 34; handY = shoulderY + 20; }
    else if (crouch) { handX = 30; handY = shoulderY + 46; }
    else { handX = 10 + Math.sin(armSwing) * 26; handY = shoulderY + 48; }
    ctx.beginPath(); ctx.moveTo(10, shoulderY); ctx.lineTo(handX, handY); ctx.stroke();
    ctx.fillStyle = '#d9b49a';
    ctx.beginPath(); ctx.arc(handX, handY + 2, 5.5, 0, 6.3); ctx.fill();
    if (g.action === 'water') drawCan(ctx, handX + 6, handY + 22, 0.55, 0.9);
    // голова
    var hy = bodyTop - 18 + breathe * 0.2 + (crouch ? 3 : 0);
    ctx.fillStyle = '#d9b49a'; ctx.beginPath(); ctx.arc(2, hy, 16, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#c9c4bc'; // седые волосы
    ctx.beginPath(); ctx.arc(0, hy - 2, 16.5, Math.PI * 0.95, Math.PI * 1.85); ctx.lineTo(-6, hy - 4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(-11, hy + 2, 6, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#d6d2cb'; // борода
    ctx.beginPath(); ctx.moveTo(-4, hy + 4); ctx.quadraticCurveTo(4, hy + 22, 16, hy + 6); ctx.quadraticCurveTo(8, hy + 10, -4, hy + 4); ctx.fill();
    ctx.fillStyle = '#c69c84'; ctx.beginPath(); ctx.arc(17, hy + 1, 3.2, 0, 6.3); ctx.fill(); // нос
    ctx.fillStyle = '#3a3330'; ctx.fillRect(10, hy - 3, 2.5, 2.5); // глаз
    ctx.restore();
  }

  // ---------- Свет и ночь поверх сцены ----------
  function drawLighting(ctx, day, t) {
    // ночью комната темнеет и синеет
    ctx.fillStyle = 'rgba(8,16,40,' + (0.42 * (1 - day)).toFixed(3) + ')';
    ctx.fillRect(ROOM.x0, ROOM.y0, ROOM.x1 - ROOM.x0, FLOOR + 36 - ROOM.y0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // луч из иллюминатора
    if (day > 0.01) {
      var g = ctx.createLinearGradient(WIN.x, WIN.y, WIN.x + 60, FLOOR);
      g.addColorStop(0, 'rgba(255,214,160,' + (0.16 * day).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,200,140,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(WIN.x - 80, WIN.y + 40); ctx.lineTo(WIN.x + 90, WIN.y - 20);
      ctx.lineTo(420, FLOOR); ctx.lineTo(70, FLOOR); ctx.closePath(); ctx.fill();
    }
    // тёплая лампа
    var lg = ctx.createRadialGradient(LAMP_X, 235, 4, LAMP_X, 420, 280);
    lg.addColorStop(0, 'rgba(255,214,150,0.22)'); lg.addColorStop(1, 'rgba(255,200,130,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.moveTo(LAMP_X - 30, 230); ctx.lineTo(LAMP_X + 30, 230); ctx.lineTo(LAMP_X + 200, FLOOR); ctx.lineTo(LAMP_X - 200, FLOOR); ctx.closePath(); ctx.fill();
    var bg = ctx.createRadialGradient(LAMP_X, 230, 0, LAMP_X, 230, 40);
    bg.addColorStop(0, 'rgba(255,230,180,0.5)'); bg.addColorStop(1, 'rgba(255,230,180,0)');
    ctx.fillStyle = bg; ctx.fillRect(LAMP_X - 40, 190, 80, 80);
    // холодная полоска в углу
    var cg = ctx.createRadialGradient(960, ROOM.y0 + 34, 4, 960, ROOM.y0 + 120, 260);
    cg.addColorStop(0, 'rgba(150,180,220,0.10)'); cg.addColorStop(1, 'rgba(150,180,220,0)');
    ctx.fillStyle = cg; ctx.fillRect(700, ROOM.y0 + 34, 520, 520);
    ctx.restore();
  }

  // пылинки в луче света
  var MOTES = [];
  for (var m = 0; m < 26; m++) MOTES.push({ x: 90 + rand(m + 3) * 300, y: 260 + rand(m + 8) * 320, s: rand(m + 12) });
  function drawMotes(ctx, t, day) {
    if (day < 0.05) return;
    for (var i = 0; i < MOTES.length; i++) {
      var o = MOTES[i];
      var y = o.y - ((t * (4 + o.s * 5)) % 120);
      var x = o.x + Math.sin(t * 0.3 + i) * 10;
      ctx.fillStyle = 'rgba(255,236,200,' + (0.35 * day * (0.4 + o.s * 0.6)).toFixed(2) + ')';
      ctx.fillRect(x, y, 1.6, 1.6);
    }
  }

  function drawParticles(ctx, parts) {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var a = clamp(p.life / p.max, 0, 1);
      if (p.kind === 'drop') { ctx.fillStyle = 'rgba(150,200,240,' + (0.8 * a) + ')'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 1.8, 3.2, 0, 0, 6.3); ctx.fill(); }
      else { ctx.fillStyle = 'rgba(255,230,160,' + a + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, 2.2 * a + 0.5, 0, 6.3); ctx.fill(); }
    }
  }

  function render(ctx, view, state, g, ui, parts, t) {
    var day = SIM.daylight(state.time);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    drawSpace(ctx, view.cw, view.ch, t);
    ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * view.ox, view.dpr * view.oy);
    drawRoom(ctx, t, day);
    drawWindow(ctx, state.time, day);
    drawBenches(ctx);
    for (var i = 0; i < SLOTS.length; i++) {
      var pot = state.pots[i];
      var sel = (ui.target && ui.target.kind === 'slot' && ui.target.i === i) ||
        (ui.mode === 'transplant' && i !== ui.from);
      var soilY = drawPot(ctx, SLOTS[i].x, pot.moisture, sel, t);
      if (pot.plant) drawPlant(ctx, pot.plant, SLOTS[i].x, soilY, t);
    }
    if (ui.target && ui.target.kind === 'archive') {
      ctx.strokeStyle = 'rgba(255,224,160,' + (0.35 + 0.15 * Math.sin(t * 3)) + ')'; ctx.lineWidth = 3;
      roundRect(ctx, ARCHIVE.x - 4, ARCHIVE.y - 4, ARCHIVE.w + 8, ARCHIVE.h + 8, 10); ctx.stroke();
    }
    drawGardener(ctx, g, t);
    drawParticles(ctx, parts);
    drawLighting(ctx, day, t);
    drawMotes(ctx, t, day);
  }

  root.LG_DRAW = {
    W: W, H: H, FLOOR: FLOOR, SOIL_Y: SOIL_Y, ROOM: ROOM, ARCHIVE: ARCHIVE, TANK: TANK,
    render: render, plantTopY: plantTopY, drawPlant: drawPlant
  };
})(window);
