/* 音樂：同一 section 內上移／下移調整 order */
(function (root) {
  var W = root.WApp, U = W.util, UI = W.ui, h = UI.h, S = W.schema;
  var R = W.routes = W.routes || {};

  function form(m, section) {
    var A = W.app, isNew = !m;
    m = m || {};
    UI.form({
      title: isNew ? '新增曲目' : '編輯曲目', autofocus: isNew,
      values: { section: m.section || section || '證婚', title: m.title, artist: m.artist, url: m.url, note: m.note },
      fields: [
        { key: 'section', label: '用在哪裡', type: 'select', options: S.ENUMS.musicSection },
        { key: 'title', label: '曲名', required: true }, { key: 'artist', label: '演出者' },
        { key: 'url', label: '連結', placeholder: 'https://…', hint: '可貼 Spotify、YouTube 等網址。' },
        { key: 'note', label: '備註', type: 'textarea' }
      ],
      onSave: function (v) {
        if (v.url && !UI.safeUrl(v.url)) { UI.toast('連結要以 http:// 或 https:// 開頭', { error: true }); return false; }
        var props = Object.assign({ id: m.id }, v);
        if (isNew || v.section !== m.section) {
          var max = 0; A.store.list('music').forEach(function (x) { if (x.section === v.section && x.id !== m.id) max = Math.max(max, x.order || 0); });
          props.order = max + 1;
        }
        A.store.upsert('music', props, A.who); UI.toast(isNew ? '已新增曲目' : '已儲存');
      },
      onDelete: isNew ? null : function () { var id = m.id; A.store.remove('music', id, A.who); UI.toast('已刪除', { action: { label: '復原', fn: function () { A.store.restore('music', id, A.who); } } }); }
    });
  }

  /* 移動後重新編號為 1..n，只寫入順序有變的紀錄 */
  function move(section, id, dir) {
    var A = W.app, list = A.store.list('music').filter(function (x) { return x.section === section; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var i = list.findIndex(function (x) { return x.id === id; }), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    var t = list[i]; list[i] = list[j]; list[j] = t;
    list.forEach(function (x, k) { if (x.order !== k + 1) A.store.upsert('music', { id: x.id, order: k + 1 }, A.who); });
  }

  R.music = { title: '音樂', tab: 'more', parent: 'more', render: function (el) {
    var A = W.app, all = A.store.list('music');
    if (!all.length) el.appendChild(UI.empty('還沒有曲目', '依用途分區：證婚、晚宴、雙人舞、After party。', '新增曲目', function () { form(); }));
    S.ENUMS.musicSection.forEach(function (sec) {
      var list = all.filter(function (x) { return x.section === sec; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      if (!list.length && all.length) { el.appendChild(h('div', { class: 'group-title' }, h('span', null, sec), h('a', { href: '#music', style: 'color:var(--accent);text-decoration:none;min-height:44px;display:inline-flex;align-items:center;margin:-14px 0', onclick: function (e) { e.preventDefault(); form(null, sec); } }, '＋ 新增'))); return; }
      if (!list.length) return;
      el.appendChild(h('div', { class: 'group-title' }, h('span', null, sec), h('span', { class: 'num' }, list.length + ' 首')));
      list.forEach(function (m, i) {
        var url = UI.safeUrl(m.url);
        el.appendChild(h('div', { class: 'item' },
          h('div', { class: 'num muted', style: 'width:22px;flex:none;padding-top:2px' }, String(i + 1)),
          h('div', { class: 'main tap', style: 'cursor:pointer', onclick: function () { form(m); } },
            h('div', { class: 'ttl' }, m.title), m.artist ? h('div', { class: 'small muted' }, m.artist) : null, m.note ? h('div', { class: 'note' }, m.note) : null,
            url ? h('div', { class: 'badges' }, h('a', { class: 'badge blue', href: url, target: '_blank', rel: 'noopener noreferrer', style: 'text-decoration:none;min-height:32px', onclick: function (e) { e.stopPropagation(); } }, '開啟連結 ↗')) : null),
          h('div', { class: 'move' },
            h('button', { type: 'button', 'aria-label': '上移：' + m.title, disabled: i === 0, onclick: function () { move(sec, m.id, -1); } }, '▲'),
            h('button', { type: 'button', 'aria-label': '下移：' + m.title, disabled: i === list.length - 1, onclick: function () { move(sec, m.id, 1); } }, '▼'))));
      });
    });
    el.appendChild(UI.fab('新增', function () { form(); }));
  } };
})(window);
