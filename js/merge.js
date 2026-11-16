/* 合併規則：以 id 聯集；同 id 取 updatedAt 較新者；墓碑保留 */
(function (root) {
  var W = root.WApp = root.WApp || {};
  var M = {};

  function ts(r) { var t = Date.parse(r && r.updatedAt); return isNaN(t) ? 0 : t; }

  /* a 與 b 擇一：較新者勝；時間相同時墓碑勝，再相同則取字串較大者（讓結果與順序無關） */
  M.pick = function (a, b) {
    var ta = ts(a), tb = ts(b);
    if (ta !== tb) return ta > tb ? a : b;
    if (!!a.deleted !== !!b.deleted) return a.deleted ? a : b;
    return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
  };

  M.mergeRecords = function (local, remote) {
    var out = [], idx = {};
    (local || []).forEach(function (r) {
      if (!r || !r.id) return;
      if (idx[r.id] === undefined) { idx[r.id] = out.length; out.push(r); }
      else out[idx[r.id]] = M.pick(out[idx[r.id]], r);
    });
    (remote || []).forEach(function (r) {
      if (!r || !r.id) return;
      if (idx[r.id] === undefined) { idx[r.id] = out.length; out.push(r); }
      else out[idx[r.id]] = M.pick(out[idx[r.id]], r);
    });
    return out;
  };

  /* 預算分類：以 id 聯集。
     localCatIds === true：本機全部優先（推送時，本機是後寫者）
     localCatIds 為陣列／Set：只有這些 id 本機優先，其餘以遠端為準（拉取時，本機尚未送出的才優先）
     已刪除（deleted:true 墓碑）者，任一邊刪除即視為刪除。 */
  M.mergeCategories = function (local, remote, localCatIds) {
    var out = [], idx = {}, set = localCatIds === true ? null : new Set(localCatIds || []);
    function localWins(id) { return set === null ? true : set.has(id); }
    (remote || []).forEach(function (c) { idx[c.id] = out.length; out.push(c); });
    (local || []).forEach(function (c) {
      if (idx[c.id] === undefined) { idx[c.id] = out.length; out.push(c); return; }
      var r = out[idx[c.id]], win = localWins(c.id) ? c : r;
      if (c.deleted || r.deleted) win = Object.assign({}, win, { deleted: true });
      out[idx[c.id]] = win;
    });
    return out;
  };

  M.mergeMeta = function (local, remote) {
    if (!local) return remote;
    if (!remote) return local;
    return M.pick(local, remote);
  };

  /* 合併整個檔案：local 是「較晚寫入者」 */
  M.mergeFile = function (name, local, remote, opts) {
    opts = opts || {};
    if (name === 'meta') return M.mergeMeta(local, remote);
    if (!remote) return local;
    if (!local) return remote;
    var out = { schemaVersion: local.schemaVersion || remote.schemaVersion || 1, records: M.mergeRecords(local.records, remote.records) };
    if (name === 'budget') out.categories = M.mergeCategories(local.categories, remote.categories, opts.localCatIds === undefined ? true : opts.localCatIds);
    return out;
  };

  W.merge = M;
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})(typeof window !== 'undefined' ? window : globalThis);
