/*
 * Симуляция сада. Здесь нет графики и нет реального времени:
 * сад меняется только когда игра сама вызывает step(state, dt).
 * Поэтому закрытая игра не «проматывает» пропущенное время.
 */
(function (root) {
  var B = root.LG_BALANCE;
  var C = B.BALANCE, SPECIES = B.SPECIES, SLOTS = B.SLOTS;
  var SAVE_VERSION = 1;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smoothstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  // 1 — день, 0 — ночь. Игра начинается в полдень.
  function daylight(t) {
    var h = Math.cos(2 * Math.PI * (t % C.dayLength) / C.dayLength);
    return smoothstep(-0.6, 0.05, h);
  }
  function slotLight(i, t) {
    var s = SLOTS[i];
    return clamp(s.window * daylight(t) + s.lamp, 0, 1);
  }

  function makePlant(state, species, growth) {
    var id = state.nextId++;
    return {
      id: id, species: species, growth: growth || 0, health: 100,
      lightAvg: null, bloom: 0, seedsReady: 0, dead: false, age: 0, warned: false,
      issues: { dry: 0, wet: 0, burn: 0, dark: 0, total: 0 },
      marks: { scorch: 0, pale: 0, rot: 0, thirst: 0 },
      variant: ((id * 9301 + 49297) % 233280) / 233280
    };
  }

  function newGame() {
    var state = {
      version: SAVE_VERSION, time: 0, nextId: 1,
      seeds: { sun: 1, fern: 1, rosette: 1 },
      rescue: { sun: 0, fern: 0, rosette: 0 },
      pots: SLOTS.map(function () { return { moisture: 0.4, plant: null }; }),
      gardenerX: 640, introSeen: false
    };
    var sun = makePlant(state, 'sun', 0.8); state.pots[0].plant = sun; state.pots[0].moisture = 0.75;
    // Папоротник стоит в слишком светлом месте — первая маленькая загадка.
    var fern = makePlant(state, 'fern', 0.45); state.pots[1].plant = fern; state.pots[1].moisture = 0.75;
    var ros = makePlant(state, 'rosette', 0.3); state.pots[2].plant = ros; state.pots[2].moisture = 0.3;
    state.pots[3].moisture = 0.35; state.pots[4].moisture = 0.2; state.pots[5].moisture = 0.5;
    return state;
  }

  function stageOf(p) {
    if (p.dead) return 'dead';
    if (p.growth < 0.08) return 'seed';
    if (p.growth < 0.3) return 'sprout';
    if (p.growth < 0.65) return 'young';
    if (p.growth < 1) return 'grown';
    if (p.seedsReady > 0) return 'seeds';
    if (p.bloom >= 0.15) return 'bloom';
    if (p.bloom > 0) return 'bud';
    return 'adult';
  }

  function computeIssues(p, sp, m, L) {
    var lo = sp.moisture[0], hi = sp.moisture[1];
    var dry = m < lo ? (lo - m) / lo : 0;
    var wet = (m > hi && hi < 1) ? (m - hi) / (1 - hi) * sp.rot : 0;
    var burn = (L > sp.light[1] && sp.light[1] < 1) ? (L - sp.light[1]) / (1 - sp.light[1]) : 0;
    var dark = p.lightAvg < sp.light[0] ? (sp.light[0] - p.lightAvg) / sp.light[0] * sp.darkWeight : 0;
    return { dry: dry, wet: wet, burn: burn, dark: dark, total: Math.min(1, dry + wet + burn + dark) };
  }

  function stepPlant(state, i, d, events) {
    var pot = state.pots[i], p = pot.plant, sp = SPECIES[p.species];
    var L = slotLight(i, state.time);
    if (p.lightAvg === null) p.lightAvg = L;
    p.lightAvg += (L - p.lightAvg) * Math.min(1, d / C.lightMemory);
    p.age += d;

    var size = 0.3 + 0.7 * p.growth;
    pot.moisture = Math.max(0, pot.moisture - (C.evapBase + C.evapLight * L) * sp.thirst * size * d);

    var is = computeIssues(p, sp, pot.moisture, L);
    p.issues = is;
    var k = Math.min(1, d / C.marksMemory);
    p.marks.scorch += (Math.min(1, is.burn) - p.marks.scorch) * k;
    p.marks.pale += (Math.min(1, is.dark * 2) - p.marks.pale) * k;
    p.marks.rot += (Math.min(1, is.wet) - p.marks.rot) * k;
    p.marks.thirst += (Math.min(1, is.dry) - p.marks.thirst) * k * 3;

    var before = stageOf(p);
    var eff = is.total - C.stressDeadZone;
    if (eff > 0) {
      var rate = eff / (1 - C.stressDeadZone) * C.damagePerSec;
      if (p.health < C.criticalHealth) rate *= C.criticalSlowdown;
      p.health = Math.max(0, p.health - rate * d);
    } else if (is.total < 0.05) {
      p.health = Math.min(100, p.health + C.recoverPerSec * d);
    }

    // Рост: свет ускоряет, стресс и слабость тормозят.
    var lo = sp.light[0];
    var lf = L < lo ? 0.2 + 0.8 * L / Math.max(lo, 0.01) : 1 + sp.lightBoost * (L - lo) / Math.max(1 - lo, 0.01);
    var hf = is.total > 0.5 ? 0 : (p.health < 50 ? p.health / 50 : 1) * (1 - 0.6 * is.total);
    if (p.growth < 1) {
      p.growth = Math.min(1, p.growth + d / sp.growTime * lf * hf);
    } else if (p.seedsReady === 0 && p.health > 55) {
      p.bloom = Math.min(1, p.bloom + d / sp.bloomTime * Math.min(1, lf) * hf);
      if (p.bloom >= 1) {
        p.seedsReady = sp.seedYield;
        events.push({ type: 'seeds', slot: i, species: p.species });
      }
    }
    var after = stageOf(p);
    if (after !== before && (after === 'bloom' || after === 'adult')) {
      events.push({ type: after, slot: i, species: p.species });
    }

    if (p.health < C.warnHealth && !p.warned) {
      p.warned = true;
      events.push({ type: 'warn', slot: i, species: p.species });
    }
    if (p.health > 60) p.warned = false;

    if (p.health <= 0) {
      p.dead = true;
      p.health = 0;
      events.push({ type: 'death', slot: i, species: p.species });
    }
  }

  function stepOnce(state, d, events) {
    state.time += d;
    for (var i = 0; i < state.pots.length; i++) {
      var pot = state.pots[i];
      if (pot.plant && !pot.plant.dead) {
        stepPlant(state, i, d, events);
      } else {
        var L = slotLight(i, state.time);
        pot.moisture = Math.max(0, pot.moisture - (C.evapBase + C.evapLight * L) * C.emptyPotThirst * d);
      }
    }
    // Семенной архив: вид не может исчезнуть навсегда.
    Object.keys(SPECIES).forEach(function (s) {
      var alive = state.pots.some(function (p) { return p.plant && !p.plant.dead && p.plant.species === s; });
      if (state.seeds[s] === 0 && !alive) {
        state.rescue[s] += d;
        if (state.rescue[s] >= C.archiveRescueTime) {
          state.seeds[s] = 1; state.rescue[s] = 0;
          events.push({ type: 'rescue', species: s });
        }
      } else {
        state.rescue[s] = 0;
      }
    });
  }

  // dt — сколько секунд прошло. Большие отрезки дробятся на шаги по 1 секунде.
  function step(state, dt) {
    var events = [];
    var rem = Math.max(0, dt);
    while (rem > 1e-9) {
      var d = Math.min(1, rem);
      stepOnce(state, d, events);
      rem -= d;
    }
    return events;
  }

  // ---------- Действия игрока ----------
  function water(state, i, amount) {
    var pot = state.pots[i];
    pot.moisture = Math.min(1, pot.moisture + amount);
    return true;
  }
  function plantSeed(state, i, species) {
    var pot = state.pots[i];
    if (pot.plant || !(state.seeds[species] > 0)) return false;
    state.seeds[species]--;
    pot.plant = makePlant(state, species, 0);
    return true;
  }
  function transplant(state, from, to) {
    if (from === to) return false;
    var a = state.pots[from], b = state.pots[to];
    if (!a.plant) return false;
    state.pots[from] = b; state.pots[to] = a; // растение переезжает вместе со своей землёй
    [a.plant, b.plant].forEach(function (p) {
      if (p && !p.dead) p.health = Math.max(1, p.health - C.transplantShock);
    });
    return true;
  }
  function collectSeeds(state, i) {
    var p = state.pots[i].plant;
    if (!p || p.dead || p.seedsReady <= 0) return 0;
    var n = p.seedsReady;
    state.seeds[p.species] += n;
    p.seedsReady = 0; p.bloom = 0; // растение снова зацветёт через время
    return n;
  }
  function clearPot(state, i) {
    var p = state.pots[i].plant;
    if (!p || !p.dead) return false;
    state.pots[i].plant = null;
    return true;
  }

  // ---------- Наблюдения ----------
  var STAGE_TEXT = {
    seed: 'семя прорастает', sprout: 'росток', young: 'молодое растение', grown: 'набирает силу',
    adult: 'взрослое', bud: 'готовится цвести', bloom: 'цветёт', seeds: 'семена созрели', dead: 'погибло'
  };
  function stageText(p) {
    var st = stageOf(p);
    if (p.species === 'fern') {
      if (st === 'bud') return 'на листьях появляются точки';
      if (st === 'bloom') return 'спороносит';
      if (st === 'seeds') return 'споры созрели';
    }
    return STAGE_TEXT[st];
  }
  function soilText(m) {
    if (m < 0.12) return 'Земля пересохла и потрескалась.';
    if (m < 0.3) return 'Земля сухая, светлая.';
    if (m < 0.55) return 'Земля чуть влажная.';
    if (m < 0.8) return 'Земля тёмная и влажная.';
    return 'Земля сырая, у края стоит вода.';
  }
  function lookText(p) {
    if (p.dead) return 'Листья высохли и почернели. Растение уже не спасти.';
    var signs = [];
    var h = p.health;
    if (p.issues.dry > 0.15 || p.marks.thirst > 0.3) signs.push('листья поникли');
    if (p.marks.scorch > 0.2) signs.push('кончики листьев побурели');
    if (p.marks.pale > 0.25) signs.push('стебель вытянулся и побледнел');
    if (p.marks.rot > 0.2) signs.push('нижние листья мягкие и желтоватые');
    if (h < 25) signs.push('растение едва держится');
    else if (h < 55 && signs.length === 0) signs.push('листья тусклые');
    if (signs.length === 0) {
      if (p.seedsReady > 0) return 'Созрели ' + SPECIES[p.species].seedWord + ' — их можно собрать.';
      return h > 85 ? 'Выглядит бодрым и здоровым.' : 'Выглядит неплохо.';
    }
    var s = signs.join(', ');
    return s.charAt(0).toUpperCase() + s.slice(1) + '.';
  }
  // Подсказка при осмотре: главная причина и что можно сделать.
  function hintText(state, i) {
    var pot = state.pots[i], p = pot.plant;
    if (!p) return SLOTS[i].place;
    var sp = SPECIES[p.species];
    if (p.dead) return 'Уберите сухие остатки — в горшок можно посадить новое семя. В архиве в углу хранятся запасы.';
    var is = p.issues;
    var list = [
      ['dry', is.dry, 'Ему хочется пить. Полейте — и через некоторое время листья поднимутся.'],
      ['wet', is.wet, 'Корням слишком мокро. Не поливайте, пока земля не просохнет. Сырость и яркий свет вместе сушат быстрее.'],
      ['burn', is.burn, 'Свет здесь для него слишком резкий. Попробуйте пересадить в место потенистее.'],
      ['dark', is.dark, 'Ему не хватает света: растёт медленно и тянется вверх. Нужно место посветлее.']
    ];
    list.sort(function (a, b) { return b[1] - a[1]; });
    if (list[0][1] > 0.04) return list[0][2];
    var dayMax = Math.min(1, SLOTS[i].window + SLOTS[i].lamp);
    if (dayMax > sp.light[1] && daylight(state.time) < 0.5) return 'Края листьев обожжены. Сейчас ночь, но днём свет здесь для него слишком резкий — лучше пересадить в место потенистее.';
    if (p.marks.scorch > 0.2) return 'Ожоги ещё видны, но сейчас свет ему подходит. Следы постепенно пройдут.';
    if (p.marks.rot > 0.2) return 'Земля уже подсохла, корни приходят в себя.';
    if (p.health < 70) return 'Сейчас условия подходят. Растение медленно восстанавливается.';
    if (p.growth >= 1 && p.seedsReady === 0 && p.bloom === 0) return 'Здоровое взрослое растение. Скоро должно зацвести.';
    return 'Здесь ему хорошо. ' + sp.trait;
  }
  function describe(state, i) {
    var pot = state.pots[i], p = pot.plant;
    if (!p) return { title: 'Пустой горшок', stage: '', look: soilText(pot.moisture), hint: SLOTS[i].place };
    return {
      title: SPECIES[p.species].name, stage: stageText(p),
      look: soilText(pot.moisture) + ' ' + lookText(p),
      hint: hintText(state, i)
    };
  }

  // ---------- Сохранение ----------
  function serialize(state) {
    return JSON.stringify(state);
  }
  function deserialize(text) {
    try {
      var s = JSON.parse(text);
      if (!s || s.version !== SAVE_VERSION || !Array.isArray(s.pots) || s.pots.length !== SLOTS.length) return null;
      if (typeof s.time !== 'number' || !s.seeds) return null;
      Object.keys(SPECIES).forEach(function (k) {
        if (typeof s.seeds[k] !== 'number') s.seeds[k] = 0;
        if (!s.rescue) s.rescue = {};
        if (typeof s.rescue[k] !== 'number') s.rescue[k] = 0;
      });
      return s;
    } catch (e) { return null; }
  }

  var api = {
    SAVE_VERSION: SAVE_VERSION, daylight: daylight, slotLight: slotLight, newGame: newGame, step: step,
    stageOf: stageOf, water: water, plantSeed: plantSeed, transplant: transplant,
    collectSeeds: collectSeeds, clearPot: clearPot, describe: describe,
    serialize: serialize, deserialize: deserialize, clamp: clamp, smoothstep: smoothstep
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LG_SIM = api;
})(typeof window !== 'undefined' ? window : this);
