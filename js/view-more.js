/* 更多：選單與婚禮資訊 */
(function (root) {
  var W = root.WApp, U = W.util, UI = W.ui, h = UI.h;
  var R = W.routes = W.routes || {};

  function metaForm() {
    var A = W.app, m = A.store.meta(), sides = m.sides || [];
    function lbl(id, d) { var s = sides.filter(function (x) { return x.id === id; })[0]; return s ? s.label : d; }
    UI.form({
      title: '婚禮資訊',
      values: { title: m.title, date: m.date || null, time: m.time, venue: m.venue, city: m.city, groom: m.groom, bride: m.bride, budgetTotal: m.budgetTotal, perTable: m.perTable || 10, sg: lbl('groom', '男方'), sb: lbl('bride', '女方') },
      fields: [
        { key: 'title', label: '婚禮名稱' },
        { key: 'date', label: '日期', type: 'date' },
        { key: 'time', label: '開始時間', type: 'time' },
        { key: 'venue', label: '場地' }, { key: 'city', label: '城市' },
        { key: 'groom', label: '新郎' }, { key: 'bride', label: '新娘' },
        { key: 'budgetTotal', label: '總預算（新台幣）', type: 'number', nullable: true, min: 0 },
        { key: 'perTable', label: '每桌人數', type: 'number', min: 1, dflt: 10, hint: '用來估算桌數。' },
        { key: 'sg', label: '「男方」的顯示名稱', required: true }, { key: 'sb', label: '「女方」的顯示名稱', required: true }
      ],
      onSave: function (v) {
        A.store.setMeta({ title: v.title, date: v.date || '', time: v.time || '', venue: v.venue, city: v.city, groom: v.groom, bride: v.bride, budgetTotal: v.budgetTotal, perTable: v.perTable || 10,
          sides: [{ id: 'groom', label: v.sg }, { id: 'bride', label: v.sb }] }, A.who);
        UI.toast('已儲存婚禮資訊');
      }
    });
  }

  R.more = { title: '更多', tab: 'more', render: function (el) {
    var A = W.app, st = A.store;
    var items = [
      ['schedule', '流程', st.list('schedule').length + ' 項', '時'], ['vendors', '廠商', st.list('vendors').length + ' 家', '商'],
      ['music', '音樂', st.list('music').length + ' 首', '樂'], ['tables', '桌位', st.list('tables').length + ' 桌', '桌'],
      ['gifts', '禮簿', st.list('gifts').length + ' 筆', '禮'], ['supplies', '備品', st.list('supplies').filter(function (x) { return !x.done; }).length + ' 項未備', '備'],
      ['info', '婚禮資訊', '日期、場地、桌數', '訊'], ['settings', '設定', A.mode === 'live' ? '正式模式' : A.mode === 'demo' ? '示範模式' : '預覽', '設']
    ];
    el.appendChild(h('div', { class: 'menu' }, items.map(function (i) { return h('a', { href: '#' + i[0] }, h('div', { class: 'dot' }, i[3]), h('div', null, h('b', null, i[1]), h('br'), h('span', null, i[2]))); })));
  } };

  R.info = { title: '婚禮資訊', tab: 'more', parent: 'more', render: function (el) {
    var A = W.app, m = A.store.meta();
    function kv(k, v) { return h('div', { class: 'kv' }, h('span', null, k), h('b', { style: 'text-align:right' }, v || '—')); }
    el.appendChild(h('section', { class: 'card' }, kv('名稱', m.title), kv('日期', m.date ? U.fmtDate(m.date) : ''), kv('時間', m.time), kv('場地', m.venue), kv('城市', m.city), kv('新郎', m.groom), kv('新娘', m.bride),
      kv('總預算', m.budgetTotal === null ? '' : U.fmtMoney(m.budgetTotal)), kv('每桌人數', String(m.perTable || 10)),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: metaForm }, '編輯'))));
    el.appendChild(h('div', { class: 'small muted' }, '最後修改：' + UI.person(m.updatedBy) + '・' + U.relTime(m.updatedAt)));
  } };
})(window);
