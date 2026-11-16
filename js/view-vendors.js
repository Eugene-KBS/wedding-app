/* 廠商 */
(function (root) {
  var W = root.WApp, U = W.util, UI = W.ui, h = UI.h, S = W.schema;
  var R = W.routes = W.routes || {};
  var st = { status: 'all' };

  function form(v) {
    var A = W.app, isNew = !v;
    v = v || {};
    UI.form({
      title: isNew ? '新增廠商' : '編輯廠商', autofocus: isNew,
      values: { name: v.name, role: v.role, status: v.status || '洽談中', contact: v.contact, channel: v.channel, note: v.note, links: v.links || [] },
      fields: [
        { key: 'name', label: '廠商名稱', required: true }, { key: 'role', label: '負責項目', placeholder: '場地、攝影、音樂…' },
        { key: 'status', label: '狀態', type: 'select', options: S.ENUMS.vendorStatus },
        { key: 'contact', label: '聯絡人' }, { key: 'channel', label: '聯絡管道', placeholder: 'LINE、Email、電話' },
        { key: 'links', label: '連結', type: 'links' },
        { key: 'note', label: '洽談紀錄／備註', type: 'textarea', rows: 5 }
      ],
      onSave: function (x) { A.store.upsert('vendors', Object.assign({ id: v.id }, x), A.who); UI.toast(isNew ? '已新增廠商' : '已儲存'); },
      onDelete: isNew ? null : function () { var id = v.id; A.store.remove('vendors', id, A.who); UI.toast('已刪除', { action: { label: '復原', fn: function () { A.store.restore('vendors', id, A.who); } } }); }
    });
  }

  R.vendors = { title: '廠商', tab: 'more', parent: 'more', render: function (el) {
    var A = W.app, all = A.store.list('vendors');
    el.appendChild(UI.chips([{ v: 'all', l: '全部 ' + all.length }].concat(S.ENUMS.vendorStatus.map(function (s) { return { v: s, l: s + ' ' + all.filter(function (x) { return x.status === s; }).length }; })), st.status, function (v) { st.status = v; A.refresh(); }));
    var list = all.filter(function (x) { return st.status === 'all' || x.status === st.status; });
    if (!list.length) el.appendChild(UI.empty(all.length ? '這個狀態沒有廠商' : '還沒有廠商', '記錄聯絡人、管道與洽談進度。', '新增廠商', function () { form(); }));
    list.forEach(function (v) {
      var kind = v.status === '已結清' || v.status === '已簽約' ? 'ok' : v.status === '不採用' ? '' : v.status === '已保留' ? 'sage' : 'blue';
      var links = (v.links || []).map(function (l) { var u = UI.safeUrl(l.url); return u ? h('a', { class: 'badge blue', href: u, target: '_blank', rel: 'noopener noreferrer', style: 'text-decoration:none;min-height:32px', onclick: function (e) { e.stopPropagation(); } }, l.label || l.url) : null; });
      el.appendChild(h('div', { class: 'item tap', style: 'cursor:pointer;display:block', onclick: function () { form(v); } },
        h('div', { class: 'row' }, h('div', { class: 'ttl grow' }, v.name), UI.badge(v.status, kind)),
        h('div', { class: 'small muted' }, [v.role, v.contact, v.channel].filter(Boolean).join('・')),
        v.note ? h('div', { class: 'note' }, v.note) : null,
        links.some(Boolean) ? h('div', { class: 'badges' }, links) : null));
    });
    el.appendChild(UI.fab('新增', function () { form(); }));
  } };
})(window);
