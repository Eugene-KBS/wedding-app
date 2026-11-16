/* 預算：總覽、分類配額、分類明細、項目與付款 */
(function (root) {
  var W = root.WApp, U = W.util, UI = W.ui, h = UI.h, C = W.calc;
  var R = W.routes = W.routes || {};

  function setTotal() {
    var A = W.app, m = A.store.meta();
    UI.form({
      title: '總預算', values: { budgetTotal: m.budgetTotal },
      fields: [{ key: 'budgetTotal', label: '總預算（新台幣）', type: 'number', nullable: true, min: 0, hint: '留空代表尚未設定。' }],
      onSave: function (v) { A.store.setMeta({ budgetTotal: v.budgetTotal }, A.who); UI.toast('已更新總預算'); }
    });
  }

  function categoryForm(cat) {
    var A = W.app, isNew = !cat;
    cat = cat || {};
    UI.form({
      title: isNew ? '新增分類' : '編輯分類', autofocus: isNew,
      values: { name: cat.name, allocation: cat.allocation === undefined ? null : cat.allocation },
      fields: [
        { key: 'name', label: '分類名稱', required: true, placeholder: '例如：場地與餐飲' },
        { key: 'allocation', label: '配額（新台幣）', type: 'number', nullable: true, min: 0, hint: '留空代表不設配額。' }
      ],
      onSave: function (v) { A.store.upsertCategory({ id: cat.id, name: v.name, allocation: v.allocation, order: cat.order }, A.who); UI.toast('已儲存分類'); },
      onDelete: isNew ? null : function () {
        var n = A.store.list('budget').filter(function (b) { return b.categoryId === cat.id; }).length;
        if (n) { UI.toast('這個分類還有 ' + n + ' 個項目，請先移到其他分類或刪除。', { error: true, ms: 4000 }); return Promise.reject(new Error('分類內還有項目')); }
        A.store.removeCategory(cat.id); UI.toast('已刪除分類'); if (A.routeName() === 'category') A.go('budget');
      }
    });
  }

  function itemForm(it, defCat) {
    var A = W.app, isNew = !it;
    it = it || {};
    var cats = C.categories(A.store.get('budget')).map(function (c) { return { v: c.id, l: c.name }; });
    cats.push({ v: '', l: '未分類' });
    var vendors = [{ v: '', l: '（不指定）' }].concat(A.store.list('vendors').map(function (v) { return { v: v.id, l: v.name + (v.role ? '（' + v.role + '）' : '') }; }));
    UI.form({
      title: isNew ? '新增預算項目' : '編輯預算項目', autofocus: isNew,
      values: { name: it.name, categoryId: it.categoryId !== undefined ? it.categoryId : (defCat || (cats[0] && cats[0].v)), vendorId: it.vendorId || '', quote: it.quote === undefined ? null : it.quote, payments: it.payments || [], due: it.due, note: it.note },
      fields: [
        { key: 'name', label: '項目名稱', required: true, placeholder: '例如：場地與餐飲' },
        { key: 'categoryId', label: '分類', type: 'select', options: cats },
        { key: 'vendorId', label: '連結廠商', type: 'select', options: vendors },
        { key: 'quote', label: '報價（新台幣）', type: 'number', nullable: true, min: 0, hint: '留空＝尚未報價；填 0 代表報價為 0。' },
        { key: 'payments', label: '付款紀錄（訂金、尾款…）', type: 'payments' },
        { key: 'due', label: '付款期限', type: 'date' },
        { key: 'note', label: '備註', type: 'textarea' }
      ],
      onSave: function (v) { A.store.upsert('budget', Object.assign({ id: it.id }, v), A.who); UI.toast(isNew ? '已新增項目' : '已儲存'); },
      onDelete: isNew ? null : function () { var id = it.id; A.store.remove('budget', id, A.who); UI.toast('已刪除項目', { action: { label: '復原', fn: function () { A.store.restore('budget', id, A.who); } } }); }
    });
  }

  function summaryCard(b) {
    var A = W.app, box = h('div');
    box.appendChild(h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'small muted' }, '總預算'), h('div', { class: 'big-num' }, b.total === null ? '尚未設定' : U.fmtMoney(b.total))),
      h('button', { class: 'btn sm', type: 'button', onclick: setTotal }, b.total === null ? '設定' : '修改')));
    box.appendChild(h('div', { class: 'stats two', style: 'margin-top:12px' },
      h('div', { class: 'stat' }, h('b', null, U.fmtMoney(b.paid)), h('span', null, '已付')),
      h('div', { class: 'stat' }, h('b', null, U.fmtMoney(b.pending)), h('span', null, '待付（報價−已付）'))));
    if (b.total !== null) {
      box.appendChild(h('div', { style: 'margin-top:12px' }, UI.progress(b.total ? b.committed / b.total : 0, b.over ? 'over' : ''),
        h('div', { class: 'kv', style: 'margin-top:6px' }, h('span', null, b.over ? '超支' : '剩餘'), h('b', { class: b.over ? 'neg' : '' }, U.fmtMoney(b.over ? b.over : b.remaining)))));
      box.appendChild(h('div', { class: 'small muted' }, '剩餘＝總預算−已付−待付'));
    }
    if (b.unquoted) box.appendChild(h('div', { class: 'row small', style: 'margin-top:6px' }, UI.badge(b.unquoted + ' 項未報價', 'accent'), h('span', { class: 'muted' }, '尚未計入待付')));
    return h('section', { class: 'card' }, box);
  }

  R.budget = { title: '預算', tab: 'budget', render: function (el) {
    var A = W.app, b = C.budgetSummary(A.store.get('budget'), A.store.meta()), cats = C.categorySummaries(A.store.get('budget'));
    el.appendChild(summaryCard(b));
    var allocSum = cats.reduce(function (s, c) { return s + (c.allocation || 0); }, 0);
    el.appendChild(h('div', { class: 'group-title' }, h('span', null, '分類與配額'), h('span', { class: 'num' }, allocSum ? '已配 ' + U.fmtMoney(allocSum) : '')));
    if (!cats.length) el.appendChild(UI.empty('還沒有分類', '先建立分類（場地、攝影…），再把項目放進去。', '新增分類', function () { categoryForm(); }));
    cats.forEach(function (c) {
      el.appendChild(h('div', { class: 'item tap', style: 'display:block;cursor:pointer', onclick: function () { if (c.virtual) { A.state.catId = ''; } else A.state.catId = c.id; A.go('category'); } },
        h('div', { class: 'row' }, h('div', { class: 'ttl grow' }, c.name), h('span', { class: 'num' }, U.fmtMoney(c.spent)), h('span', { class: 'muted' }, '›')),
        c.allocation ? h('div', { style: 'margin:8px 0 4px' }, UI.progress(c.pct, c.over ? 'over' : '')) : null,
        h('div', { class: 'row small muted wrap', style: 'margin-top:4px' },
          h('span', { class: 'grow' }, c.items + ' 項' + (c.unquoted ? '・' + c.unquoted + ' 未報價' : '')),
          c.allocation ? (c.over ? h('b', { class: 'neg' }, '超出配額 ' + U.fmtMoney(c.over)) : h('span', null, '配額 ' + U.fmtMoney(c.allocation) + '，剩 ' + U.fmtMoney(c.allocation - c.spent))) : h('span', null, '未設配額'))));
    });
    el.appendChild(h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: function () { categoryForm(); } }, '＋ 新增分類')));
    el.appendChild(UI.fab('新增項目', function () { itemForm(null, null); }));
  } };

  R.category = { title: '分類明細', tab: 'budget', parent: 'budget', render: function (el) {
    var A = W.app, id = A.state.catId;
    if (id === undefined) { A.go('budget'); return; }
    var cat = C.categorySummaries(A.store.get('budget')).filter(function (c) { return c.id === id; })[0];
    if (!cat) { el.appendChild(UI.empty('找不到這個分類', '可能已被刪除。', '回預算', function () { A.go('budget'); })); return; }
    document.getElementById('title').textContent = cat.name;
    var items = A.store.list('budget').filter(function (b) { return (b.categoryId || '') === id || (id === '' && !C.categories(A.store.get('budget')).some(function (c) { return c.id === b.categoryId; })); });
    el.appendChild(h('section', { class: 'card' },
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('b', null, cat.allocation ? U.fmtNum(cat.allocation) : '—'), h('span', null, '配額')),
        h('div', { class: 'stat' }, h('b', null, U.fmtNum(cat.paid)), h('span', null, '已付')),
        h('div', { class: 'stat' + (cat.over ? ' warn' : '') }, h('b', null, U.fmtNum(cat.pending)), h('span', null, '待付'))),
      cat.allocation ? h('div', { style: 'margin-top:10px' }, UI.progress(cat.pct, cat.over ? 'over' : ''), h('div', { class: 'small ' + (cat.over ? 'neg' : 'muted'), style: 'margin-top:4px' }, cat.over ? '超出配額 ' + U.fmtMoney(cat.over) : '配額剩 ' + U.fmtMoney(cat.allocation - cat.spent))) : null,
      cat.virtual ? null : h('div', { class: 'btn-row' }, h('button', { class: 'btn sm', type: 'button', onclick: function () { categoryForm(A.store.get('budget').categories.filter(function (c) { return c.id === id; })[0]); } }, '編輯分類'))));
    if (!items.length) el.appendChild(UI.empty('這個分類還沒有項目', '加入第一個項目，記錄報價與付款。', '新增項目', function () { itemForm(null, id); }));
    var vendors = {}; A.store.list('vendors').forEach(function (v) { vendors[v.id] = v; });
    items.forEach(function (it) {
      var paid = C.itemPaid(it), pending = C.itemPending(it), quoted = C.isQuoted(it);
      el.appendChild(h('div', { class: 'item tap', style: 'display:block;cursor:pointer', onclick: function () { itemForm(it); } },
        h('div', { class: 'row' }, h('div', { class: 'ttl grow' }, it.name), quoted ? h('span', { class: 'num' }, U.fmtMoney(it.quote)) : UI.badge('未報價', 'accent')),
        h('div', { class: 'row small', style: 'margin-top:4px' }, h('span', { class: 'muted grow' }, '已付 ' + U.fmtMoney(paid)), quoted ? h('span', { class: pending ? '' : 'muted' }, pending ? '待付 ' + U.fmtMoney(pending) : '已付清') : null),
        quoted && it.quote ? h('div', { style: 'margin-top:6px' }, UI.progress(paid / it.quote)) : null,
        h('div', { class: 'badges' }, it.due ? UI.dueBadge(pending > 0 || !quoted ? it.due : null, false) : null, it.vendorId && vendors[it.vendorId] ? UI.badge(vendors[it.vendorId].name, 'blue') : null, (it.payments || []).length ? UI.badge(it.payments.length + ' 筆付款', 'sage') : null),
        it.note ? h('div', { class: 'note' }, it.note) : null));
    });
    el.appendChild(UI.fab('新增項目', function () { itemForm(null, id); }));
  } };
})(window);
