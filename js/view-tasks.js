/* 待辦與待決定 */
(function (root) {
  var W = root.WApp, U = W.util, UI = W.ui, h = UI.h, C = W.calc, S = W.schema;
  var R = W.routes = W.routes || {};
  var st = { owner: 'all', show: 'open', dstatus: 'all' };

  function head(active) {
    return h('div', { style: 'margin-bottom:12px' }, UI.seg([{ v: 'tasks', l: '待辦' }, { v: 'decisions', l: '待決定' }], active, function (v) { W.app.go(v); }));
  }

  /* ---------- 待辦 ---------- */
  function taskForm(t) {
    var A = W.app, isNew = !t;
    t = t || {};
    UI.form({
      title: isNew ? '新增待辦' : '編輯待辦', autofocus: isNew,
      values: { title: t.title, due: t.due, owner: t.owner || '兩人', category: t.category, note: t.note, ref: t.ref, code: t.code },
      fields: [
        { key: 'title', label: '要做什麼', required: true, placeholder: '例如：確認場地訂金' },
        { key: 'due', label: '期限', type: 'date' },
        { key: 'owner', label: '負責人', type: 'seg', options: [{ v: 'E', l: UI.person('E') }, { v: 'S', l: UI.person('S') }, { v: '兩人', l: '兩人' }, { v: '廠商', l: '廠商' }] },
        { key: 'category', label: '分類', placeholder: '場地、攝影、服裝…' },
        { key: 'note', label: '備註', type: 'textarea' },
        { key: 'ref', label: '相關（D-xx 或文件）', placeholder: '可留空' },
        { key: 'code', label: '編號', placeholder: '可留空，例如 T-12' }
      ],
      onSave: function (v) { A.store.upsert('tasks', Object.assign({ id: t.id }, v), A.who); UI.toast(isNew ? '已新增待辦' : '已儲存'); },
      onDelete: isNew ? null : function () { var id = t.id; A.store.remove('tasks', id, A.who); UI.toast('已刪除', { action: { label: '復原', fn: function () { A.store.restore('tasks', id, A.who); } } }); }
    });
  }

  function toggle(t) {
    var A = W.app, nowDone = !t.done;
    A.store.upsert('tasks', { id: t.id, done: nowDone, doneAt: nowDone ? U.nowIso() : null }, A.who);
    UI.toast(nowDone ? '已完成：' + t.title : '已還原為進行中', { action: { label: '復原', fn: function () { A.store.upsert('tasks', { id: t.id, done: !nowDone, doneAt: !nowDone ? U.nowIso() : null }, A.who); } } });
  }

  function taskItem(t) {
    var meta = h('div', { class: 'badges' }, UI.dueBadge(t.due, t.done), UI.ownerBadge(t.owner), t.category ? UI.badge(t.category, '') : null, t.ref ? UI.badge(t.ref, 'blue') : null,
      t.done && t.doneAt ? UI.badge('完成於 ' + U.fmtShortDate(U.todayStr(new Date(t.doneAt))), 'ok') : null);
    return h('div', { class: 'item' + (t.done ? ' done' : '') },
      h('button', { class: 'check', type: 'button', role: 'checkbox', 'aria-checked': String(!!t.done), 'aria-label': (t.done ? '還原：' : '完成：') + t.title, onclick: function () { toggle(t); } }, h('i', null, '✓')),
      h('div', { class: 'main tap', style: 'cursor:pointer', onclick: function () { taskForm(t); } },
        h('div', { class: 'ttl' }, (t.code ? t.code + '  ' : '') + t.title), t.note ? h('div', { class: 'note' }, t.note) : null, meta));
  }

  R.tasks = { title: '待辦', tab: 'tasks', render: function (el) {
    var A = W.app, all = A.store.list('tasks'), today = U.todayStr();
    el.appendChild(head('tasks'));
    el.appendChild(UI.chips([{ v: 'all', l: '全部' }, { v: 'E', l: UI.person('E') }, { v: 'S', l: UI.person('S') }, { v: '兩人', l: '兩人' }, { v: '廠商', l: '廠商' }], st.owner, function (v) { st.owner = v; A.refresh(); }));
    var stats = C.taskStats(A.store.get('tasks'), st.owner);
    el.appendChild(h('div', { class: 'card' },
      h('div', { class: 'row', style: 'margin-bottom:8px' }, h('b', { class: 'grow' }, '進度'), h('span', { class: 'num' }, stats.done + ' / ' + stats.total + '（' + Math.round(stats.pct * 100) + '%）')),
      UI.progress(stats.pct, 'accent')));
    el.appendChild(h('div', { style: 'margin-bottom:6px' }, UI.seg([{ v: 'open', l: '進行中 ' + stats.open }, { v: 'done', l: '已完成 ' + stats.done }], st.show, function (v) { st.show = v; A.refresh(); })));

    var list = all.filter(function (t) { return (st.owner === 'all' || t.owner === st.owner) && (st.show === 'done' ? t.done : !t.done); });
    if (st.show === 'open') {
      var od = list.filter(function (t) { return C.dueState(t.due, today).state === 'overdue'; }).length, td = list.filter(function (t) { return C.dueState(t.due, today).state === 'today'; }).length;
      if (od || td) el.appendChild(h('div', { class: 'badges', style: 'margin:8px 2px' }, od ? UI.badge('逾期 ' + od + ' 項', 'warn') : null, td ? UI.badge('今天到期 ' + td + ' 項', 'accent') : null));
    }
    if (!list.length) {
      el.appendChild(st.show === 'done' ? UI.empty('還沒有完成的項目', '完成後會出現在這裡，也可以隨時還原。') :
        UI.empty(all.length && st.owner === 'all' ? '全部完成了' : '這裡沒有待辦', all.length && st.owner === 'all' ? '真棒。想到新的事再加進來。' : '換個負責人看看，或新增一項。', '新增待辦', function () { taskForm(); }));
    }
    C.groupTasksByMonth(list).forEach(function (g) {
      el.appendChild(h('div', { class: 'group-title' }, h('span', null, g.key === 'none' ? '無期限' : U.fmtMonthLabel(g.key)), h('span', { class: 'num' }, g.items.length + ' 項')));
      g.items.forEach(function (t) { el.appendChild(taskItem(t)); });
    });
    el.appendChild(UI.fab('新增', function () { taskForm(); }));
  } };

  /* ---------- 待決定 ---------- */
  function decisionForm(d) {
    var A = W.app, isNew = !d;
    d = d || {};
    UI.form({
      title: isNew ? '新增待決定' : '編輯待決定', autofocus: isNew,
      values: { title: d.title, category: d.category, status: d.status || '待討論', viewE: d.viewE, viewS: d.viewS, resolution: d.resolution, next: d.next, due: d.due, code: d.code },
      fields: [
        { key: 'title', label: '要決定什麼', required: true, placeholder: '例如：場地用哪一間' },
        { key: 'category', label: '分類', placeholder: '場地、音樂、宴客…' },
        { key: 'status', label: '狀態', type: 'seg', options: S.ENUMS.decisionStatus },
        { key: 'viewE', label: UI.person('E') + ' 的想法', type: 'textarea' },
        { key: 'viewS', label: UI.person('S') + ' 的想法', type: 'textarea' },
        { key: 'resolution', label: '結論', type: 'textarea', hint: '兩邊意見不同時，先並列，等討論出結果再寫。' },
        { key: 'next', label: '下一步' },
        { key: 'due', label: '希望決定的日期', type: 'date' },
        { key: 'code', label: '編號', placeholder: '可留空，例如 D-09' }
      ],
      onSave: function (v) { A.store.upsert('decisions', Object.assign({ id: d.id }, v), A.who); UI.toast(isNew ? '已新增' : '已儲存'); },
      onDelete: isNew ? null : function () { var id = d.id; A.store.remove('decisions', id, A.who); UI.toast('已刪除', { action: { label: '復原', fn: function () { A.store.restore('decisions', id, A.who); } } }); }
    });
  }
  function viewBox(label, text) { return h('div', { class: 'view' + (text ? '' : ' empty') }, h('h4', null, label), text || '還沒有想法'); }

  R.decisions = { title: '待決定', tab: 'tasks', render: function (el) {
    var A = W.app, all = A.store.list('decisions'), counts = C.decisionCounts(A.store.get('decisions'));
    el.appendChild(head('decisions'));
    el.appendChild(UI.chips([{ v: 'all', l: '全部 ' + counts.total }].concat(S.ENUMS.decisionStatus.map(function (s) { return { v: s, l: s + ' ' + counts[s] }; })), st.dstatus, function (v) { st.dstatus = v; A.refresh(); }));
    var list = all.filter(function (d) { return st.dstatus === 'all' || d.status === st.dstatus; });
    if (!list.length) el.appendChild(UI.empty(all.length ? '這個狀態下沒有項目' : '還沒有待決定的事', '把兩個人還沒有共識的事放在這裡，並列各自的想法。', '新增待決定', function () { decisionForm(); }));
    list.forEach(function (d) {
      var kind = d.status === '已決定' ? 'ok' : d.status === '討論中' ? 'blue' : '';
      el.appendChild(h('div', { class: 'item decision tap', style: 'display:block;cursor:pointer', onclick: function () { decisionForm(d); } },
        h('div', { class: 'row wrap' }, h('div', { class: 'ttl grow' }, (d.code ? d.code + '  ' : '') + d.title), UI.badge(d.status, kind)),
        h('div', { class: 'badges', style: 'margin-top:2px' }, d.category ? UI.badge(d.category, '') : null, d.due ? UI.dueBadge(d.due, d.status === '已決定') : null),
        h('div', { class: 'views' }, viewBox(UI.person('E') + ' 的想法', d.viewE), viewBox(UI.person('S') + ' 的想法', d.viewS)),
        d.resolution ? h('div', { class: 'res' }, h('b', null, '結論　'), d.resolution) : null,
        d.next ? h('div', { class: 'next' }, '下一步：' + d.next) : null));
    });
    el.appendChild(UI.fab('新增', function () { decisionForm(); }));
  } };
})(window);
