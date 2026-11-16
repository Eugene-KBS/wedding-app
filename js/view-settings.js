/* 設定與首次設定畫面 */
(function (root) {
  var W = root.WApp, U = W.util, UI = W.ui, h = UI.h, cfg = W.config;
  var R = W.routes = W.routes || {};
  W.views = W.views || {};

  /* 「我是誰」＋ Token ＋ 連線測試。共用於首次設定與設定頁。 */
  function setupForm(o) {
    var A = W.app, who = A.settings.who || null, wrap = h('div');
    var whoSeg = UI.seg([{ v: 'E', l: '我是 ' + UI.person('E') }, { v: 'S', l: '我是 ' + UI.person('S') }], who, function (v) { who = v; whoErr.textContent = ''; });
    if (!who) Array.prototype.forEach.call(whoSeg.children, function (b) { b.setAttribute('aria-pressed', 'false'); });
    var whoErr = h('div', { class: 'err', style: 'color:var(--warn);font-size:13px;margin-top:4px' });
    var token = h('input', { class: 'input', id: 'token-input', type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'github_pat_…' });
    var show = h('label', { class: 'toggle', style: 'font-size:14px' }, h('input', { type: 'checkbox', onchange: function (e) { token.type = e.target.checked ? 'text' : 'password'; } }), '顯示 Token');
    var result = h('div');
    var tested = null;

    var testBtn = h('button', { class: 'btn block', id: 'test-btn', type: 'button', onclick: function () {
      var t = token.value.trim();
      result.innerHTML = '';
      if (!t) { result.appendChild(UI.errorBox('請先貼上 Token。')); return; }
      testBtn.disabled = true; testBtn.textContent = '連線測試中…';
      new W.GitHubStore(cfg, t).testConnection().then(function (r) {
        testBtn.disabled = false; testBtn.textContent = '連線測試'; tested = r.ok ? t : null; startBtn.disabled = !r.ok;
        result.innerHTML = '';
        if (r.ok) {
          result.appendChild(h('div', { class: 'okbox' }, h('b', null, '連線成功。'), h('div', null, r.meta ? '讀到資料：' + (r.meta.title || '（未命名）') : ''), r.note ? h('div', { style: 'margin-top:4px' }, r.note) : null));
        } else result.appendChild(h('div', { class: 'errbox' }, h('b', null, '連線失敗'), h('div', { style: 'margin-top:4px' }, r.message),
          h('div', { class: 'small muted', style: 'margin-top:6px' }, '可能原因：Token 貼錯（多了空白或少了字）、沒授權到 wedding-data、權限不是 Contents 讀寫、或網路不通。')));
      });
    } }, '連線測試');
    var startBtn = h('button', { class: 'btn primary block', id: 'start-btn', type: 'button', disabled: true, onclick: function () {
      if (!who) { whoErr.textContent = '請先選「我是誰」。'; return; }
      A.saveSettings({ who: who, token: tested || token.value.trim() }); A.restart(); UI.toast('已切換成正式模式');
      A.go(o.firstRun ? 'overview' : 'settings');
    } }, '用這組 Token 開始（正式模式）');

    wrap.appendChild(h('div', { class: 'field' }, h('div', { class: 'lbl' }, '我是誰'), whoSeg, whoErr));
    if (A.settings.token && !o.firstRun) wrap.appendChild(h('div', { class: 'small muted', style: 'margin-bottom:10px' }, '目前已設定 Token（尾碼 …' + A.settings.token.slice(-4) + '）。貼上新的 Token 可更換。'));
    wrap.appendChild(h('div', { class: 'field' }, h('label', { for: 'token-input' }, '資料連線 Token（GitHub fine-grained token）'), token, show,
      h('div', { class: 'hint' }, 'Token 只存在這台裝置。只需授權 wedding-data 這個資料庫的「Contents：Read and write」。沒有 Token 也可以先用示範模式。')));
    wrap.appendChild(testBtn); wrap.appendChild(h('div', { style: 'height:10px' })); wrap.appendChild(result); wrap.appendChild(startBtn);
    if (o.firstRun) wrap.appendChild(h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', id: 'demo-btn', type: 'button', onclick: function () {
      if (!who) { whoErr.textContent = '請先選「我是誰」。'; return; }
      A.saveSettings({ who: who, token: '' }); A.restart(); A.go('overview');
    } }, '先用示範模式看看')));
    else if (who !== A.settings.who || true) wrap.appendChild(h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: function () {
      if (!who) { whoErr.textContent = '請先選「我是誰」。'; return; }
      A.saveSettings({ who: who }); A.who = who; if (A.sync) A.sync.who = who; UI.toast('已儲存：我是 ' + UI.person(who));
    } }, '只儲存「我是誰」')));
    return wrap;
  }

  W.views.setupFirstRun = function () {
    return h('div', { class: 'setup' },
      h('div', { class: 'brand' }, h('img', { class: 'logo', src: 'icons/icon-192.png', alt: '', width: 72, height: 72 }), h('h2', null, cfg.appName), h('div', { class: 'muted' }, '兩個人一起規劃婚禮的小工具')),
      h('section', { class: 'card' }, h('h2', null, '第一次使用'), setupForm({ firstRun: true })));
  };

  R.settings = { title: '設定', tab: 'more', parent: 'more', render: function (el) {
    var A = W.app, st = A.store;
    function kv(k, v) { return h('div', { class: 'kv' }, h('span', null, k), h('b', { style: 'text-align:right' }, v)); }
    var modeText = A.mode === 'live' ? '正式模式（同步到資料庫）' : A.mode === 'demo' ? '示範模式（虛構資料，只存本機）' : '預覽模式';
    var info = UI.card('目前狀態', null, null, h('div', null, kv('模式', modeText), kv('我是', UI.person(A.who)), kv('同步', A.statusInfo().text),
      A.mode === 'live' ? kv('待送變更', st.pendingCount() + ' 筆') : null, A.mode === 'live' ? kv('上次同步', st.lastSync ? U.relTime(new Date(st.lastSync).toISOString()) : '尚未') : null));
    el.appendChild(info);
    if (U.storage.failed) el.appendChild(h('div', { class: 'errbox' }, '這個瀏覽器無法使用本機儲存（可能是無痕模式）。資料只會暫存在記憶體，關閉後會消失。'));
    if (A.sync && A.sync.getStatus().error) el.appendChild(h('div', { class: 'errbox' }, h('b', null, '同步發生問題'), h('div', null, A.sync.getStatus().error)));
    if (A.mode === 'live') el.appendChild(h('div', { class: 'btn-row', style: 'margin:0 0 12px' }, h('button', { class: 'btn primary', type: 'button', onclick: function () { A.sync.syncNow(); UI.toast('開始同步…'); } }, '立即同步')));

    if (A.mode !== 'preview') {
      el.appendChild(UI.card(A.mode === 'live' ? '身分與連線' : '切換成正式模式', null, null, setupForm({ firstRun: false })));
      if (A.mode === 'live') el.appendChild(h('div', { class: 'btn-row', style: 'margin:-4px 0 12px' }, h('button', { class: 'btn danger', type: 'button', onclick: function () {
        UI.confirm({ title: '回到示範模式？', message: '會移除這台裝置上的 Token。尚未送出的變更仍會留在本機正式資料中，重新貼上 Token 後會繼續送出。', okLabel: '回到示範模式', danger: true }).then(function (ok) { if (ok) { A.saveSettings({ token: '' }); A.restart(); UI.toast('已回到示範模式'); } });
      } }, '移除 Token，回到示範模式')));
    }

    var data = h('div', null, h('div', { class: 'btn-row', style: 'margin-top:0' }, h('button', { class: 'btn', type: 'button', onclick: A.exportAll }, '匯出全部資料（JSON）')));
    if (A.mode !== 'preview') data.appendChild(h('div', { class: 'btn-row' }, h('button', { class: 'btn danger', type: 'button', onclick: function () {
      var extra = A.mode === 'live' ? '尚未送出的 ' + st.pendingCount() + ' 筆變更會遺失；資料庫上的資料不受影響，之後會重新下載。' : '示範資料會重置成原本的內容。';
      UI.confirm({ title: '清除本機資料？', message: extra, okLabel: '清除', danger: true }).then(function (ok) {
        if (!ok) return;
        st.clear();
        if (A.mode === 'demo') A.loadSample(); else { A.restart(); }
        UI.toast('已清除本機資料');
      });
    } }, A.mode === 'demo' ? '重置示範資料' : '清除本機資料')));
    el.appendChild(UI.card('資料', null, null, data));
    el.appendChild(UI.card('關於', null, null, h('div', null, kv('版本', cfg.version), kv('資料庫', A.mode === 'live' ? cfg.owner + '/' + cfg.repo : '（正式模式才連線）'), h('div', { class: 'small muted', style: 'margin-top:6px' }, '資料依「id 聯集、較新者勝」合併，刪除會保留墓碑，兩個人同時使用不會互相覆蓋。'))));
  } };
})(window);
