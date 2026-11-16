/* 本機資料庫：記憶體＋localStorage 持久化；追蹤待送變更。
   命名空間 ns：demo／live／preview 各自獨立，示範資料絕不會進入正式資料。 */
(function (root) {
  var W = root.WApp = root.WApp || {};
  function U() { return W.util; }
  function S() { return W.schema; }
  function M() { return W.merge; }

  function Store(opts) {
    opts = opts || {};
    this.ns = opts.ns || 'demo';
    this.storage = opts.storage || U().storage;
    this.files = {};
    this.shas = {};
    this.pending = {};   // pending[file][id] = {op:'add'|'mod'|'del', seq}
    this.seq = 0;
    this.lastSync = null;
    this.listeners = [];
    this.hasCache = false;
    this.load();
  }
  var P = Store.prototype;
  P.key = function (k) { return 'wapp:' + this.ns + ':' + k; };

  P.load = function () {
    var st = this.storage, f = st.getJSON(this.key('files'), null);
    if (f && typeof f === 'object') { this.files = f; this.hasCache = Object.keys(f).length > 0; }
    this.shas = st.getJSON(this.key('shas'), {}) || {};
    this.pending = st.getJSON(this.key('pending'), {}) || {};
    this.seq = st.getJSON(this.key('seq'), 0) || 0;
    this.lastSync = st.getJSON(this.key('lastSync'), null);
  };
  P.persist = function () {
    var st = this.storage;
    st.setJSON(this.key('files'), this.files);
    st.setJSON(this.key('shas'), this.shas);
    st.setJSON(this.key('pending'), this.pending);
    st.setJSON(this.key('seq'), this.seq);
    st.setJSON(this.key('lastSync'), this.lastSync);
  };
  P.subscribe = function (fn) {
    var self = this;
    this.listeners.push(fn);
    return function () { self.listeners = self.listeners.filter(function (x) { return x !== fn; }); };
  };
  P.notify = function (kind) {
    this.listeners.slice().forEach(function (fn) { try { fn(kind); } catch (e) { if (typeof console !== 'undefined') console.error(e); } });
  };

  /* ---- 讀 ---- */
  P.get = function (file) {
    if (!this.files[file]) this.files[file] = S().emptyFile(file);
    var f = this.files[file];
    if (file !== 'meta') { if (!Array.isArray(f.records)) f.records = []; if (file === 'budget' && !Array.isArray(f.categories)) f.categories = []; }
    return f;
  };
  P.meta = function () { return Object.assign(S().emptyMeta(), this.get('meta')); };
  P.list = function (file) { return this.get(file).records.filter(function (r) { return !r.deleted; }); };
  P.find = function (file, id) {
    var recs = this.get(file).records, i;
    for (i = 0; i < recs.length; i++) if (recs[i].id === id) return recs[i];
    return null;
  };
  P.allFiles = function () {
    var o = {}, self = this;
    S().FILES.forEach(function (n) { o[n] = self.get(n); });
    return o;
  };

  /* ---- 寫（本機變更） ---- */
  P._mark = function (file, id, op) {
    var p = this.pending[file] || (this.pending[file] = {}), prev = p[id];
    if (prev && prev.op === 'add' && op === 'mod') op = 'add';
    p[id] = { op: op, seq: ++this.seq };
  };
  P._changed = function () { this.persist(); this.notify('local'); };

  P.upsert = function (file, props, who) {
    var f = this.get(file), recs = f.records, idx = -1, i, rec, op, now = U().nowIso();
    if (props.id) for (i = 0; i < recs.length; i++) if (recs[i].id === props.id) { idx = i; break; }
    if (idx >= 0) {
      rec = Object.assign({}, recs[idx], props, { updatedAt: now, updatedBy: who });
      if (props.deleted === undefined) rec.deleted = !!recs[idx].deleted;
      recs[idx] = rec; op = 'mod';
    } else { rec = S().newRecord(file, props, who); recs.push(rec); op = 'add'; }
    this._mark(file, rec.id, op);
    this._changed();
    return rec;
  };
  P.remove = function (file, id, who) {
    var r = this.find(file, id);
    if (!r) return null;
    var idx = this.get(file).records.indexOf(r);
    this.get(file).records[idx] = Object.assign({}, r, { deleted: true, updatedAt: U().nowIso(), updatedBy: who });
    this._mark(file, id, 'del');
    this._changed();
    return this.get(file).records[idx];
  };
  P.restore = function (file, id, who) {
    var r = this.find(file, id);
    if (!r) return null;
    return this.upsert(file, { id: id, deleted: false }, who);
  };
  P.setMeta = function (props, who) {
    this.files.meta = Object.assign({}, this.meta(), props, { updatedAt: U().nowIso(), updatedBy: who });
    this._mark('meta', 'meta', 'mod');
    this._changed();
    return this.files.meta;
  };
  P.upsertCategory = function (cat, who) {
    var f = this.get('budget'), i, idx = -1, c;
    c = Object.assign({ id: cat.id || U().uid('c'), name: '', allocation: null, order: f.categories.length + 1 }, cat);
    for (i = 0; i < f.categories.length; i++) if (f.categories[i].id === c.id) { idx = i; break; }
    if (idx >= 0) f.categories[idx] = Object.assign({}, f.categories[idx], c); else f.categories.push(c);
    this._mark('budget', 'cat:' + c.id, idx >= 0 ? 'mod' : 'add');
    this._changed();
    return c;
  };
  P.removeCategory = function (id) {
    var f = this.get('budget'), i;
    for (i = 0; i < f.categories.length; i++) if (f.categories[i].id === id) {
      f.categories[i] = Object.assign({}, f.categories[i], { deleted: true });
      this._mark('budget', 'cat:' + id, 'del');
      this._changed();
      return true;
    }
    return false;
  };

  /* ---- 待送變更 ---- */
  P.pendingCount = function () {
    var n = 0, self = this;
    Object.keys(this.pending).forEach(function (f) { n += Object.keys(self.pending[f]).length; });
    return n;
  };
  P.pendingFiles = function () { var self = this; return Object.keys(this.pending).filter(function (f) { return Object.keys(self.pending[f]).length; }); };
  P.pendingSnapshot = function (file) { return U().clone(this.pending[file] || {}); };
  P.clearPending = function (file, snap) {
    var p = this.pending[file];
    if (!p) return;
    Object.keys(snap).forEach(function (id) { if (p[id] && p[id].seq === snap[id].seq) delete p[id]; });
    if (!Object.keys(p).length) delete this.pending[file];
    this.persist();
  };
  P.pendingCatIds = function () {
    var p = this.pending.budget || {};
    return Object.keys(p).filter(function (k) { return k.indexOf('cat:') === 0; }).map(function (k) { return k.slice(4); });
  };

  /* ---- 遠端資料套用 ---- */
  P.applyRemote = function (file, remote, sha) {
    var local = this.get(file);
    this.files[file] = file === 'meta'
      ? M().mergeMeta(this.files.meta ? this.meta() : null, remote)
      : M().mergeFile(file, local, remote, { localCatIds: this.pendingCatIds() });
    if (sha) this.shas[file] = sha;
    this.hasCache = true;
    this.persist();
    this.notify('remote');
  };
  P.setSyncTime = function () { this.lastSync = Date.now(); this.persist(); };
  P.exportFile = function (file) { return U().clone(this.get(file)); };
  P.seed = function (files) {
    var self = this;
    this.files = {}; this.shas = {}; this.pending = {};
    S().FILES.forEach(function (n) { self.files[n] = U().clone(files[n] || S().emptyFile(n)); });
    this.hasCache = true;
    this.persist();
    this.notify('remote');
  };
  P.clear = function () {
    var st = this.storage, self = this;
    ['files', 'shas', 'pending', 'seq', 'lastSync'].forEach(function (k) { st.remove(self.key(k)); });
    this.files = {}; this.shas = {}; this.pending = {}; this.lastSync = null; this.hasCache = false;
    this.notify('remote');
  };

  W.Store = Store;
  if (typeof module !== 'undefined' && module.exports) {
    require('./util.js'); require('./schema.js'); require('./merge.js');
    module.exports = Store;
  }
})(typeof window !== 'undefined' ? window : globalThis);
