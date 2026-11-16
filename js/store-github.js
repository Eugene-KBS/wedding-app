/* GitHub Contents API 存取（資料 repo）。fetchImpl 可注入，方便測試。 */
(function (root) {
  var W = root.WApp = root.WApp || {};
  function U() { return W.util; }

  function GHError(code, status, msg) {
    var e = new Error(msg || code);
    e.code = code; e.status = status || 0;
    return e;
  }

  function GH(cfg, token, fetchImpl) {
    this.cfg = cfg;
    this.token = String(token || '').trim();
    this.fetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(root) : null);
  }
  var P = GH.prototype;

  P.base = function () { return 'https://api.github.com/repos/' + this.cfg.owner + '/' + this.cfg.repo; };
  P.fileUrl = function (name, withRef) {
    return this.base() + '/contents/' + this.cfg.dir + '/' + name + '.json' + (withRef ? '?ref=' + encodeURIComponent(this.cfg.branch) : '');
  };
  P.headers = function (extra) {
    return Object.assign({
      'Authorization': 'Bearer ' + this.token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }, extra || {});
  };

  P.request = function (url, init) {
    var self = this;
    if (!this.fetch) return Promise.reject(GHError('network', 0, '此環境無法連線'));
    init = Object.assign({ cache: 'no-store' }, init || {});
    return this.fetch(url, init).then(function (res) {
      if (res.ok) return res;
      var code = 'http';
      if (res.status === 401) code = 'auth';
      else if (res.status === 403) {
        var rem = res.headers && res.headers.get && res.headers.get('x-ratelimit-remaining');
        code = rem === '0' ? 'ratelimit' : 'forbidden';
      } else if (res.status === 404) code = 'notfound';
      else if (res.status === 429) code = 'ratelimit';
      else if (res.status === 409 || res.status === 422) code = 'conflict';
      throw GHError(code, res.status, 'HTTP ' + res.status);
    }, function () { throw GHError('network', 0, '網路錯誤'); });
  };

  /* 讀單一檔案 → {status:'ok', data, sha} 或 {status:'missing'} */
  P.readFile = function (name) {
    var self = this;
    return this.request(this.fileUrl(name, true), { headers: this.headers() }).then(function (res) {
      return res.json();
    }).then(function (j) {
      if (j.encoding === 'base64' && typeof j.content === 'string' && j.content) return j;
      return self.request(self.fileUrl(name, true), { headers: self.headers({ Accept: 'application/vnd.github.raw+json' }) })
        .then(function (r) { return r.text(); }).then(function (t) { return { raw: t, sha: j.sha }; });
    }).then(function (j) {
      var text = j.raw !== undefined ? j.raw : U().b64ToUtf8(j.content), data;
      try { data = JSON.parse(text); } catch (e) { throw GHError('parse', 0, name + '.json 不是有效的 JSON'); }
      return { status: 'ok', data: data, sha: j.sha };
    }).catch(function (e) {
      if (e && e.code === 'notfound') return { status: 'missing' };
      throw e;
    });
  };

  /* 列出資料夾 → {檔名(不含.json): sha}；資料夾不存在視為空 */
  P.listDir = function () {
    var url = this.base() + '/contents/' + this.cfg.dir + '?ref=' + encodeURIComponent(this.cfg.branch);
    return this.request(url, { headers: this.headers() }).then(function (res) { return res.json(); }).then(function (arr) {
      var o = {};
      (Array.isArray(arr) ? arr : []).forEach(function (f) { if (f && /\.json$/.test(f.name)) o[f.name.replace(/\.json$/, '')] = f.sha; });
      return o;
    }).catch(function (e) { if (e && e.code === 'notfound') return {}; throw e; });
  };

  /* 寫單一檔案（一次 PUT）→ {sha} */
  P.writeFile = function (name, obj, sha, message) {
    var body = { message: message, content: U().utf8ToB64(JSON.stringify(obj, null, 2) + '\n'), branch: this.cfg.branch };
    if (sha) body.sha = sha;
    return this.request(this.fileUrl(name, false), {
      method: 'PUT', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body)
    }).then(function (res) { return res.json(); }).then(function (j) {
      return { sha: j && j.content && j.content.sha };
    });
  };

  /* 寫入並處理衝突：409／422 → 重抓 → 逐筆合併 → 重試，最多 3 次。
     opts: {sha, message, localCatIds} → {data(合併後內容), sha, retries} */
  P.writeMerged = function (name, local, opts) {
    var self = this, retries = 0;
    opts = opts || {};
    function attempt(payload, sha) {
      return self.writeFile(name, payload, sha, opts.message || ('app: ' + name)).then(function (r) {
        return { data: payload, sha: r.sha, retries: retries };
      }, function (e) {
        if (e && e.code === 'conflict' && retries < 3) {
          retries++;
          return self.readFile(name).then(function (rem) {
            if (rem.status === 'ok') return attempt(W.merge.mergeFile(name, payload, rem.data, { localCatIds: true }), rem.sha);
            return attempt(payload, undefined);
          });
        }
        throw e;
      });
    }
    return attempt(local, opts.sha);
  };

  /* 連線測試：讀 data/meta.json。回傳 {ok, meta, note} 或 {ok:false, code, message} */
  P.testConnection = function () {
    var self = this;
    if (!this.token) return Promise.resolve({ ok: false, code: 'notoken', message: GH.explain('notoken') });
    return this.readFile('meta').then(function (r) {
      if (r.status === 'ok') {
        return self.request(self.base(), { headers: self.headers() }).then(function (res) { return res.json(); }).then(function (repo) {
          var warn = repo && repo.permissions && repo.permissions.push === false ? GH.explain('readonly') : '';
          return { ok: true, meta: r.data, note: warn };
        }, function () { return { ok: true, meta: r.data, note: '' }; });
      }
      return self.request(self.base(), { headers: self.headers() }).then(function () {
        return { ok: true, meta: null, note: '已連上資料庫，但裡面還沒有 meta.json（第一次儲存時會自動建立）。' };
      });
    }).catch(function (e) {
      var code = e && e.code ? e.code : 'unknown';
      return { ok: false, code: code, status: e && e.status, message: GH.explain(code, e && e.status) };
    });
  };

  GH.explain = function (code, status) {
    switch (code) {
      case 'notoken': return '還沒有貼上 Token。';
      case 'auth': return 'Token 不正確或已過期（401）。請回 GitHub 重新複製一次，前後不要有空白或換行。';
      case 'forbidden': return '沒有權限（403）。常見原因：Token 的權限不是「Contents：Read and write」，或 Token 沒有授權給 wedding-data 這個資料庫。';
      case 'ratelimit': return '請求太頻繁，GitHub 暫時擋住了。等幾分鐘再試。';
      case 'notfound': return '找不到資料庫（404）。GitHub 對「沒授權的私有資料庫」也會回 404，所以多半是：Token 沒有選到 wedding-data，或 Token 貼錯了。';
      case 'network': return '連不上 GitHub。請確認 Wi-Fi 或行動數據，稍後再試。';
      case 'conflict': return '同時有人在修改，自動重試後仍然失敗。請稍後按「立即同步」。';
      case 'parse': return '資料檔內容格式不對，無法讀取。請通知婚顧檢查資料檔。';
      case 'readonly': return '已連上，但這組 Token 似乎只有讀取權限，儲存會失敗。請改成「Contents：Read and write」。';
      default: return '發生未預期的錯誤' + (status ? '（' + status + '）' : '') + '。請稍後再試。';
    }
  };
  GH.Error = GHError;

  W.GitHubStore = GH;
  if (typeof module !== 'undefined' && module.exports) { require('./util.js'); require('./merge.js'); module.exports = GH; }
})(typeof window !== 'undefined' ? window : globalThis);
