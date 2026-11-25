/* 原生 App 手感：鎖定縮放、按壓回饋、左緣右滑返回、下拉同步、背景自動換新版 */
(function (root) {
  var W = root.WApp = root.WApp || {};
  var UI = W.ui, N = W.native = {};
  var nav = root.navigator || {};

  /* 是否從主畫面圖示開啟（獨立視窗，沒有瀏覽器的返回手勢） */
  N.standalone = !!nav.standalone || !!(root.matchMedia && root.matchMedia('(display-mode: standalone)').matches);

  function iosVersion() {
    var m = /OS (\d+)[_.](\d+)/.exec(nav.userAgent || '');
    return m ? parseInt(m[1], 10) + parseInt(m[2], 10) / 100 : 0;
  }
  /* iOS 17.4+／Safari 支援 <input switch> 原生開關 */
  N.hasSwitch = (function () {
    try { if ('switch' in document.createElement('input')) return true; } catch (e) { /* ignore */ }
    return !!(UI && UI.isIOS && iosVersion() >= 17.04);
  })();

  /* 1. 鎖定縮放：iOS Safari 會忽略 user-scalable=no，再擋 WebKit 的手勢事件與多指移動 */
  function lockZoom() {
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) {
      document.addEventListener(t, function (e) { if (e.cancelable) e.preventDefault(); }, { passive: false });
    });
    document.addEventListener('touchmove', function (e) {
      if (e.touches && e.touches.length > 1 && e.cancelable) e.preventDefault();
    }, { passive: false });
  }

  /* 2. 按壓回饋：按住約 70ms 才變暗、一開始捲動就取消，避免捲清單時整排閃爍 */
  var PRESSABLE = '.btn, .chip, .seg button, .item.tap, .item .main.tap, .menu a, a.row, #tabbar a, .back-btn, .icon-btn, .check, .move button, .status-chip, .fab, .card > h2 a, .sheet-head .x';
  function pressFeedback() {
    var el = null, timer = null, sx = 0, sy = 0;
    function drop(target, delay) {
      clearTimeout(timer);
      if (!target) return;
      if (delay) setTimeout(function () { target.classList.remove('pressed'); }, delay); else target.classList.remove('pressed');
    }
    document.addEventListener('touchstart', function (e) {
      var prev = el; el = null; drop(prev);
      if (e.touches.length !== 1) return;
      var t = e.target && e.target.closest ? e.target.closest(PRESSABLE) : null;
      if (!t || t.disabled) return;
      el = t; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
      timer = setTimeout(function () { if (el === t) t.classList.add('pressed'); }, 70);
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!el) return;
      var p = e.touches[0];
      if (Math.abs(p.clientX - sx) > 8 || Math.abs(p.clientY - sy) > 8) { var x = el; el = null; drop(x); }
    }, { passive: true });
    document.addEventListener('touchend', function () {
      if (!el) return;
      var x = el; el = null; clearTimeout(timer);
      x.classList.add('pressed'); drop(x, 130);
    }, { passive: true });
    document.addEventListener('touchcancel', function () { var x = el; el = null; drop(x); }, { passive: true });
  }

  /* 3. 左緣右滑返回上一層：只在主畫面 App 裡啟用（Safari 分頁本身已有返回手勢，避免打架） */
  function edgeSwipe(A) {
    var view = document.getElementById('view'), s = null, dx = 0, on = false;
    function reset() { view.classList.remove('swiping'); view.style.transition = ''; view.style.transform = ''; }
    view.addEventListener('touchstart', function (e) {
      s = null;
      if (!N.standalone || e.touches.length !== 1 || document.body.classList.contains('sheet-open')) return;
      var v = A.views[A.routeName()], t = e.touches[0];
      if (!v || !v.parent || t.clientX > 24) return;
      s = { x: t.clientX, y: t.clientY, t: Date.now(), parent: v.parent }; dx = 0; on = false;
    }, { passive: true });
    view.addEventListener('touchmove', function (e) {
      if (!s) return;
      var t = e.touches[0], mx = t.clientX - s.x, my = t.clientY - s.y;
      if (!on) {
        if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { s = null; return; }
        if (mx < 10) return;
        on = true; view.classList.add('swiping'); view.style.transition = 'none';
      }
      if (e.cancelable) e.preventDefault();
      dx = Math.max(0, mx);
      view.style.transform = 'translate3d(' + dx + 'px,0,0)';
    }, { passive: false });
    function end() {
      if (!s) return;
      var st = s; s = null;
      if (!on) return;
      var w = view.clientWidth || root.innerWidth, speed = dx / Math.max(1, Date.now() - st.t);
      view.style.transition = 'transform .2s ease-out';
      if (dx > w * 0.33 || (speed > 0.5 && dx > 40)) {
        view.style.transform = 'translate3d(' + w + 'px,0,0)';
        setTimeout(function () { reset(); A.go(st.parent, { anim: 'pop' }); }, 190);
      } else {
        view.style.transform = 'translate3d(0,0,0)';
        setTimeout(reset, 210);
      }
    }
    view.addEventListener('touchend', end);
    view.addEventListener('touchcancel', end);
  }

  /* 4. 下拉同步：iPhone 拉到頂再往下拉會回彈（scrollTop 變負值），超過門檻放開就立即同步（只在正式模式） */
  var PULL = 64;
  function pullToSync(A) {
    var view = document.getElementById('view'), ptr = A.ptrEl, armed = false, touching = false, busy = false;
    function label(s, text) { if (s) ptr.setAttribute('data-s', s); else ptr.removeAttribute('data-s'); ptr.lastChild.textContent = text; }
    view.addEventListener('touchstart', function () { touching = true; }, { passive: true });
    view.addEventListener('scroll', function () {
      if (busy || A.mode !== 'live') return;
      var y = view.scrollTop;
      if (y >= 0 || !touching) { if (y >= 0 && armed) { armed = false; label('', '下拉同步'); } return; }
      var a = -y >= PULL;
      if (a !== armed || !ptr.hasAttribute('data-s')) { armed = a; label(a ? 'armed' : 'pull', a ? '放開立即同步' : '下拉同步'); }
    }, { passive: true });
    function release() {
      touching = false;
      if (!armed || busy || A.mode !== 'live' || !A.sync) return;
      armed = false; busy = true;
      if (UI && UI.haptic) UI.haptic();
      label('busy', '同步中…');
      function done() { busy = false; label('', '下拉同步'); }
      Promise.resolve(A.sync.syncNow()).then(done, done);
    }
    view.addEventListener('touchend', release, { passive: true });
    view.addEventListener('touchcancel', function () { touching = false; armed = false; }, { passive: true });
  }
  N.PULL = PULL;

  /* 5. 新版本：下載好之後，App 切到背景（且沒有開著的表單）就自動換版，下次打開即是新版 */
  N.waiting = null;
  function autoUpdate() {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'hidden' || !N.waiting || document.body.classList.contains('sheet-open')) return;
      try { N.waiting.postMessage('skipWaiting'); } catch (e) { /* ignore */ }
      N.waiting = null;
    });
  }

  N.init = function (A) {
    var de = document.documentElement;
    if (N.standalone) de.classList.add('standalone');
    if (N.hasSwitch) de.classList.add('has-switch');
    lockZoom(); pressFeedback(); edgeSwipe(A); pullToSync(A); autoUpdate();
  };
})(window);
