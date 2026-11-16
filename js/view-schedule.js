/* 流程：前一日／當日／隔日 */
(function (root) {
  var W = root.WApp, U = W.util, UI = W.ui, h = UI.h, S = W.schema;
  var R = W.routes = W.routes || {};
  var st = { day: '當日' };

  function form(it) {
    var A = W.app, isNew = !it;
    it = it || {};
    UI.form({
      title: isNew ? '新增流程' : '編輯流程', autofocus: isNew,
      values: { day: it.day || st.day, time: it.time, title: it.title, place: it.place, cue: it.cue, music: it.music, note: it.note, status: it.status || '草案' },
      fields: [
        { key: 'day', label: '哪一天', type: 'seg', options: S.ENUMS.scheduleDay },
        { key: 'time', label: '時間', type: 'time' },
        { key: 'title', label: '項目', required: true, placeholder: '例如：證婚儀式' },
        { key: 'place', label: '地點' }, { key: 'cue', label: '誰 cue', placeholder: '主持人、燈光…' }, { key: 'music', label: '音樂' },
        { key: 'note', label: '備註', type: 'textarea' },
        { key: 'status', label: '狀態', type: 'seg', options: S.ENUMS.scheduleStatus }
      ],
      onSave: function (v) { st.day = v.day; A.store.upsert('schedule', Object.assign({ id: it.id }, v), A.who); UI.toast(isNew ? '已新增' : '已儲存'); },
      onDelete: isNew ? null : function () { var id = it.id; A.store.remove('schedule', id, A.who); UI.toast('已刪除', { action: { label: '復原', fn: function () { A.store.restore('schedule', id, A.who); } } }); }
    });
  }

  R.schedule = { title: '流程', tab: 'more', parent: 'more', render: function (el) {
    var A = W.app, all = A.store.list('schedule');
    var counts = {}; S.ENUMS.scheduleDay.forEach(function (d) { counts[d] = all.filter(function (x) { return x.day === d; }).length; });
    el.appendChild(h('div', { style: 'margin-bottom:12px' }, UI.seg(S.ENUMS.scheduleDay.map(function (d) { return { v: d, l: d + ' ' + counts[d] }; }), st.day, function (v) { st.day = v; A.refresh(); })));
    var list = all.filter(function (x) { return x.day === st.day; }).sort(function (a, b) { return String(a.time || '99:99').localeCompare(String(b.time || '99:99')); });
    if (!list.length) el.appendChild(UI.empty('「' + st.day + '」還沒有流程', '加入時間與項目，標示誰 cue 與音樂。', '新增流程', function () { form(); }));
    list.forEach(function (it) {
      el.appendChild(h('div', { class: 'item tap', style: 'cursor:pointer', onclick: function () { form(it); } },
        h('div', { class: 'num', style: 'width:52px;flex:none;font-weight:700;color:var(--accent);padding-top:2px' }, it.time || '—'),
        h('div', { class: 'main' }, h('div', { class: 'row' }, h('div', { class: 'ttl grow' }, it.title), UI.badge(it.status, it.status === '確定' ? 'ok' : '')),
          h('div', { class: 'small muted' }, [it.place, it.cue ? 'cue：' + it.cue : '', it.music ? '音樂：' + it.music : ''].filter(Boolean).join('・')),
          it.note ? h('div', { class: 'note' }, it.note) : null)));
    });
    el.appendChild(UI.fab('新增', function () { form(); }));
  } };
})(window);
