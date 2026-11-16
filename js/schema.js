/* 資料結構：欄位預設值、建立紀錄、驗證 */
(function (root) {
  var W = root.WApp = root.WApp || {};
  var U = function () { return W.util; };
  var S = {};

  S.VERSION = 1;
  S.FILES = ['meta', 'tasks', 'decisions', 'budget', 'guests', 'tables', 'gifts', 'vendors', 'schedule', 'supplies', 'music'];
  S.MODULE_LABEL = {
    meta: '婚禮資訊', tasks: '待辦', decisions: '待決定', budget: '預算', guests: '賓客', tables: '桌位',
    gifts: '禮簿', vendors: '廠商', schedule: '流程', supplies: '備品', music: '音樂'
  };
  S.ENUMS = {
    updatedBy: ['E', 'S', '婚顧'],
    owner: ['E', 'S', '兩人', '廠商'],
    decisionStatus: ['待討論', '討論中', '已決定'],
    guestStatus: ['草擬', '已邀請', '出席', '待定', '婉拒'],
    side: ['groom', 'bride'],
    vendorStatus: ['洽談中', '已保留', '已簽約', '已結清', '不採用'],
    scheduleDay: ['前一日', '當日', '隔日'],
    scheduleStatus: ['草案', '確定'],
    musicSection: ['證婚', '晚宴·管樂參考', '晚宴·鋼琴與配樂參考', '雙人舞', 'After party']
  };
  var E = S.ENUMS;

  /* 欄位型別：s 字串、s! 必填字串、d 日期或空、t 時間或空、i 整數、in 整數或null、b 布林、iso 時間戳或空、陣列＝列舉 */
  S.SPEC = {
    tasks: { code: 's', title: 's!', note: 's', due: 'd', owner: E.owner, category: 's', done: 'b', doneAt: 'iso', ref: 's', source: 's' },
    decisions: { code: 's', title: 's!', category: 's', status: E.decisionStatus, viewE: 's', viewS: 's', resolution: 's', next: 's', due: 'd', source: 's' },
    budget: { name: 's!', categoryId: 's', vendorId: 's', quote: 'in', payments: 'payments', due: 'd', note: 's' },
    guests: { name: 's!', side: E.side, group: 's', relation: 's', partySize: 'i', companions: 's', status: E.guestStatus, ceremony: 'b', dinner: 'b', after: 'b', tableId: 's', diet: 's', note: 's' },
    tables: { name: 's!', capacity: 'i', note: 's' },
    gifts: { name: 's!', guestId: 's', amount: 'i', receivedAt: 'd', note: 's' },
    vendors: { name: 's!', role: 's', contact: 's', channel: 's', status: E.vendorStatus, note: 's', links: 'links' },
    schedule: { day: E.scheduleDay, time: 't', title: 's!', place: 's', cue: 's', music: 's', note: 's', status: E.scheduleStatus },
    supplies: { name: 's!', qty: 'i', owner: 's', done: 'b', note: 's' },
    music: { section: E.musicSection, order: 'i', title: 's!', artist: 's', url: 's', note: 's' }
  };

  S.DEFAULTS = {
    tasks: { code: '', title: '', note: '', due: null, owner: '兩人', category: '', done: false, doneAt: null, ref: '', source: '' },
    decisions: { code: '', title: '', category: '', status: '待討論', viewE: '', viewS: '', resolution: '', next: '', due: null, source: '' },
    budget: { name: '', categoryId: '', vendorId: '', quote: null, payments: [], due: null, note: '' },
    guests: { name: '', side: 'groom', group: '', relation: '', partySize: 1, companions: '', status: '草擬', ceremony: true, dinner: true, after: false, tableId: '', diet: '', note: '' },
    tables: { name: '', capacity: 10, note: '' },
    gifts: { name: '', guestId: '', amount: 0, receivedAt: null, note: '' },
    vendors: { name: '', role: '', contact: '', channel: '', status: '洽談中', note: '', links: [] },
    schedule: { day: '當日', time: '', title: '', place: '', cue: '', music: '', note: '', status: '草案' },
    supplies: { name: '', qty: 1, owner: '', done: false, note: '' },
    music: { section: '證婚', order: 1, title: '', artist: '', url: '', note: '' }
  };
  S.ID_PREFIX = { tasks: 't', decisions: 'd', budget: 'b', guests: 'g', tables: 'tb', gifts: 'gf', vendors: 'v', schedule: 's', supplies: 'su', music: 'm' };

  S.emptyFile = function (name) {
    if (name === 'meta') return S.emptyMeta();
    var f = { schemaVersion: S.VERSION, records: [] };
    if (name === 'budget') f.categories = [];
    return f;
  };
  S.emptyMeta = function () {
    return {
      schemaVersion: S.VERSION, title: '', date: '', time: '', venue: '', city: '', groom: '', bride: '',
      budgetTotal: null, perTable: 10,
      sides: [{ id: 'groom', label: '男方' }, { id: 'bride', label: '女方' }],
      updatedAt: '1970-01-01T00:00:00.000Z', updatedBy: 'E'
    };
  };
  S.newRecord = function (file, props, who) {
    var d = U().clone(S.DEFAULTS[file] || {});
    var rec = Object.assign(d, props || {});
    rec.id = rec.id || U().uid(S.ID_PREFIX[file]);
    rec.updatedAt = U().nowIso();
    rec.updatedBy = who || 'E';
    rec.deleted = false;
    return rec;
  };
  S.titleOf = function (file, r) {
    if (!r) return '';
    if (file === 'meta') return r.title || '婚禮資訊';
    if (file === 'tasks' || file === 'decisions' || file === 'schedule' || file === 'music') return r.title || '';
    return r.name || r.title || '';
  };

  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }

  S.validateRecord = function (file, r, out, where) {
    var u = U(), spec = S.SPEC[file], k, v, t;
    function err(m) { out.errors.push(where + ' ' + m); }
    function warn(m) { out.warnings.push(where + ' ' + m); }
    if (!r || typeof r !== 'object' || Array.isArray(r)) { err('不是物件'); return; }
    if (typeof r.id !== 'string' || !r.id) err('缺少 id');
    if (!u.isIso(r.updatedAt)) err('updatedAt 不是 ISO 8601 時間');
    if (S.ENUMS.updatedBy.indexOf(r.updatedBy) < 0) err('updatedBy 必須是 E／S／婚顧（目前：' + r.updatedBy + '）');
    if (r.deleted !== undefined && typeof r.deleted !== 'boolean') err('deleted 必須是布林');
    if (!spec) return;
    for (k in spec) {
      t = spec[k]; v = r[k];
      if (v === undefined) { if (t === 's!') err('缺少必填欄位 ' + k); continue; }
      if (Array.isArray(t)) { if (t.indexOf(v) < 0) err(k + ' 不在允許值內（' + v + '）'); continue; }
      switch (t) {
        case 's!': if (typeof v !== 'string' || !v.trim()) err(k + ' 必填且須為文字'); break;
        case 's': if (typeof v !== 'string') err(k + ' 必須是文字'); break;
        case 'd': if (!(v === null || v === '' || u.isDateStr(v))) err(k + ' 必須是 YYYY-MM-DD（目前：' + v + '）'); break;
        case 't': if (!(v === null || v === '' || u.isTimeStr(v))) err(k + ' 必須是 HH:MM（目前：' + v + '）'); break;
        case 'i': if (!isInt(v) || v < 0) err(k + ' 必須是非負整數（目前：' + v + '）'); break;
        case 'in': if (!(v === null || (isInt(v) && v >= 0))) err(k + ' 必須是非負整數或 null（目前：' + v + '）'); break;
        case 'b': if (typeof v !== 'boolean') err(k + ' 必須是布林'); break;
        case 'iso': if (!(v === null || v === '' || u.isIso(v))) err(k + ' 必須是 ISO 8601 時間'); break;
        case 'payments':
          if (!Array.isArray(v)) { err('payments 必須是陣列'); break; }
          v.forEach(function (p, i) {
            if (!p || typeof p !== 'object') { err('payments[' + i + '] 不是物件'); return; }
            if (typeof p.id !== 'string' || !p.id) err('payments[' + i + '] 缺少 id');
            if (!isInt(p.amount) || p.amount < 0) err('payments[' + i + '].amount 必須是非負整數');
            if (!(p.date === null || p.date === '' || u.isDateStr(p.date))) err('payments[' + i + '].date 必須是 YYYY-MM-DD');
          });
          break;
        case 'links':
          if (!Array.isArray(v)) { err('links 必須是陣列'); break; }
          v.forEach(function (l, i) {
            if (!l || typeof l.url !== 'string') err('links[' + i + '] 需要 url');
            else if (!/^https?:\/\//i.test(l.url)) warn('links[' + i + '].url 不是 http(s) 連結，App 不會顯示成連結');
          });
          break;
      }
    }
  };

  S.validateMeta = function (m, out) {
    var u = U();
    function err(x) { out.errors.push('meta.json ' + x); }
    if (!m || typeof m !== 'object' || Array.isArray(m)) { err('必須是單一物件'); return; }
    if (m.schemaVersion !== S.VERSION) err('schemaVersion 必須是 ' + S.VERSION);
    ['title', 'venue', 'city', 'groom', 'bride'].forEach(function (k) { if (m[k] !== undefined && typeof m[k] !== 'string') err(k + ' 必須是文字'); });
    if (m.date !== undefined && !(m.date === '' || m.date === null || u.isDateStr(m.date))) err('date 必須是 YYYY-MM-DD');
    if (m.time !== undefined && !(m.time === '' || m.time === null || u.isTimeStr(m.time))) err('time 必須是 HH:MM');
    if (m.budgetTotal !== undefined && !(m.budgetTotal === null || (isInt(m.budgetTotal) && m.budgetTotal >= 0))) err('budgetTotal 必須是非負整數或 null');
    if (m.perTable !== undefined && !(isInt(m.perTable) && m.perTable >= 1)) err('perTable 必須是正整數');
    if (m.sides !== undefined) {
      if (!Array.isArray(m.sides) || m.sides.length < 2) err('sides 必須是含 groom／bride 的陣列');
      else m.sides.forEach(function (s, i) { if (!s || typeof s.id !== 'string' || typeof s.label !== 'string') err('sides[' + i + '] 需要 id 與 label'); });
    }
    if (m.people !== undefined && (!m.people || typeof m.people !== 'object' || Array.isArray(m.people) || ['E', 'S'].some(function (k) { return m.people[k] !== undefined && typeof m.people[k] !== 'string'; }))) err('people 必須是 {E, S} 文字物件');
    if (!u.isIso(m.updatedAt)) err('updatedAt 不是 ISO 8601 時間');
    if (S.ENUMS.updatedBy.indexOf(m.updatedBy) < 0) err('updatedBy 必須是 E／S／婚顧');
  };

  /* 驗證單一檔案物件，回傳 {errors, warnings} */
  S.validateFile = function (name, obj) {
    var out = { errors: [], warnings: [] }, fn = name + '.json';
    if (name === 'meta') { S.validateMeta(obj, out); return out; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { out.errors.push(fn + ' 必須是物件 {schemaVersion, records}'); return out; }
    if (obj.schemaVersion !== S.VERSION) out.errors.push(fn + ' schemaVersion 必須是 ' + S.VERSION);
    if (!Array.isArray(obj.records)) { out.errors.push(fn + ' records 必須是陣列'); return out; }
    var seen = {};
    obj.records.forEach(function (r, i) {
      var where = fn + ' records[' + i + ']' + (r && r.id ? '(' + r.id + ')' : '');
      if (r && r.id) { if (seen[r.id]) out.errors.push(where + ' id 重複'); seen[r.id] = true; }
      S.validateRecord(name, r, out, where);
    });
    if (name === 'budget') {
      var cats = obj.categories;
      if (!Array.isArray(cats)) out.errors.push(fn + ' categories 必須是陣列');
      else {
        var cs = {};
        cats.forEach(function (c, i) {
          if (!c || typeof c.id !== 'string' || !c.id) out.errors.push(fn + ' categories[' + i + '] 缺少 id');
          else { if (cs[c.id]) out.errors.push(fn + ' categories id 重複 ' + c.id); cs[c.id] = true; }
          if (c && (typeof c.name !== 'string' || !c.name)) out.errors.push(fn + ' categories[' + i + '] 缺少 name');
          if (c && !(c.allocation === null || c.allocation === undefined || (isInt(c.allocation) && c.allocation >= 0))) out.errors.push(fn + ' categories[' + i + '].allocation 必須是整數或 null');
          if (c && c.order !== undefined && !isInt(c.order)) out.errors.push(fn + ' categories[' + i + '].order 必須是整數');
        });
        obj.records.forEach(function (r) { if (r && r.categoryId && !cs[r.categoryId]) out.warnings.push(fn + ' 項目 ' + r.id + ' 的 categoryId 找不到對應分類'); });
      }
    }
    return out;
  };

  /* 跨檔參照檢查（警告） */
  S.crossCheck = function (files) {
    var w = [], ids = function (n) { var o = {}; ((files[n] && files[n].records) || []).forEach(function (r) { o[r.id] = true; }); return o; };
    var tb = ids('tables'), vd = ids('vendors'), gs = ids('guests');
    ((files.guests && files.guests.records) || []).forEach(function (g) { if (g.tableId && !tb[g.tableId]) w.push('guests ' + g.id + ' 的 tableId 找不到桌位'); });
    ((files.budget && files.budget.records) || []).forEach(function (b) { if (b.vendorId && !vd[b.vendorId]) w.push('budget ' + b.id + ' 的 vendorId 找不到廠商'); });
    ((files.gifts && files.gifts.records) || []).forEach(function (g) { if (g.guestId && !gs[g.guestId]) w.push('gifts ' + g.id + ' 的 guestId 找不到賓客'); });
    return w;
  };

  W.schema = S;
  if (typeof module !== 'undefined' && module.exports) { require('./util.js'); module.exports = S; }
})(typeof window !== 'undefined' ? window : globalThis);
