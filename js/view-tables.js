/* 桌位（簡版）、禮簿（簡版）、備品（簡版） */
(function (root) {
  var W = root.WApp, U = W.util, UI = W.ui, h = UI.h, C = W.calc;
  var R = W.routes = W.routes || {};

  /* ---------- 桌位 ---------- */
  function tableForm(t) {
    var A = W.app, isNew = !t, meta = A.store.meta();
    t = t || {};
    var tbName = {}; A.store.list('tables').forEach(function (x) { tbName[x.id] = x.name; });
    var guests = A.store.list('guests').filter(function (g) { return g.status !== '婉拒' && g.dinner; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'zh-Hant'); });
    var opts = guests.map(function (g) { return { v: g.id, l: g.name + (g.partySize > 1 ? ' ×' + g.partySize : ''), sub: g.tableId && g.tableId !== t.id ? '已在「' + (tbName[g.tableId] || '其他桌') + '」' : '' }; });
    UI.form({
      title: isNew ? '新增桌' : '編輯桌', autofocus: isNew,
      values: { name: t.name, capacity: t.capacity === undefined ? (meta.perTable || 10) : t.capacity, note: t.note, guestIds: guests.filter(function (g) { return g.tableId === t.id && t.id; }).map(function (g) { return g.id; }) },
      fields: [
        { key: 'name', label: '桌名', required: true, placeholder: '例如：第 1 桌（親戚）' },
        { key: 'capacity', label: '座位數', type: 'number', min: 1, dflt: 10 },
        { key: 'note', label: '備註' },
        { key: 'guestIds', label: '指派賓客（只列出出席晚宴者）', type: 'picker', options: opts, emptyText: '還沒有晚宴賓客' }
      ],
      onSave: function (v) {
        var rec = A.store.upsert('tables', { id: t.id, name: v.name, capacity: v.capacity, note: v.note }, A.who), chosen = {};
        v.guestIds.forEach(function (id) { chosen[id] = true; });
        guests.forEach(function (g) {
          if (chosen[g.id] && g.tableId !== rec.id) A.store.upsert('guests', { id: g.id, tableId: rec.id }, A.who);
          else if (!chosen[g.id] && g.tableId === rec.id) A.store.upsert('guests', { id: g.id, tableId: '' }, A.who);
        });
        UI.toast(isNew ? '已新增桌' : '已儲存');
      },
      onDelete: isNew ? null : function () {
        var id = t.id; A.store.list('guests').forEach(function (g) { if (g.tableId === id) A.store.upsert('guests', { id: g.id, tableId: '' }, A.who); });
        A.store.remove('tables', id, A.who); UI.toast('已刪除桌');
      }
    });
  }
  R.tables = { title: '桌位', tab: 'more', parent: 'more', render: function (el) {
    var A = W.app, usage = C.tableUsage(A.store.get('tables'), A.store.get('guests')), sum = C.guestSummary(A.store.get('guests'), A.store.meta());
    var seated = usage.reduce(function (s, u) { return s + u.used; }, 0);
    el.appendChild(h('section', { class: 'card' }, h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('b', null, usage.length), h('span', null, '已建立')), h('div', { class: 'stat' }, h('b', null, sum.tables), h('span', null, '預估需要')), h('div', { class: 'stat' }, h('b', null, Math.max(0, sum.dinner - seated)), h('span', null, '晚宴尚未入座')))));
    if (!usage.length) el.appendChild(UI.empty('還沒有桌位', '建立桌子，再把賓客指派進去。', '新增桌', function () { tableForm(); }));
    usage.forEach(function (u) {
      var names = A.store.list('guests').filter(function (g) { return g.tableId === u.table.id; }).map(function (g) { return g.name + (g.partySize > 1 ? '×' + g.partySize : ''); });
      el.appendChild(h('div', { class: 'item tap', style: 'display:block;cursor:pointer', onclick: function () { tableForm(u.table); } },
        h('div', { class: 'row' }, h('div', { class: 'ttl grow' }, u.table.name), h('span', { class: 'num ' + (u.over ? 'neg' : '') }, u.used + ' / ' + u.capacity)),
        h('div', { style: 'margin:6px 0' }, UI.progress(u.capacity ? u.used / u.capacity : 0, u.over ? 'over' : '')),
        h('div', { class: 'small muted' }, names.length ? names.join('、') : '還沒有人'), u.over ? h('div', { class: 'small neg' }, '超過座位 ' + u.over + ' 位') : null,
        u.table.note ? h('div', { class: 'note' }, u.table.note) : null));
    });
    el.appendChild(UI.fab('新增', function () { tableForm(); }));
  } };

  /* ---------- 禮簿 ---------- */
  function giftForm(g) {
    var A = W.app, isNew = !g;
    g = g || {};
    var guests = [{ v: '', l: '（不連結賓客）' }].concat(A.store.list('guests').map(function (x) { return { v: x.id, l: x.name }; }));
    UI.form({
      title: isNew ? '新增禮金' : '編輯禮金', autofocus: isNew,
      values: { name: g.name, guestId: g.guestId || '', amount: g.amount === undefined ? null : g.amount, receivedAt: g.receivedAt || null, note: g.note },
      fields: [
        { key: 'name', label: '姓名', required: true }, { key: 'guestId', label: '連結賓客', type: 'select', options: guests },
        { key: 'amount', label: '金額（新台幣）', type: 'number', min: 0, dflt: 0 }, { key: 'receivedAt', label: '收到日期', type: 'date' }, { key: 'note', label: '備註', type: 'textarea' }
      ],
      onSave: function (v) { A.store.upsert('gifts', Object.assign({ id: g.id }, v), A.who); UI.toast(isNew ? '已新增' : '已儲存'); },
      onDelete: isNew ? null : function () { var id = g.id; A.store.remove('gifts', id, A.who); UI.toast('已刪除', { action: { label: '復原', fn: function () { A.store.restore('gifts', id, A.who); } } }); }
    });
  }
  R.gifts = { title: '禮簿', tab: 'more', parent: 'more', render: function (el) {
    var A = W.app, list = A.store.list('gifts').sort(function (a, b) { return String(b.receivedAt || '').localeCompare(String(a.receivedAt || '')); });
    el.appendChild(h('section', { class: 'card' }, h('div', { class: 'stats two' }, h('div', { class: 'stat' }, h('b', null, U.fmtMoney(C.giftTotal(A.store.get('gifts')))), h('span', null, '合計')), h('div', { class: 'stat' }, h('b', null, list.length), h('span', null, '筆')))));
    if (!list.length) el.appendChild(UI.empty('禮簿是空的', '收到禮金時記一筆。', '新增禮金', function () { giftForm(); }));
    list.forEach(function (g) {
      el.appendChild(h('div', { class: 'item tap', style: 'cursor:pointer', onclick: function () { giftForm(g); } },
        h('div', { class: 'main' }, h('div', { class: 'row' }, h('div', { class: 'ttl grow' }, g.name), h('span', { class: 'num' }, U.fmtMoney(g.amount))), h('div', { class: 'small muted' }, g.receivedAt ? U.fmtDate(g.receivedAt) : '未填日期'), g.note ? h('div', { class: 'note' }, g.note) : null)));
    });
    el.appendChild(UI.fab('新增', function () { giftForm(); }));
  } };

  /* ---------- 備品 ---------- */
  function supplyForm(s) {
    var A = W.app, isNew = !s;
    s = s || {};
    UI.form({
      title: isNew ? '新增備品' : '編輯備品', autofocus: isNew,
      values: { name: s.name, qty: s.qty === undefined ? 1 : s.qty, owner: s.owner, note: s.note },
      fields: [{ key: 'name', label: '品項', required: true }, { key: 'qty', label: '數量', type: 'number', min: 0, dflt: 1 }, { key: 'owner', label: '負責人', placeholder: '新郎、新娘、家人…' }, { key: 'note', label: '備註', type: 'textarea' }],
      onSave: function (v) { A.store.upsert('supplies', Object.assign({ id: s.id }, v), A.who); UI.toast(isNew ? '已新增' : '已儲存'); },
      onDelete: isNew ? null : function () { var id = s.id; A.store.remove('supplies', id, A.who); UI.toast('已刪除', { action: { label: '復原', fn: function () { A.store.restore('supplies', id, A.who); } } }); }
    });
  }
  R.supplies = { title: '備品', tab: 'more', parent: 'more', render: function (el) {
    var A = W.app, list = A.store.list('supplies').sort(function (a, b) { return (a.done ? 1 : 0) - (b.done ? 1 : 0); }), done = list.filter(function (x) { return x.done; }).length;
    if (list.length) el.appendChild(h('div', { class: 'card' }, h('div', { class: 'row', style: 'margin-bottom:8px' }, h('b', { class: 'grow' }, '備齊進度'), h('span', { class: 'num' }, done + ' / ' + list.length)), UI.progress(done / list.length)));
    else el.appendChild(UI.empty('還沒有備品', '列出當天要帶的東西，備齊就打勾。', '新增備品', function () { supplyForm(); }));
    list.forEach(function (s) {
      el.appendChild(h('div', { class: 'item' + (s.done ? ' done' : '') },
        h('button', { class: 'check', type: 'button', role: 'checkbox', 'aria-checked': String(!!s.done), 'aria-label': (s.done ? '取消備齊：' : '標示備齊：') + s.name, onclick: function () { A.store.upsert('supplies', { id: s.id, done: !s.done }, A.who); } }, h('i', null, '✓')),
        h('div', { class: 'main tap', style: 'cursor:pointer', onclick: function () { supplyForm(s); } }, h('div', { class: 'ttl' }, s.name + (s.qty > 1 ? '　×' + s.qty : '')), h('div', { class: 'small muted' }, s.owner || ''), s.note ? h('div', { class: 'note' }, s.note) : null)));
    });
    el.appendChild(UI.fab('新增', function () { supplyForm(); }));
  } };
})(window);
