/* UI 元件：DOM 建構、底部表單、對話框、提示條、匯出面板（不使用 alert／confirm／prompt） */
(function (root) {
  var W = root.WApp = root.WApp || {};
  var U = W.util, UI = W.ui = {};

  UI.h = function (tag, attrs) {
    var el = document.createElement(tag), k, v, i;
    if (attrs) for (k in attrs) {
      v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') el.value = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    function add(c) {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    }
    for (i = 2; i < arguments.length; i++) add(arguments[i]);
    return el;
  };
  var h = UI.h;

  var ICONS = {
    overview: '<circle cx="12" cy="10" r="4"/><path d="M3 17c3-2 6-2 9 0s6 2 9 0M5 21c2-1.2 4-1.2 7 0s5 1.2 7 0"/>',
    tasks: '<rect x="4" y="3.5" width="16" height="17" rx="4"/><path d="m8.5 12 2.4 2.4 4.6-5"/>',
    budget: '<path d="M4 18V9m5 9V5m5 13v-7m5 7V8"/><path d="M3 20.5h18"/>',
    guests: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-5.5 6-5.5s6 2 6 5.5"/><circle cx="17.5" cy="9" r="2.4"/><path d="M17 14.6c2.4.2 4 1.8 4 4.4"/>',
    more: '<circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/>',
    empty: '<path d="M4 17c3-2 6-2 9 0s5 2 7 1M6 12c2.5-1.5 5-1.5 7.5 0"/><circle cx="16" cy="7" r="3"/>'
  };
  UI.icon = function (name) {
    var s = document.createElement('span');
    s.style.display = 'contents';
    s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
    return s;
  };

  UI.badge = function (text, kind) { return h('span', { class: 'badge' + (kind ? ' ' + kind : '') }, text); };
  UI.progress = function (ratio, kind) {
    var p = Math.max(0, Math.min(1, ratio || 0));
    return h('div', { class: 'progress ' + (kind || ''), role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(p * 100)) }, h('i', { style: 'width:' + (p * 100).toFixed(1) + '%' }));
  };
  UI.empty = function (title, desc, actionLabel, action) {
    return h('div', { class: 'empty' }, h('div', { class: 'ico' }, UI.icon('empty')), h('h3', null, title), desc ? h('p', null, desc) : null,
      actionLabel ? h('button', { class: 'btn primary', type: 'button', onclick: action }, actionLabel) : null);
  };
  UI.loading = function (text) { return h('div', { class: 'loading' }, h('div', { class: 'spinner' }), text || '載入中…'); };
  UI.errorBox = function (text, retryLabel, retry) {
    return h('div', { class: 'errbox' }, h('div', null, text), retry ? h('div', { class: 'btn-row' }, h('button', { class: 'btn sm', type: 'button', onclick: retry }, retryLabel || '重試')) : null);
  };

  function pressedGroup(cls, options, value, onChange, btnCls) {
    var box = h('div', { class: cls, role: 'group' });
    options.forEach(function (o) {
      var v = o.v !== undefined ? o.v : o, l = o.l !== undefined ? o.l : o;
      var b = h('button', { type: 'button', class: btnCls || null, 'aria-pressed': String(v === value), onclick: function () {
        Array.prototype.forEach.call(box.children, function (c) { c.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true'); box.value = v; onChange && onChange(v);
      } }, l);
      box.appendChild(b);
    });
    box.value = value;
    return box;
  }
  UI.seg = function (options, value, onChange) { return pressedGroup('seg', options, value, onChange); };
  UI.chips = function (options, value, onChange) { return pressedGroup('chips', options, value, onChange, 'chip'); };

  /* ---------- 提示條 ---------- */
  UI.toast = function (msg, o) {
    o = o || {};
    var rootEl = document.getElementById('toast-root'), t, timer;
    if (!rootEl) return;
    while (rootEl.firstChild) rootEl.removeChild(rootEl.firstChild);
    function close() { clearTimeout(timer); if (t.parentNode) t.parentNode.removeChild(t); }
    t = h('div', { class: 'toast' + (o.error ? ' err' : ''), role: 'status' }, h('span', null, msg),
      o.action ? h('button', { type: 'button', onclick: function () { close(); o.action.fn(); } }, o.action.label) : null);
    rootEl.appendChild(t);
    timer = setTimeout(close, o.ms || (o.action ? 5000 : 2600));
  };

  /* ---------- 對話框（取代 confirm） ---------- */
  UI.confirm = function (o) {
    return new Promise(function (resolve) {
      var rootEl = document.getElementById('dialog-root'), wrap;
      function done(v) { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); document.removeEventListener('keydown', onKey); resolve(v); }
      function onKey(e) { if (e.key === 'Escape') done(false); }
      wrap = h('div', { class: 'dialog-wrap', onclick: function (e) { if (e.target === wrap) done(false); } },
        h('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true' },
          h('h3', null, o.title || '請確認'), o.message ? h('p', null, o.message) : null,
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn', type: 'button', onclick: function () { done(false); } }, o.cancelLabel || '取消'),
            h('button', { class: 'btn ' + (o.danger ? 'danger solid' : 'primary'), type: 'button', onclick: function () { done(true); } }, o.okLabel || '確定'))));
      rootEl.appendChild(wrap);
      document.addEventListener('keydown', onKey);
    });
  };

  /* ---------- 底部滑出表單 ---------- */
  var sheetStack = [];
  UI.sheet = function (o) {
    var rootEl = document.getElementById('sheet-root'), dirty = false, closed = false, api = {};
    var body = h('div', { class: 'sheet-body' }), foot = h('div', { class: 'sheet-foot' });
    var panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title }, 
      h('div', { class: 'sheet-head' }, h('h2', null, o.title), h('button', { class: 'x', type: 'button', 'aria-label': '關閉', onclick: function () { api.tryClose(); } }, '✕')),
      body, foot);
    var back = h('div', { class: 'backdrop', onclick: function () { api.tryClose(); } });
    rootEl.appendChild(back); rootEl.appendChild(panel);
    document.body.classList.add('sheet-open');
    requestAnimationFrame(function () { back.classList.add('show'); panel.classList.add('show'); });
    panel.addEventListener('input', function () { dirty = true; });
    panel.addEventListener('change', function () { dirty = true; });
    panel.addEventListener('focusin', function (e) {
      var t = e.target;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) setTimeout(function () { try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (x) { /* ignore */ } }, 320);
    });
    api.body = body; api.foot = foot; api.panel = panel;
    api.setDirty = function (v) { dirty = v; };
    api.close = function () {
      if (closed) return; closed = true;
      panel.classList.remove('show'); back.classList.remove('show');
      sheetStack = sheetStack.filter(function (s) { return s !== api; });
      setTimeout(function () { if (panel.parentNode) panel.parentNode.removeChild(panel); if (back.parentNode) back.parentNode.removeChild(back); }, 220);
      if (!sheetStack.length) document.body.classList.remove('sheet-open');
      o.onClose && o.onClose();
    };
    api.tryClose = function () {
      if (!dirty) return api.close();
      UI.confirm({ title: '放棄修改？', message: '已輸入的內容不會儲存。', okLabel: '放棄', cancelLabel: '繼續編輯', danger: true }).then(function (ok) { if (ok) api.close(); });
    };
    sheetStack.push(api);
    return api;
  };
  UI.closeAllSheets = function () { sheetStack.slice().forEach(function (s) { s.close(); }); };

  /* 鍵盤遮擋：用 visualViewport 把表單抬到鍵盤上方 */
  UI.watchKeyboard = function () {
    var vv = root.visualViewport;
    function upd() {
      var kb = 0, vh = root.innerHeight;
      if (vv) { kb = Math.max(0, root.innerHeight - vv.height - vv.offsetTop); vh = vv.height; }
      document.documentElement.style.setProperty('--kb', (kb > 80 ? kb : 0) + 'px');
      document.documentElement.style.setProperty('--vvh', vh + 'px');
      document.body.classList.toggle('kb-open', kb > 80);
    }
    if (vv) { vv.addEventListener('resize', upd); vv.addEventListener('scroll', upd); }
    root.addEventListener('resize', upd);
    upd();
  };

  /* ---------- 表單產生器 ----------
     fields: {key,label,type,options,required,placeholder,hint,nullable,min,rows, get?}
     type: text textarea number date time select seg toggle payments links picker */
  UI.form = function (o) {
    var sheet = UI.sheet({ title: o.title, onClose: o.onClose }), ctrls = {}, vals = o.values || {};
    var errBox = h('div', { class: 'errbox', hidden: true });
    sheet.body.appendChild(errBox);

    o.fields.forEach(function (f) {
      var c = buildField(f, vals[f.key], vals), wrap = h('div', { class: 'field' });
      if (f.type !== 'toggle') wrap.appendChild(h('label', null, f.label + (f.required ? ' *' : '')));
      wrap.appendChild(c.el);
      if (f.hint) wrap.appendChild(h('div', { class: 'hint' }, f.hint));
      c.wrap = wrap; c.f = f; ctrls[f.key] = c;
      sheet.body.appendChild(wrap);
    });

    function showErr(key, msg) {
      var c = ctrls[key], e = c.wrap.querySelector('.err');
      if (e) e.remove();
      if (msg) {
        c.wrap.appendChild(h('div', { class: 'err' }, msg));
        var inp = c.wrap.querySelector('.input'); if (inp) inp.classList.add('bad');
      } else { var i2 = c.wrap.querySelector('.input'); if (i2) i2.classList.remove('bad'); }
    }
    function collect() {
      var out = {}, ok = true, first = null;
      o.fields.forEach(function (f) {
        var r = ctrls[f.key].get();
        showErr(f.key, null);
        if (r.error) { showErr(f.key, r.error); ok = false; first = first || f.key; }
        else if (f.required && (r.value === '' || r.value === null || r.value === undefined)) { showErr(f.key, '這一欄必填'); ok = false; first = first || f.key; }
        else out[f.key] = r.value;
      });
      if (!ok) { try { ctrls[first].wrap.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* ignore */ } return null; }
      return out;
    }
    var saveBtn = h('button', { class: 'btn primary', type: 'button', onclick: function () {
      var v = collect(); if (!v) return;
      saveBtn.disabled = true;
      Promise.resolve(o.onSave(v, sheet)).then(function (res) { saveBtn.disabled = false; if (res !== false) sheet.close(); },
        function (e) { saveBtn.disabled = false; errBox.hidden = false; errBox.textContent = '儲存失敗：' + (e && e.message ? e.message : e); });
    } }, o.saveLabel || '儲存');
    if (o.onDelete) sheet.foot.appendChild(h('button', { class: 'btn danger', type: 'button', onclick: function () {
      UI.confirm({ title: o.deleteTitle || '確定要刪除嗎？', message: o.deleteMessage || '刪除後可在提示條按「復原」。', okLabel: '刪除', danger: true }).then(function (ok) { if (ok) { sheet.setDirty(false); Promise.resolve(o.onDelete(sheet)).then(function () { sheet.close(); }, function () { /* 已提示 */ }); } });
    } }, '刪除'));
    sheet.foot.appendChild(h('button', { class: 'btn', type: 'button', onclick: function () { sheet.tryClose(); } }, '取消'));
    sheet.foot.appendChild(saveBtn);
    var firstInput = sheet.body.querySelector('input.input[type=text], textarea');
    if (o.autofocus && firstInput) setTimeout(function () { firstInput.focus(); }, 300);
    sheet.ctrls = ctrls;
    return sheet;
  };

  function buildField(f, value, allVals) {
    var t = f.type || 'text', el, c = {};
    function input(type, extra) { return h('input', Object.assign({ class: 'input', type: type, value: value === null || value === undefined ? '' : String(value), placeholder: f.placeholder || null, autocomplete: 'off', enterkeyhint: 'done' }, extra || {})); }
    switch (t) {
      case 'textarea':
        el = h('textarea', { class: 'input', rows: f.rows || 3, placeholder: f.placeholder || null }); el.value = value || '';
        c.el = el; c.get = function () { return { value: el.value.trim() }; }; break;
      case 'number':
        el = input('text', { inputmode: 'numeric', pattern: '[0-9,]*' });
        c.el = el; c.get = function () {
          var s = el.value.replace(/[,，\s]/g, '');
          if (s === '') return { value: f.nullable ? null : (f.dflt !== undefined ? f.dflt : '') };
          if (!/^\d+$/.test(s)) return { error: '請輸入整數（不含小數點與符號）' };
          var n = parseInt(s, 10);
          if (f.min !== undefined && n < f.min) return { error: '不能小於 ' + f.min };
          return { value: n };
        }; break;
      case 'date': case 'time':
        el = input(t);
        c.el = h('div', { class: 'inline' }, el, f.clearable === false ? null : h('button', { class: 'btn sm ghost', type: 'button', onclick: function () { el.value = ''; el.dispatchEvent(new Event('change', { bubbles: true })); } }, '清除'));
        c.get = function () { return { value: el.value || (t === 'date' ? null : '') }; }; break;
      case 'select':
        el = h('select', { class: 'input' }, f.options.map(function (op) { var v = op.v !== undefined ? op.v : op; return h('option', { value: v, selected: v === value }, op.l !== undefined ? op.l : op); }));
        if (value !== undefined) el.value = value;
        c.el = el; c.get = function () { return { value: el.value }; }; break;
      case 'seg':
        el = UI.seg(f.options, value === undefined ? (f.options[0].v !== undefined ? f.options[0].v : f.options[0]) : value);
        c.el = el; c.get = function () { return { value: el.value }; }; break;
      case 'toggle':
        el = h('input', { type: 'checkbox' }); el.checked = !!value;
        c.el = h('label', { class: 'toggle' }, el, f.label); c.get = function () { return { value: el.checked }; }; break;
      case 'payments': buildPayments(f, value, c); break;
      case 'links': buildLinks(value, c); break;
      case 'picker': buildPicker(f, value, c); break;
      default:
        el = input('text'); c.el = el; c.get = function () { return { value: el.value.trim() }; };
    }
    return c;
  }

  function buildPayments(f, value, c) {
    var list = h('div'), rows = [];
    function addRow(p) {
      p = p || { id: U.uid('p'), date: U.todayStr(), amount: '', note: '' };
      var d = h('input', { class: 'input', type: 'date', value: p.date || '' });
      var a = h('input', { class: 'input', type: 'text', inputmode: 'numeric', placeholder: '金額', value: p.amount === '' ? '' : String(p.amount) });
      var n = h('input', { class: 'input', type: 'text', placeholder: '備註（訂金、尾款…）', value: p.note || '' });
      var row = h('div', { class: 'sub-row' }, h('div', { class: 'grid2' }, d, a), h('div', { class: 'inline' }, n,
        h('button', { class: 'btn sm danger', type: 'button', 'aria-label': '刪除這筆付款', onclick: function () { rows = rows.filter(function (r) { return r.row !== row; }); row.remove(); } }, '✕')));
      rows.push({ row: row, id: p.id, d: d, a: a, n: n });
      list.appendChild(row);
    }
    (value || []).forEach(addRow);
    c.el = h('div', null, list, h('button', { class: 'btn sm block', type: 'button', onclick: function () { addRow(); var l = rows[rows.length - 1]; setTimeout(function () { l.a.focus(); }, 50); } }, '＋ 新增一筆付款'));
    c.get = function () {
      var out = [], i, r, s;
      for (i = 0; i < rows.length; i++) {
        r = rows[i]; s = r.a.value.replace(/[,，\s]/g, '');
        if (s === '' && !r.n.value.trim()) continue;
        if (!/^\d+$/.test(s)) return { error: '第 ' + (i + 1) + ' 筆付款的金額請輸入整數' };
        out.push({ id: r.id, date: r.d.value || null, amount: parseInt(s, 10), note: r.n.value.trim() });
      }
      return { value: out };
    };
  }
  function buildLinks(value, c) {
    var list = h('div'), rows = [];
    function addRow(l) {
      l = l || { label: '', url: '' };
      var a = h('input', { class: 'input', type: 'text', placeholder: '名稱（官網、報價單…）', value: l.label || '' });
      var u = h('input', { class: 'input', type: 'url', placeholder: 'https://…', value: l.url || '', inputmode: 'url', autocapitalize: 'off' });
      var row = h('div', { class: 'sub-row' }, h('div', { class: 'grid2' }, a, u),
        h('button', { class: 'btn sm danger', type: 'button', onclick: function () { rows = rows.filter(function (r) { return r.row !== row; }); row.remove(); } }, '移除這個連結'));
      rows.push({ row: row, a: a, u: u }); list.appendChild(row);
    }
    (value || []).forEach(addRow);
    c.el = h('div', null, list, h('button', { class: 'btn sm block', type: 'button', onclick: function () { addRow(); } }, '＋ 新增連結'));
    c.get = function () {
      var out = [], i, r, url;
      for (i = 0; i < rows.length; i++) {
        r = rows[i]; url = r.u.value.trim();
        if (!url && !r.a.value.trim()) continue;
        if (!/^https?:\/\//i.test(url)) return { error: '連結要以 http:// 或 https:// 開頭' };
        out.push({ label: r.a.value.trim() || url, url: url });
      }
      return { value: out };
    };
  }
  function buildPicker(f, value, c) {
    var set = {}, box = h('div');
    (value || []).forEach(function (id) { set[id] = true; });
    if (!f.options.length) box.appendChild(h('div', { class: 'muted small' }, f.emptyText || '沒有可選的項目'));
    f.options.forEach(function (op) {
      var cb = h('input', { type: 'checkbox' }); cb.checked = !!set[op.v];
      cb.addEventListener('change', function () { if (cb.checked) set[op.v] = true; else delete set[op.v]; });
      box.appendChild(h('label', { class: 'toggle' }, cb, h('span', null, op.l, op.sub ? h('span', { class: 'muted small' }, '　' + op.sub) : null)));
    });
    c.el = box; c.get = function () { return { value: Object.keys(set) }; };
  }

  /* ---------- 匯出：先試 Blob 下載，同時一定提供頁內面板（顯示內容＋複製） ---------- */
  UI.exportPanel = function (o) {
    try {
      var blob = new Blob([o.bom ? '﻿' + o.text : o.text], { type: o.mime || 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = h('a', { href: url, download: o.filename, style: 'display:none' });
      document.body.appendChild(a); a.click();
      setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 4000);
    } catch (e) { /* 下載被擋：改用下方面板 */ }
    var sheet = UI.sheet({ title: o.title || '匯出' });
    var pre = h('pre', { class: 'export', tabindex: '0' }, o.text);
    var msg = h('div', { class: 'hint', style: 'margin-top:8px' }, '若沒有自動下載，請按「複製」，再貼到備忘錄或檔案裡。');
    function selectAll() {
      try { var r = document.createRange(); r.selectNodeContents(pre); var s = root.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) { /* ignore */ }
    }
    pre.addEventListener('focus', selectAll);
    var copyBtn = h('button', { class: 'btn primary', type: 'button', onclick: function () {
      var ok = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(o.text).then(function () { msg.textContent = '已複製到剪貼簿。'; }, function () { selectAll(); msg.textContent = '無法自動複製，已全選內容，請長按後選「拷貝」。'; });
          ok = true;
        }
      } catch (e) { ok = false; }
      if (!ok) { selectAll(); try { ok = document.execCommand && document.execCommand('copy'); } catch (e2) { ok = false; } msg.textContent = ok ? '已複製到剪貼簿。' : '無法自動複製，已全選內容，請長按後選「拷貝」。'; }
    } }, '複製');
    sheet.body.appendChild(h('div', { class: 'small muted', style: 'margin-bottom:8px' }, o.filename + '（' + U.fmtNum(o.text.length) + ' 字）'));
    sheet.body.appendChild(pre); sheet.body.appendChild(msg);
    sheet.foot.appendChild(h('button', { class: 'btn', type: 'button', onclick: selectAll }, '全選'));
    sheet.foot.appendChild(copyBtn);
    sheet.foot.appendChild(h('button', { class: 'btn', type: 'button', onclick: function () { sheet.close(); } }, '關閉'));
    return sheet;
  };

  /* 共用小工具 */
  UI.fab = function (label, onClick) { return h('button', { class: 'fab', type: 'button', onclick: onClick }, h('span', { 'aria-hidden': 'true', style: 'font-size:22px;line-height:1' }, '＋'), label); };
  UI.safeUrl = function (u) { return /^https?:\/\//i.test(String(u || '')) ? u : null; };
  UI.person = function (code) {
    var p = W.config.people, m = {};
    try { m = (W.app && W.app.store && W.app.store.meta().people) || {}; } catch (e) { m = {}; }
    return code === 'E' ? (m.E || p.E) : code === 'S' ? (m.S || p.S) : code || '';
  };
  UI.avatar = function (by) { return h('span', { class: 'avatar ' + (by === '婚顧' ? '婚' : by), title: UI.person(by) }, by === '婚顧' ? '顧' : by); };
  UI.ownerBadge = function (o) {
    var map = { E: [UI.person('E'), 'sage'], S: [UI.person('S'), 'accent'], '兩人': ['兩人', ''], '廠商': ['廠商', 'blue'] }, m = map[o];
    return m ? UI.badge(m[0], m[1]) : (o ? UI.badge(o, '') : null);
  };
  UI.dueBadge = function (due, done) {
    if (!due) return null;
    var st = W.calc.dueState(due, U.todayStr()), d = U.fmtShortDate(due);
    if (done) return UI.badge(d, '');
    if (st.state === 'overdue') return UI.badge(d + '・逾期 ' + st.days + ' 天', 'warn');
    if (st.state === 'today') return UI.badge('今天', 'accent');
    if (st.state === 'soon') return UI.badge(d + '・' + st.days + ' 天後', 'blue');
    return UI.badge(d, '');
  };
  UI.card = function (title, moreLabel, route, kids) {
    var head = h('h2', null, h('span', null, title), moreLabel ? h('a', { href: '#' + route }, moreLabel + ' ›') : null);
    return h('section', { class: 'card' }, head, kids);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = UI;
})(typeof window !== 'undefined' ? window : globalThis);
