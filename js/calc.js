/* 計算：預算、賓客、待辦、最近變更 */
(function (root) {
  var W = root.WApp = root.WApp || {};
  var C = {};
  function U() { return W.util; }
  function live(a) { return (a || []).filter(function (r) { return r && !r.deleted; }); }
  C.live = live;

  /* ---------- 預算 ---------- */
  C.itemPaid = function (it) {
    return (it.payments || []).reduce(function (s, p) { return s + (Number(p.amount) || 0); }, 0);
  };
  C.isQuoted = function (it) { return it.quote !== null && it.quote !== undefined && it.quote !== ''; };
  C.itemPending = function (it) {
    return C.isQuoted(it) ? Math.max(0, Number(it.quote) - C.itemPaid(it)) : 0;
  };
  /* 已付＝所有付款加總；待付＝有報價項目的（報價−已付，最小 0）加總；未報價另列筆數 */
  C.budgetSummary = function (budget, meta) {
    var items = live(budget && budget.records), paid = 0, pending = 0, unquoted = 0, quotedTotal = 0;
    items.forEach(function (it) {
      paid += C.itemPaid(it);
      if (C.isQuoted(it)) { pending += C.itemPending(it); quotedTotal += Number(it.quote); }
      else unquoted++;
    });
    var total = meta && meta.budgetTotal !== null && meta.budgetTotal !== undefined ? meta.budgetTotal : null;
    var committed = paid + pending, remaining = total === null ? null : total - committed;
    return {
      paid: paid, pending: pending, committed: committed, unquoted: unquoted, quotedTotal: quotedTotal,
      itemCount: items.length, total: total, remaining: remaining,
      over: remaining !== null && remaining < 0 ? -remaining : 0
    };
  };
  C.categories = function (budget) {
    return live(budget && budget.categories).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  };
  C.categorySummaries = function (budget) {
    var cats = C.categories(budget), items = live(budget && budget.records), map = {}, out = [];
    cats.forEach(function (c) {
      map[c.id] = { id: c.id, name: c.name, allocation: c.allocation === undefined ? null : c.allocation, order: c.order, paid: 0, pending: 0, spent: 0, items: 0, unquoted: 0, over: 0, pct: null };
      out.push(map[c.id]);
    });
    var none = { id: '', name: '未分類', allocation: null, order: 9999, paid: 0, pending: 0, spent: 0, items: 0, unquoted: 0, over: 0, pct: null, virtual: true };
    items.forEach(function (it) {
      var c = map[it.categoryId] || none;
      c.paid += C.itemPaid(it); c.pending += C.itemPending(it); c.items++;
      if (!C.isQuoted(it)) c.unquoted++;
    });
    if (none.items) out.push(none);
    out.forEach(function (c) {
      c.spent = c.paid + c.pending;
      if (c.allocation) { c.pct = c.spent / c.allocation; c.over = Math.max(0, c.spent - c.allocation); }
    });
    return out;
  };

  /* ---------- 賓客 ---------- */
  C.partyOf = function (g) {
    var n = Number(g.partySize);
    if (!isFinite(n)) return 1;
    return Math.max(0, Math.floor(n));
  };
  C.countsAsGuest = function (g) { return !g.deleted && g.status !== '婉拒'; };
  C.guestSummary = function (guests, meta) {
    var list = (guests && guests.records) || [], s = { total: 0, ceremony: 0, dinner: 0, after: 0, tables: 0, perTable: 10, declined: 0, bySide: {}, records: 0 };
    var pt = meta && Number(meta.perTable) >= 1 ? Math.floor(Number(meta.perTable)) : 10;
    s.perTable = pt;
    list.forEach(function (g) {
      if (g.deleted) return;
      s.records++;
      if (g.status === '婉拒') { s.declined++; return; }
      var n = C.partyOf(g);
      s.total += n;
      if (g.ceremony) s.ceremony += n;
      if (g.dinner) s.dinner += n;
      if (g.after) s.after += n;
      var b = s.bySide[g.side] || (s.bySide[g.side] = { total: 0, dinner: 0 });
      b.total += n; if (g.dinner) b.dinner += n;
    });
    s.tables = Math.ceil(s.dinner / pt);
    return s;
  };
  C.tableUsage = function (tables, guests) {
    var used = {};
    live(guests && guests.records).forEach(function (g) {
      if (g.tableId && g.status !== '婉拒') used[g.tableId] = (used[g.tableId] || 0) + C.partyOf(g);
    });
    return live(tables && tables.records).map(function (t) {
      return { table: t, used: used[t.id] || 0, capacity: t.capacity || 0, over: Math.max(0, (used[t.id] || 0) - (t.capacity || 0)) };
    });
  };

  /* ---------- 待辦 ---------- */
  C.dueState = function (due, today) {
    if (!due || !U().isDateStr(due)) return { state: '', days: null };
    var d = U().daysBetween(today, due);
    if (d < 0) return { state: 'overdue', days: -d };
    if (d === 0) return { state: 'today', days: 0 };
    if (d <= 7) return { state: 'soon', days: d };
    return { state: '', days: d };
  };
  C.taskStats = function (tasks, owner) {
    var list = live(tasks && tasks.records).filter(function (t) { return !owner || owner === 'all' || t.owner === owner; });
    var done = list.filter(function (t) { return t.done; }).length;
    return { total: list.length, done: done, open: list.length - done, pct: list.length ? done / list.length : 0 };
  };
  /* 依月份分組（無期限另一組，排最後）；組內依期限、代號排序 */
  C.groupTasksByMonth = function (list) {
    var groups = {}, order = [];
    list.forEach(function (t) {
      var k = t.due && U().isDateStr(t.due) ? t.due.slice(0, 7) : 'none';
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(t);
    });
    order.sort(function (a, b) { return a === 'none' ? 1 : b === 'none' ? -1 : (a < b ? -1 : 1); });
    return order.map(function (k) {
      groups[k].sort(function (a, b) { return String(a.due || '9999').localeCompare(String(b.due || '9999')) || String(a.code || '').localeCompare(String(b.code || '')); });
      return { key: k, items: groups[k] };
    });
  };
  C.decisionCounts = function (decisions) {
    var o = { 待討論: 0, 討論中: 0, 已決定: 0, total: 0 };
    live(decisions && decisions.records).forEach(function (d) { o[d.status] = (o[d.status] || 0) + 1; o.total++; });
    return o;
  };

  C.countdown = function (dateStr, today) {
    if (!dateStr || !U().isDateStr(dateStr)) return null;
    return U().daysBetween(today, dateStr);
  };
  C.giftTotal = function (gifts) { return live(gifts && gifts.records).reduce(function (s, g) { return s + (Number(g.amount) || 0); }, 0); };

  /* ---------- 最近變更：跨檔取 updatedAt 最新的 n 筆 ---------- */
  C.recentChanges = function (files, n) {
    var out = [], S = W.schema;
    S.FILES.forEach(function (name) {
      if (name === 'meta') {
        var m = files.meta;
        if (m && m.title && Date.parse(m.updatedAt) > 86400000) out.push({ file: 'meta', id: 'meta', title: S.titleOf('meta', m), updatedAt: m.updatedAt, updatedBy: m.updatedBy, deleted: false });
        return;
      }
      var f = files[name];
      ((f && f.records) || []).forEach(function (r) {
        out.push({ file: name, id: r.id, title: S.titleOf(name, r), updatedAt: r.updatedAt, updatedBy: r.updatedBy, deleted: !!r.deleted });
      });
    });
    out.sort(function (a, b) { return Date.parse(b.updatedAt) - Date.parse(a.updatedAt); });
    return out.slice(0, n || 8);
  };

  W.calc = C;
  if (typeof module !== 'undefined' && module.exports) { require('./util.js'); require('./schema.js'); module.exports = C; }
})(typeof window !== 'undefined' ? window : globalThis);
