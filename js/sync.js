/* 同步：本機變更 1.5 秒內合併成一次 PUT；輪詢；離線待送 */
(function (root) {
  var W = root.WApp = root.WApp || {};
  function S() { return W.schema; }

  function Sync(store, gh, opts) {
    opts = opts || {};
    this.store = store; this.gh = gh;
    this.who = opts.who || 'E';
    this.pushDelay = opts.pushDelayMs === undefined ? 1500 : opts.pushDelayMs;
    this.pollMs = opts.pollMs || 90000;
    this.isOnline = opts.isOnline || function () { return typeof navigator === 'undefined' || navigator.onLine !== false; };
    this.isVisible = opts.isVisible || function () { return typeof document === 'undefined' || document.visibilityState !== 'hidden'; };
    this.state = { status: 'idle', error: null, code: null };
    this.listeners = [];
    this.pushTimer = null; this.pollTimer = null;
    this.pushing = false; this.pushAgain = false; this.pulling = false;
    this.firstPullDone = false;
    this.unsub = null;
    this.loadError = null;
  }
  var P = Sync.prototype;

  P.onStatus = function (fn) { this.listeners.push(fn); };
  P.set = function (status, err, code) {
    this.state = { status: status, error: err || null, code: code || null };
    var self = this;
    this.listeners.forEach(function (fn) { try { fn(self.getStatus()); } catch (e) { /* ignore */ } });
  };
  P.getStatus = function () {
    return { status: this.state.status, error: this.state.error, code: this.state.code, pending: this.store.pendingCount(), lastSync: this.store.lastSync };
  };

  P.start = function () {
    var self = this;
    this.unsub = this.store.subscribe(function (kind) { if (kind === 'local') self.schedulePush(); });
    this.pollTimer = setInterval(function () { if (self.isVisible()) self.syncNow(true); }, this.pollMs);
    this.syncNow(true);
  };
  P.stop = function () {
    if (this.unsub) this.unsub();
    clearTimeout(this.pushTimer); clearInterval(this.pollTimer);
    this.unsub = null; this.pushTimer = null; this.pollTimer = null;
  };
  P.schedulePush = function () {
    var self = this;
    this.set(this.isOnline() ? 'syncing' : 'offline');
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(function () { self.push(); }, this.pushDelay);
  };

  P.fail = function (e) {
    var code = e && e.code ? e.code : 'unknown';
    if (code === 'network' || !this.isOnline()) this.set('offline', W.GitHubStore.explain('network'), 'network');
    else this.set('error', W.GitHubStore.explain(code, e && e.status), code);
  };

  /* 拉取：先列資料夾比對 sha，只抓有變的檔 */
  P.pull = function () {
    var self = this, st = this.store;
    if (this.pulling) return Promise.resolve();
    this.pulling = true;
    return this.gh.listDir().then(function (shas) {
      var names = S().FILES.filter(function (n) { return shas[n] && shas[n] !== st.shas[n]; });
      return names.reduce(function (p, n) {
        return p.then(function () {
          return self.gh.readFile(n).then(function (r) { if (r.status === 'ok') st.applyRemote(n, r.data, r.sha); });
        });
      }, Promise.resolve());
    }).then(function () {
      self.firstPullDone = true; self.loadError = null;
      st.setSyncTime();
    }).then(function () { self.pulling = false; }, function (e) { self.pulling = false; if (!self.firstPullDone) self.loadError = e; throw e; });
  };

  function commitMessage(who, file, snap) {
    var a = 0, m = 0, d = 0;
    Object.keys(snap).forEach(function (id) { var op = snap[id].op; if (op === 'add') a++; else if (op === 'del') d++; else m++; });
    return 'app(' + who + '): ' + file + ' +' + a + ' ~' + m + ' -' + d;
  }

  P.push = function () {
    var self = this, st = this.store;
    if (this.pushing) { this.pushAgain = true; return Promise.resolve(); }
    var files = st.pendingFiles();
    if (!files.length) return Promise.resolve();
    if (!this.isOnline()) { this.set('offline'); return Promise.resolve(); }
    this.pushing = true;
    this.set('syncing');
    return files.reduce(function (p, file) {
      return p.then(function () {
        var snap = st.pendingSnapshot(file), local = st.exportFile(file);
        return self.gh.writeMerged(file, local, { sha: st.shas[file], message: commitMessage(self.who, file, snap) }).then(function (r) {
          st.clearPending(file, snap);
          st.applyRemote(file, r.data, r.sha);
        });
      });
    }, Promise.resolve()).then(function () {
      self.pushing = false;
      st.setSyncTime();
      if (self.pushAgain || st.pendingCount()) { self.pushAgain = false; return self.push(); }
      self.set('synced');
    }, function (e) { self.pushing = false; self.fail(e); });
  };

  /* 立即同步：先送、再抓 */
  P.syncNow = function (quiet) {
    var self = this;
    if (!this.isOnline()) { this.set('offline'); return Promise.resolve(); }
    if (!quiet || this.state.status !== 'error') this.set('syncing');
    return this.push().then(function () {
      if (self.state.status === 'error' || self.state.status === 'offline') return;
      return self.pull().then(function () { if (!self.store.pendingCount()) self.set('synced'); else self.set('syncing'); });
    }).catch(function (e) { self.fail(e); });
  };

  W.Sync = Sync;
  if (typeof module !== 'undefined' && module.exports) { require('./util.js'); require('./schema.js'); require('./merge.js'); require('./store-github.js'); module.exports = Sync; }
})(typeof window !== 'undefined' ? window : globalThis);
