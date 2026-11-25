/* 婚禮手帳 — 設定。外殼不含任何真實資料；真實資料在私有 repo。 */
(function (root) {
  var W = root.WApp = root.WApp || {};
  W.config = {
    owner: 'Eugene-KBS',
    repo: 'wedding-data',
    branch: 'main',
    dir: 'data',
    // 以下為 App 內部設定
    appName: '婚禮手帳',
    version: '0.2.0',
    people: { E: '新郎', S: '新娘' },
    pushDelayMs: 1500,
    pollMs: 90000
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = W.config;
})(typeof window !== 'undefined' ? window : globalThis);
