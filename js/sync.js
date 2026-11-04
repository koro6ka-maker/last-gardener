/*
 * Синхронизация сада между устройствами через личный GitHub игрока.
 *
 * Сад хранится в одном секретном gist-файле аккаунта игрока. Каждое устройство
 * помнит, какую версию облака оно видело последней (rev и отпечаток), и было ли
 * у него с тех пор что-то новое (локальный сад отличается от отправленного).
 *   - облако не менялось, у нас новое        -> отправляем;
 *   - облако новее, у нас ничего нового       -> забираем;
 *   - новое и там, и тут                      -> спрашиваем игрока, какой сад оставить.
 * Модуль ничего не меняет в игре сам: забрать сад решает game.js (adopt).
 */
(function (root) {
  var FILE = 'last-gardener-save.json';
  var DESC = 'Последний садовник — сохранение сада (не удаляйте)';
  var KEY = 'lastGardener.sync.v1';
  var API = 'https://api.github.com';
  var TIMEOUT = 12000;

  function fingerprint(text) {
    var h = 5381;
    for (var i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + '.' + text.length;
  }

  // Главное правило. remote: {rev, game} или null; info: {syncedRev, syncedPrint}.
  function decide(info, localText, remote, localTrivial) {
    var dirty = fingerprint(localText) !== info.syncedPrint;
    if (!remote) return 'push';
    var remoteChanged = remote.rev !== info.syncedRev || fingerprint(remote.game) !== info.syncedPrint;
    if (!remoteChanged) return dirty ? 'push' : 'same';
    if (fingerprint(remote.game) === fingerprint(localText)) return 'adopt-same';
    if (!dirty || localTrivial) return 'pull';
    return 'conflict';
  }

  function guessDevice(ua) {
    ua = ua || '';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Macintosh/.test(ua)) return 'Mac';
    if (/Android/.test(ua)) return 'Android';
    return 'Компьютер';
  }

  function create(opts) {
    var storage = opts.storage;          // {get(key), set(key, text)}
    var doFetch = opts.fetch;            // window.fetch или подделка в проверках
    var cfg = read();
    var busy = null;
    var status = { kind: cfg.token ? 'idle' : 'off', at: cfg.lastOk || 0 };

    function read() {
      try { var c = JSON.parse(storage.get(KEY) || 'null'); if (c && typeof c === 'object') return c; } catch (e) { }
      return {};
    }
    function write() { try { storage.set(KEY, JSON.stringify(cfg)); } catch (e) { } }

    function api(method, path, body, keepalive) {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT) : null;
      return doFetch(API + path, {
        method: method, cache: 'no-store', keepalive: !!keepalive, signal: ctrl ? ctrl.signal : undefined,
        headers: { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      }).then(function (r) {
        if (timer) clearTimeout(timer);
        if (r.status === 401) throw { kind: 'badkey' };
        if (r.status === 404) return null;
        if (r.status === 403) throw { kind: 'forbidden' };
        if (!r.ok) throw { kind: 'error', code: r.status };
        return r.json();
      }, function () { if (timer) clearTimeout(timer); throw { kind: 'offline' }; });
    }

    function parseGist(g) {
      if (!g || !g.files || !g.files[FILE]) return null;
      try {
        var d = JSON.parse(g.files[FILE].content);
        if (d && typeof d.rev === 'number' && typeof d.game === 'string') return d;
      } catch (e) { }
      return null;
    }

    function findGist() {
      return api('GET', '/gists?per_page=100').then(function (list) {
        if (!list) throw { kind: 'forbidden' };
        for (var i = 0; i < list.length; i++) if (list[i].files && list[i].files[FILE]) return list[i].id;
        return null;
      });
    }

    function fetchRemote() {
      var idP = cfg.gistId ? Promise.resolve(cfg.gistId) : findGist();
      return idP.then(function (id) {
        if (!id) return null;
        cfg.gistId = id; write();
        return api('GET', '/gists/' + id).then(function (g) {
          if (!g) { cfg.gistId = null; write(); return findGist().then(function (id2) {
            if (!id2) return null;
            cfg.gistId = id2; write();
            return api('GET', '/gists/' + id2).then(parseGist);
          }); }
          return parseGist(g);
        });
      });
    }

    function push(localText, baseRev, keepalive) {
      var payload = { format: 1, rev: baseRev + 1, savedAt: Date.now(), device: cfg.device || 'устройство', game: localText };
      var files = {}; files[FILE] = { content: JSON.stringify(payload) };
      var req = cfg.gistId
        ? api('PATCH', '/gists/' + cfg.gistId, { files: files }, keepalive)
        : api('POST', '/gists', { description: DESC, public: false, files: files }, keepalive);
      return req.then(function (g) {
        if (!g) { cfg.gistId = null; write(); throw { kind: 'error', code: 404 }; }
        cfg.gistId = g.id; cfg.syncedRev = payload.rev; cfg.syncedPrint = fingerprint(localText);
        ok(); return { result: 'pushed' };
      });
    }

    function ok() { cfg.lastOk = Date.now(); write(); status = { kind: 'ok', at: cfg.lastOk }; }

    // Сверить сад с облаком. Возвращает {result: same|pushed|pull|conflict|off|offline|badkey|forbidden|error, remote}.
    function sync(localText, localTrivial, keepalive) {
      if (!cfg.token) return Promise.resolve({ result: 'off' });
      if (busy) return busy;
      status = { kind: 'busy', at: status.at };
      busy = fetchRemote().then(function (remote) {
        var d = decide(cfg, localText, remote, localTrivial);
        if (d === 'same') { ok(); return { result: 'same' }; }
        if (d === 'adopt-same') { adopt(remote); return { result: 'same' }; }
        if (d === 'push') return push(localText, Math.max(remote ? remote.rev : 0, cfg.syncedRev || 0), keepalive);
        status = { kind: 'idle', at: status.at };
        return { result: d, remote: remote };
      }).catch(function (e) {
        var kind = (e && e.kind) || 'error';
        status = { kind: kind, at: cfg.lastOk || 0 };
        return { result: kind };
      }).then(function (r) { busy = null; return r; });
      return busy;
    }

    // Игра забрала сад из облака: запоминаем, что теперь он у нас.
    function adopt(remote) {
      cfg.syncedRev = remote.rev; cfg.syncedPrint = fingerprint(remote.game); ok();
    }
    // Игрок решил оставить сад этого устройства: заменяем облачный.
    function keepLocal(localText, remote) {
      return push(localText, Math.max(remote ? remote.rev : 0, cfg.syncedRev || 0)).catch(function (e) {
        status = { kind: (e && e.kind) || 'error', at: cfg.lastOk || 0 };
        return { result: status.kind };
      });
    }

    function connect(token, device) {
      cfg = { token: token.trim(), device: (device || '').trim() || guessDevice(opts.ua), syncedRev: -1, syncedPrint: null };
      write();
      status = { kind: 'idle', at: 0 };
    }
    function disconnect() { cfg = {}; write(); status = { kind: 'off', at: 0 }; }

    return {
      sync: sync, adopt: adopt, keepLocal: keepLocal, connect: connect, disconnect: disconnect,
      get connected() { return !!cfg.token; },
      get device() { return cfg.device || ''; },
      get status() { return status; },
      get busy() { return !!busy; }
    };
  }

  var api = {
    FILE: FILE, KEY: KEY, create: create, decide: decide, fingerprint: fingerprint, guessDevice: guessDevice,
    tokenUrl: function (device) {
      return 'https://github.com/settings/tokens/new?scopes=gist&description=' + encodeURIComponent('Садовник ' + (device || ''));
    }
  };
  root.LG_SYNC = api;
})(typeof window !== 'undefined' ? window : this);
