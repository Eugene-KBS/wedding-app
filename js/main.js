/* 啟動、路由、同步狀態、Service Worker */
(function (root) {
  var W = root.WApp = root.WApp || {};
  var U = W.util, UI = W.ui, h = UI.h, S = W.schema, cfg = W.config;
  var A = W.app = { views: (W.routes = W.routes || {}), state: {}, mode: 'demo', who: 'E', store: null, sync: null, settings: {}, sampleError: null, sampleLoading: false };

  var SETTINGS_KEY = 'wapp:settings';
  var TABS = [
    { id: 'overview', label: '總覽', icon: 'overview' }, { id: 'tasks', label: '待辦', icon: 'tasks' },
    { id: 'budget', label: '預算', icon: 'budget' }, { id: 'guests', label: '賓客', icon: 'guests' }, { id: 'more', label: '更多', icon: 'more' }
  ];
  A.TABS = TABS;

  /* ---------- 設定（每台裝置各自保存） ---------- */
  A.loadSettings = function () { return U.storage.getJSON(SETTINGS_KEY, {}) || {}; };
  A.saveSettings = function (patch) {
    A.settings = Object.assign({}, A.settings, patch);
    U.storage.setJSON(SETTINGS_KEY, A.settings);
    return A.settings;
  };

  /* ---------- 路由：hash 只用英數與連字號，其他狀態放記憶體 ---------- */
  function hashName() {
    var n = '';
    try { n = (root.location.hash || '').replace(/^#/, ''); } catch (e) { n = ''; }
    return /^[a-z0-9-]+$/.test(n) && A.views[n] ? n : '';
  }
  A.routeName = function () { return (A.currentRoute && A.views[A.currentRoute]) ? A.currentRoute : (hashName() || 'overview'); };
  /* 頁面切換不依賴網址：狀態放記憶體，hash 只是盡力同步（沙盒 iframe 裡可能不能改） */
  A.go = function (name) {
    var same = A.currentRoute === name;
    A.currentRoute = name;
    UI.closeAllSheets();
    try { if (root.location.hash !== '#' + name) root.location.hash = '#' + name; } catch (e) { /* 忽略 */ }
    A.render(same);
  };
  A.needsSetup = function () { return A.mode !== 'preview' && !A.settings.who; };

  A.render = function (keepScroll) {
    var viewEl = document.getElementById('view'), titleEl = document.getElementById('title'), backEl = document.getElementById('back');
    var active = document.activeElement, focusId = active && active.id, selS = null, selE = null, y = root.scrollY;
    if (focusId && active.selectionStart !== undefined) { selS = active.selectionStart; selE = active.selectionEnd; }
    var tabbar = document.getElementById('tabbar');
    viewEl.innerHTML = '';
    if (A.needsSetup()) {
      titleEl.textContent = cfg.appName; backEl.hidden = true; tabbar.style.display = 'none';
      A.renderBanner(); A.renderStatus();
      viewEl.appendChild(W.views.setupFirstRun());
      return;
    }
    tabbar.style.display = '';
    var name = A.routeName(), v = A.views[name];
    titleEl.textContent = v.title;
    document.title = v.title + '｜' + cfg.appName;
    backEl.hidden = !v.parent;
    backEl.onclick = function () { A.go(v.parent); };
    A.renderTabs(v.tab);
    A.renderBanner(); A.renderStatus();
    var gate = A.gate();
    try {
      if (gate) viewEl.appendChild(gate); else v.render(viewEl);
    } catch (e) {
      viewEl.appendChild(UI.errorBox('這個畫面發生錯誤：' + (e && e.message ? e.message : e), '回到總覽', function () { A.go('overview'); }));
      if (root.console) console.error(e);
    }
    if (keepScroll) root.scrollTo(0, y); else root.scrollTo(0, 0);
    if (focusId) { var again = document.getElementById(focusId); if (again) { again.focus(); try { if (selS !== null) again.setSelectionRange(selS, selE); } catch (e2) { /* ignore */ } } }
  };
  var refreshQueued = false;
  A.refresh = function () {
    if (refreshQueued) return; refreshQueued = true;
    requestAnimationFrame(function () { refreshQueued = false; A.render(true); });
  };

  /* 資料還沒備妥時的畫面：示範資料載入中／正式資料第一次下載 */
  A.gate = function () {
    if (A.mode === 'demo' && !A.store.hasCache) {
      if (A.sampleError) return UI.errorBox('示範資料載入失敗：' + A.sampleError, '重試', function () { A.loadSample(); });
      return UI.loading('載入示範資料…');
    }
    if (A.mode === 'live' && !A.store.hasCache && A.sync && !A.sync.firstPullDone) {
      if (A.sync.loadError) {
        var code = A.sync.loadError.code;
        return UI.errorBox('還沒能載入資料：' + W.GitHubStore.explain(code, A.sync.loadError.status), '重試', function () { A.sync.loadError = null; A.render(); A.sync.syncNow(); });
      }
      return UI.loading('正在下載資料…');
    }
    return null;
  };

  A.renderTabs = function (active) {
    var tb = document.getElementById('tabbar');
    tb.innerHTML = '';
    TABS.forEach(function (t) {
      tb.appendChild(h('a', { href: '#' + t.id, 'aria-current': t.id === active ? 'page' : null }, UI.icon(t.icon), h('span', null, t.label)));
    });
  };

  A.renderBanner = function () {
    var b = document.getElementById('banner'), keepUpdate = b.querySelector('.update');
    b.innerHTML = '';
    if (A.mode === 'preview') b.appendChild(h('div', { class: 'banner preview' }, '預覽模式：變更只存在這台裝置'));
    else if (A.mode === 'demo' && !A.needsSetup()) b.appendChild(h('div', { class: 'banner demo' }, '示範模式：虛構資料，只存在這台裝置、不會上傳。要用正式資料，到「更多 › 設定」貼上 Token。'));
    if (keepUpdate) b.appendChild(keepUpdate);
  };

  A.statusInfo = function () {
    if (A.mode === 'preview') return { s: 'preview', text: '預覽' };
    if (A.mode === 'demo') return { s: 'demo', text: '示範模式' };
    var st = A.sync ? A.sync.getStatus() : { status: 'idle', pending: 0 };
    switch (st.status) {
      case 'synced': return { s: 'synced', text: '已同步' };
      case 'syncing': return { s: 'syncing', text: '同步中…' };
      case 'offline': return { s: 'offline', text: '離線（' + st.pending + ' 筆待送）' };
      case 'error': return { s: 'error', text: '同步錯誤' };
      default: return { s: 'syncing', text: st.pending ? '待送 ' + st.pending + ' 筆' : '連線中…' };
    }
  };
  A.renderStatus = function () {
    var el = document.getElementById('status'), i = A.statusInfo();
    if (A.needsSetup()) { el.hidden = true; return; }
    el.hidden = false; el.textContent = i.text; el.setAttribute('data-s', i.s);
  };
  A.onStatusClick = function () {
    if (A.mode === 'demo') return A.go('settings');
    if (A.mode === 'preview') return UI.toast('預覽模式：變更只存在這台裝置');
    var st = A.sync.getStatus(), sheet = UI.sheet({ title: '同步狀態' });
    var i = A.statusInfo();
    sheet.body.appendChild(h('div', { class: 'kv' }, h('span', null, '狀態'), h('b', null, i.text)));
    sheet.body.appendChild(h('div', { class: 'kv' }, h('span', null, '待送變更'), h('b', null, st.pending + ' 筆')));
    sheet.body.appendChild(h('div', { class: 'kv' }, h('span', null, '上次同步'), h('b', null, st.lastSync ? U.relTime(new Date(st.lastSync).toISOString()) : '尚未')));
    if (st.error) sheet.body.appendChild(h('div', { class: 'errbox', style: 'margin-top:10px' }, st.error));
    sheet.foot.appendChild(h('button', { class: 'btn', type: 'button', onclick: function () { sheet.close(); } }, '關閉'));
    sheet.foot.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { A.sync.syncNow(); sheet.close(); UI.toast('開始同步…'); } }, '立即同步'));
  };

  /* ---------- 示範資料 ---------- */
  A.loadSample = function () {
    A.sampleError = null; A.sampleLoading = true;
    var files = {};
    return Promise.all(S.FILES.map(function (n) {
      return fetch('sample/' + n + '.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(n + '.json（' + r.status + '）'); return r.json(); }).then(function (j) { files[n] = j; });
    })).then(function () { A.sampleLoading = false; A.store.seed(files); }, function (e) { A.sampleLoading = false; A.sampleError = e && e.message ? e.message : String(e); A.render(); });
  };

  /* ---------- 匯出全部 ---------- */
  A.exportAll = function () {
    var text = JSON.stringify({ app: cfg.appName, version: cfg.version, exportedAt: U.nowIso(), mode: A.mode, files: A.store.allFiles() }, null, 2);
    UI.exportPanel({ title: '匯出全部資料', filename: 'wedding-backup-' + U.todayStr() + '.json', text: text, mime: 'application/json' });
  };

  /* ---------- 啟動 ---------- */
  A.stop = function () {
    if (A.sync) { A.sync.stop(); A.sync = null; }
    if (A.unsub) { A.unsub(); A.unsub = null; }
  };
  A.start = function () {
    A.stop();
    var pv = root.WAPP_PREVIEW;
    if (pv) {
      A.mode = 'preview'; A.who = 'E'; A.settings = { who: 'E' };
      A.store = new W.Store({ ns: 'preview', storage: U.makeStorage(null) });
      A.store.seed(pv.files || {});
    } else {
      A.settings = A.loadSettings();
      A.who = A.settings.who === 'S' ? 'S' : 'E';
      if (A.settings.token) {
        A.mode = 'live';
        A.store = new W.Store({ ns: 'live' });
        A.sync = new W.Sync(store_(), new W.GitHubStore(cfg, A.settings.token), { who: A.who, pushDelayMs: cfg.pushDelayMs, pollMs: cfg.pollMs });
        A.sync.onStatus(function () { A.renderStatus(); if (A.gate() || A.gateWas) { A.gateWas = !!A.gate(); A.refresh(); } });
        A.gateWas = !!A.gate();
      } else {
        A.mode = 'demo';
        A.store = new W.Store({ ns: 'demo' });
        if (!A.store.hasCache) A.loadSample();
      }
    }
    A.unsub = A.store.subscribe(function () { A.refresh(); });
    if (A.sync) A.sync.start();
    A.render();
  };
  function store_() { return A.store; }

  A.restart = function () { UI.closeAllSheets(); A.start(); };

  /* ---------- Service Worker ---------- */
  function registerSW() {
    try {
      if (A.mode === 'preview' || !('serviceWorker' in navigator) || !/^https?:$/.test(root.location.protocol)) return;
      navigator.serviceWorker.register('sw.js', { scope: './' }).then(function (reg) {
        function offer(worker) {
          var b = document.getElementById('banner');
          if (b.querySelector('.update')) return;
          b.appendChild(h('div', { class: 'banner update' }, h('span', null, '有新版本可用'),
            h('button', { class: 'btn sm primary', type: 'button', onclick: function () { worker.postMessage('skipWaiting'); } }, '重新整理')));
        }
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.addEventListener('updatefound', function () {
          var nw = reg.installing;
          if (nw) nw.addEventListener('statechange', function () { if (nw.state === 'installed' && navigator.serviceWorker.controller) offer(nw); });
        });
        var reloaded = false, hadController = !!navigator.serviceWorker.controller;
        navigator.serviceWorker.addEventListener('controllerchange', function () { if (reloaded || !hadController) return; reloaded = true; root.location.reload(); });
        setInterval(function () { try { reg.update(); } catch (e) { /* ignore */ } }, 3600000);
      }).catch(function () { /* 靜默略過 */ });
    } catch (e) { /* 靜默略過 */ }
  }

  function boot() {
    try {
      UI.watchKeyboard();
      document.getElementById('status').addEventListener('click', A.onStatusClick);
      root.addEventListener('hashchange', function () { var n = hashName(); if (n && n !== A.currentRoute) { A.currentRoute = n; UI.closeAllSheets(); A.render(false); } });
      document.addEventListener('click', function (e) {
        var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
        if (!a) return;
        var n = a.getAttribute('href').slice(1);
        if (A.views[n]) { e.preventDefault(); A.go(n); }
      });
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && A.sync) A.sync.syncNow(true); });
      root.addEventListener('online', function () { if (A.sync) A.sync.syncNow(true); });
      root.addEventListener('offline', function () { if (A.sync) { A.sync.set('offline'); } });
      A.start();
      registerSW();
    } catch (e) {
      var v = document.getElementById('view');
      v.textContent = '啟動失敗：' + (e && e.message ? e.message : e);
      if (root.console) console.error(e);
    }
  }
  A.boot = boot;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  }
})(window);
