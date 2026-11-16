/* 工具：日期、金額、CSV、base64(UTF-8)、安全的 localStorage */
(function (root) {
  var W = root.WApp = root.WApp || {};
  var U = {};

  U.uid = function (prefix) {
    return (prefix || 'r') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  };
  U.nowIso = function () { return new Date().toISOString(); };
  U.clone = function (o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); };
  U.pad = function (n) { return (n < 10 ? '0' : '') + n; };

  /* ---- 日期（皆以 YYYY-MM-DD 字串處理，避免時區問題） ---- */
  U.isDateStr = function (s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var p = s.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
  };
  U.isTimeStr = function (s) { return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s); };
  U.isIso = function (s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(s) && !isNaN(Date.parse(s)); };
  U.todayStr = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate());
  };
  U.dayNum = function (s) {
    var p = s.split('-').map(Number);
    return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000);
  };
  U.daysBetween = function (from, to) { return U.dayNum(to) - U.dayNum(from); };
  var WD = ['日', '一', '二', '三', '四', '五', '六'];
  U.weekday = function (s) { return WD[new Date(U.dayNum(s) * 86400000).getUTCDay()]; };
  U.fmtDate = function (s) {
    if (!U.isDateStr(s)) return '';
    return s.replace(/-/g, '/') + '（' + U.weekday(s) + '）';
  };
  U.fmtShortDate = function (s) {
    if (!U.isDateStr(s)) return '';
    var p = s.split('-');
    return Number(p[1]) + '/' + Number(p[2]);
  };
  U.fmtMonthLabel = function (ym) {
    var p = ym.split('-');
    return p[0] + ' 年 ' + Number(p[1]) + ' 月';
  };
  U.relTime = function (iso, now) {
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var diff = ((now || Date.now()) - t) / 1000;
    if (diff < 60) return '剛剛';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分鐘前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小時前';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' 天前';
    var d = new Date(t);
    return (d.getMonth() + 1) + '/' + d.getDate();
  };

  /* ---- 金額 ---- */
  U.fmtNum = function (n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    var s = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n < 0 ? '-' : '') + s;
  };
  U.fmtMoney = function (n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return (n < 0 ? '-' : '') + 'NT$ ' + U.fmtNum(Math.abs(n));
  };
  U.toInt = function (v, dflt) {
    if (v === null || v === undefined || v === '') return dflt;
    var n = Number(String(v).replace(/[,，\s]/g, ''));
    return isFinite(n) ? Math.round(n) : dflt;
  };

  U.debounce = function (fn, ms) {
    var t;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  };

  /* ---- base64（UTF-8，中文可來回） ---- */
  U.utf8ToB64 = function (str) {
    var bytes = new TextEncoder().encode(str), bin = '', i, CH = 0x8000;
    for (i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  };
  U.b64ToUtf8 = function (b64) {
    var bin = atob(String(b64).replace(/\s/g, '')), bytes = new Uint8Array(bin.length), i;
    for (i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  };

  /* ---- CSV ---- */
  U.parseCsv = function (text) {
    text = String(text || '').replace(/^﻿/, '');
    var delim = text.indexOf('\t') >= 0 ? '\t' : (text.indexOf(',') >= 0 ? ',' : (text.indexOf('，') >= 0 ? '，' : ','));
    var rows = [], row = [], cell = '', q = false, i, c;
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"' && cell === '') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        rows.push(row); row = [];
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); })
      .map(function (r) { return r.map(function (x) { return String(x).trim(); }); });
  };
  U.toCsv = function (rows) {
    return rows.map(function (r) {
      return r.map(function (c) {
        c = c === null || c === undefined ? '' : String(c);
        return /[",\n\r]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
      }).join(',');
    }).join('\r\n');
  };

  /* ---- 安全的儲存：localStorage 失敗時退回記憶體 ---- */
  U.makeStorage = function (backend) {
    var mem = {}, api = { failed: false };
    api.get = function (k) {
      try { if (backend) { var v = backend.getItem(k); if (v !== null && v !== undefined) return v; } } catch (e) { api.failed = true; }
      return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
    };
    api.set = function (k, v) {
      mem[k] = String(v);
      try { if (backend) backend.setItem(k, String(v)); } catch (e) { api.failed = true; }
    };
    api.remove = function (k) {
      delete mem[k];
      try { if (backend) backend.removeItem(k); } catch (e) { api.failed = true; }
    };
    api.keys = function () {
      var out = [], i;
      try { if (backend) for (i = 0; i < backend.length; i++) out.push(backend.key(i)); } catch (e) { api.failed = true; }
      Object.keys(mem).forEach(function (k) { if (out.indexOf(k) < 0) out.push(k); });
      return out;
    };
    api.getJSON = function (k, dflt) {
      var s = api.get(k);
      if (s === null) return dflt;
      try { return JSON.parse(s); } catch (e) { return dflt; }
    };
    api.setJSON = function (k, v) { api.set(k, JSON.stringify(v)); };
    return api;
  };
  var backend = null;
  try { if (typeof localStorage !== 'undefined') { localStorage.getItem('__t'); backend = localStorage; } } catch (e) { backend = null; }
  U.storage = U.makeStorage(backend);

  W.util = U;
  if (typeof module !== 'undefined' && module.exports) module.exports = U;
})(typeof window !== 'undefined' ? window : globalThis);
