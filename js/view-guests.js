/* 賓客：搜尋、依方與分組、CSV 匯入匯出 */
(function (root) {
  var W = root.WApp, U = W.util, UI = W.ui, h = UI.h, C = W.calc, S = W.schema;
  var R = W.routes = W.routes || {};
  var st = { side: 'all', q: '', mode: 'group' };

  function sideLabel(meta, id) {
    var s = (meta.sides || []).filter(function (x) { return x.id === id; })[0];
    return s ? s.label : (id === 'bride' ? '女方' : '男方');
  }

  function guestForm(g) {
    var A = W.app, isNew = !g, meta = A.store.meta();
    g = g || {};
    var tables = [{ v: '', l: '（未安排）' }].concat(A.store.list('tables').map(function (t) { return { v: t.id, l: t.name }; }));
    UI.form({
      title: isNew ? '新增賓客' : '編輯賓客', autofocus: isNew,
      values: { name: g.name, side: g.side || (st.side === 'bride' ? 'bride' : 'groom'), group: g.group, relation: g.relation, partySize: g.partySize === undefined ? 1 : g.partySize, companions: g.companions, status: g.status || '草擬',
        ceremony: g.ceremony === undefined ? true : g.ceremony, dinner: g.dinner === undefined ? true : g.dinner, after: g.after, tableId: g.tableId || '', diet: g.diet, note: g.note },
      fields: [
        { key: 'name', label: '姓名', required: true },
        { key: 'side', label: '哪一方', type: 'seg', options: [{ v: 'groom', l: sideLabel(meta, 'groom') }, { v: 'bride', l: sideLabel(meta, 'bride') }] },
        { key: 'group', label: '分組', placeholder: '親戚、大學同學、同事…' },
        { key: 'relation', label: '關係', placeholder: '例如：伯父、朋友' },
        { key: 'partySize', label: '人數（含本人）', type: 'number', min: 1, dflt: 1 },
        { key: 'companions', label: '同行者', placeholder: '例如：太太、兩位小孩' },
        { key: 'status', label: '狀態', type: 'select', options: S.ENUMS.guestStatus },
        { key: 'ceremony', label: '出席證婚', type: 'toggle' },
        { key: 'dinner', label: '出席晚宴', type: 'toggle' },
        { key: 'after', label: '出席 after party', type: 'toggle' },
        { key: 'tableId', label: '桌位', type: 'select', options: tables },
        { key: 'diet', label: '飲食需求', placeholder: '素食、過敏…' },
        { key: 'note', label: '備註', type: 'textarea' }
      ],
      onSave: function (v) { A.store.upsert('guests', Object.assign({ id: g.id }, v), A.who); UI.toast(isNew ? '已新增賓客' : '已儲存'); },
      onDelete: isNew ? null : function () { var id = g.id; A.store.remove('guests', id, A.who); UI.toast('已刪除', { action: { label: '復原', fn: function () { A.store.restore('guests', id, A.who); } } }); }
    });
  }

  /* CSV：姓名,方,分組,人數（有標題列就依標題；方可寫 男方／女方／groom／bride 或自訂標籤） */
  function parseGuestCsv(text, meta) {
    var rows = U.parseCsv(text), res = { items: [], skipped: [] }, idx = { name: 0, side: 1, group: 2, size: 3 };
    if (rows.length && /姓名|name/i.test(rows[0][0] || '')) {
      var hd = rows.shift();
      hd.forEach(function (c, i) { if (/^姓名|^name/i.test(c)) idx.name = i; else if (/^方|^side/i.test(c)) idx.side = i; else if (/^分組|^group/i.test(c)) idx.group = i; else if (/^人數|^size|^party/i.test(c)) idx.size = i; });
    }
    var gl = sideLabel(meta, 'groom'), bl = sideLabel(meta, 'bride');
    rows.forEach(function (r, i) {
      var name = (r[idx.name] || '').trim(), sd = (r[idx.side] || '').trim(), line = i + 1;
      if (!name) { res.skipped.push('第 ' + line + ' 筆：沒有姓名'); return; }
      var side = null;
      if (/^(男|groom|新郎)/i.test(sd) || sd === gl) side = 'groom'; else if (/^(女|bride|新娘)/i.test(sd) || sd === bl) side = 'bride';
      if (!side) { res.skipped.push('第 ' + line + ' 筆（' + name + '）：看不懂「方」（請寫男方或女方）'); return; }
      var sizeRaw = (r[idx.size] || '').trim(), size = sizeRaw === '' ? 1 : U.toInt(sizeRaw, NaN);
      if (!isFinite(size) || size < 1) { res.skipped.push('第 ' + line + ' 筆（' + name + '）：人數要是 1 以上的整數'); return; }
      res.items.push({ name: name, side: side, group: (r[idx.group] || '').trim(), partySize: size });
    });
    return res;
  }
  function importSheet() {
    var A = W.app, meta = A.store.meta();
    var ta = h('textarea', { class: 'input', rows: 8, placeholder: '姓名,方,分組,人數\n王大華,男方,親戚,2\n李美惠,女方,家人,3', id: 'csv-text' });
    var out = h('div', { class: 'small', style: 'margin-top:8px' });
    var sheet = UI.sheet({ title: '貼上 CSV 匯入' }), parsed = null;
    sheet.body.appendChild(h('div', { class: 'hint', style: 'margin-bottom:8px' }, '欄位順序：姓名,方,分組,人數。可直接從試算表複製貼上（Tab 分隔也可以）。同方同名的賓客會略過。'));
    sheet.body.appendChild(ta); sheet.body.appendChild(out);
    function preview() {
      parsed = parseGuestCsv(ta.value, meta);
      var exist = {}; A.store.list('guests').forEach(function (g) { exist[g.side + '|' + g.name] = true; });
      parsed.dups = parsed.items.filter(function (x) { return exist[x.side + '|' + x.name]; }).length;
      parsed.fresh = parsed.items.filter(function (x) { return !exist[x.side + '|' + x.name]; });
      out.innerHTML = '';
      if (!ta.value.trim()) return;
      out.appendChild(h('div', { class: parsed.fresh.length ? 'okbox' : 'errbox' }, '可匯入 ' + parsed.fresh.length + ' 位' + (parsed.dups ? '；已存在而略過 ' + parsed.dups + ' 位' : '') + (parsed.skipped.length ? '；有問題 ' + parsed.skipped.length + ' 筆' : '')));
      if (parsed.skipped.length) out.appendChild(h('div', { class: 'muted' }, parsed.skipped.slice(0, 6).join('\n')));
      out.lastChild.style.whiteSpace = 'pre-wrap';
    }
    ta.addEventListener('input', U.debounce(preview, 150));
    sheet.foot.appendChild(h('button', { class: 'btn', type: 'button', onclick: function () { sheet.tryClose(); } }, '取消'));
    sheet.foot.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () {
      preview();
      if (!parsed.fresh.length) { UI.toast('沒有可匯入的賓客', { error: true }); return; }
      parsed.fresh.forEach(function (x) { A.store.upsert('guests', { name: x.name, side: x.side, group: x.group, partySize: x.partySize }, A.who); });
      UI.toast('已匯入 ' + parsed.fresh.length + ' 位賓客'); sheet.setDirty(false); sheet.close();
    } }, '匯入'));
  }
  function exportCsv() {
    var A = W.app, meta = A.store.meta(), tb = {}; A.store.list('tables').forEach(function (t) { tb[t.id] = t.name; });
    var rows = [['姓名', '方', '分組', '人數', '關係', '狀態', '證婚', '晚宴', 'after party', '桌位', '飲食', '備註']];
    A.store.list('guests').forEach(function (g) { rows.push([g.name, sideLabel(meta, g.side), g.group, g.partySize, g.relation, g.status, g.ceremony ? '是' : '', g.dinner ? '是' : '', g.after ? '是' : '', tb[g.tableId] || '', g.diet, g.note]); });
    UI.exportPanel({ title: '匯出賓客 CSV', filename: 'guests-' + U.todayStr() + '.csv', text: U.toCsv(rows), mime: 'text/csv;charset=utf-8', bom: true });
  }

  function guestItem(g) {
    var tags = [];
    if (g.ceremony) tags.push(UI.badge('證婚', 'accent')); if (g.dinner) tags.push(UI.badge('晚宴', 'sage')); if (g.after) tags.push(UI.badge('after', 'blue'));
    var kind = g.status === '出席' ? 'ok' : g.status === '婉拒' ? 'warn' : g.status === '待定' ? 'accent' : '';
    return h('div', { class: 'item tap', style: 'cursor:pointer;' + (g.status === '婉拒' ? 'opacity:.6' : ''), onclick: function () { guestForm(g); } },
      h('div', { class: 'main' },
        h('div', { class: 'row' }, h('div', { class: 'ttl grow' }, g.name, g.partySize > 1 ? h('span', { class: 'muted num' }, '　×' + g.partySize) : null), UI.badge(g.status, kind)),
        h('div', { class: 'small muted' }, [g.relation, g.companions ? '同行：' + g.companions : '', g.diet ? '飲食：' + g.diet : ''].filter(Boolean).join('・')),
        tags.length ? h('div', { class: 'badges' }, tags) : null));
  }

  R.guests = { title: '賓客', tab: 'guests', render: function (el) {
    var A = W.app, meta = A.store.meta(), sum = C.guestSummary(A.store.get('guests'), meta);
    el.appendChild(h('section', { class: 'card' },
      h('div', { class: 'row', style: 'margin-bottom:10px' }, h('div', { class: 'big-num grow' }, sum.total, h('span', { class: 'small muted', style: 'font-weight:400' }, ' 人')), h('div', { class: 'right small' }, h('div', null, '預估 ', h('b', null, sum.tables), ' 桌'), h('div', { class: 'muted' }, '每桌 ' + sum.perTable + ' 人'))),
      h('div', { class: 'stats' }, h('div', { class: 'stat' }, h('b', null, sum.ceremony), h('span', null, '證婚')), h('div', { class: 'stat' }, h('b', null, sum.dinner), h('span', null, '晚宴')), h('div', { class: 'stat' }, h('b', null, sum.after), h('span', null, 'after party'))),
      h('div', { class: 'small muted', style: 'margin-top:8px' }, sideLabel(meta, 'groom') + ' ' + ((sum.bySide.groom || {}).total || 0) + ' 人・' + sideLabel(meta, 'bride') + ' ' + ((sum.bySide.bride || {}).total || 0) + ' 人' + (sum.declined ? '・婉拒 ' + sum.declined + ' 筆' : ''))));

    var search = h('input', { class: 'input searchbox', id: 'guest-search', type: 'search', placeholder: '搜尋姓名、分組、關係', value: st.q, enterkeyhint: 'search', autocomplete: 'off' });
    el.appendChild(search);
    el.appendChild(h('div', { class: 'row', style: 'margin-bottom:8px;gap:8px' },
      h('div', { class: 'grow' }, UI.seg([{ v: 'all', l: '全部' }, { v: 'groom', l: sideLabel(meta, 'groom') }, { v: 'bride', l: sideLabel(meta, 'bride') }], st.side, function (v) { st.side = v; A.refresh(); })),
      h('div', null, UI.seg([{ v: 'group', l: '分組' }, { v: 'list', l: '清單' }], st.mode, function (v) { st.mode = v; A.refresh(); }))));
    var listBox = h('div'); el.appendChild(listBox);
    el.appendChild(h('div', { class: 'btn-row' }, h('button', { class: 'btn sm', type: 'button', onclick: importSheet }, '貼上 CSV 匯入'), h('button', { class: 'btn sm', type: 'button', onclick: exportCsv }, '匯出 CSV')));
    el.appendChild(UI.fab('新增', function () { guestForm(); }));

    function draw() {
      listBox.innerHTML = '';
      var q = st.q.trim().toLowerCase(), all = A.store.list('guests');
      var list = all.filter(function (g) {
        if (st.side !== 'all' && g.side !== st.side) return false;
        return !q || [g.name, g.group, g.relation, g.companions, g.note].join(' ').toLowerCase().indexOf(q) >= 0;
      });
      if (!list.length) { listBox.appendChild(all.length ? UI.empty('找不到符合的賓客', '換個關鍵字，或切換「全部」。') : UI.empty('還沒有賓客', '一位一位新增，或貼上 CSV 一次匯入。', '新增賓客', function () { guestForm(); })); return; }
      if (st.mode === 'list') { list.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh-Hant'); }).forEach(function (g) { listBox.appendChild(guestItem(g)); }); return; }
      var bySide = st.side === 'all' ? ['groom', 'bride'] : [st.side];
      bySide.forEach(function (sd) {
        var gs = list.filter(function (g) { return g.side === sd; });
        if (!gs.length) return;
        if (st.side === 'all') listBox.appendChild(h('div', { class: 'group-title', style: 'color:var(--accent);font-size:14px' }, h('span', null, sideLabel(meta, sd)), h('span', { class: 'num' }, gs.reduce(function (s, g) { return s + (C.countsAsGuest(g) ? C.partyOf(g) : 0); }, 0) + ' 人')));
        var groups = {}; gs.forEach(function (g) { var k = g.group || '未分組'; (groups[k] = groups[k] || []).push(g); });
        Object.keys(groups).sort(function (a, b) { return a === '未分組' ? 1 : b === '未分組' ? -1 : a.localeCompare(b, 'zh-Hant'); }).forEach(function (k) {
          listBox.appendChild(h('div', { class: 'group-title' }, h('span', null, k), h('span', { class: 'num' }, groups[k].reduce(function (s, g) { return s + (C.countsAsGuest(g) ? C.partyOf(g) : 0); }, 0) + ' 人')));
          groups[k].sort(function (a, b) { return a.name.localeCompare(b.name, 'zh-Hant'); }).forEach(function (g) { listBox.appendChild(guestItem(g)); });
        });
      });
    }
    search.addEventListener('input', function () { st.q = search.value; draw(); });
    draw();
  } };
})(window);
