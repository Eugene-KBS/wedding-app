/* 總覽 */
(function (root) {
  var W = root.WApp, U = W.util, UI = W.ui, h = UI.h, C = W.calc, S = W.schema;
  var R = W.routes = W.routes || {};

  R.overview = { title: '總覽', tab: 'overview', render: function (el) {
    var A = W.app, st = A.store, meta = st.meta(), today = U.todayStr();
    var days = C.countdown(meta.date, today);

    /* 倒數 */
    var hero = h('div', { class: 'hero' },
      h('div', { class: 't' }, meta.title || '我們的婚禮'),
      h('div', { class: 's' }, [meta.venue, meta.city].filter(Boolean).join('・') || '場地尚未設定'));
    if (days === null) hero.appendChild(h('div', { class: 'big', style: 'font-size:28px;margin-bottom:12px' }, '日期尚未設定'));
    else if (days > 0) hero.appendChild(h('div', { class: 'big' }, String(days), h('small', null, '天')));
    else if (days === 0) hero.appendChild(h('div', { class: 'big', style: 'font-size:40px' }, '就是今天'));
    else hero.appendChild(h('div', { class: 'big', style: 'font-size:34px' }, '已過 ' + (-days) + ' 天'));
    hero.appendChild(h('div', { class: 'sub' }, days === null ? '到「更多 › 婚禮資訊」設定日期' : U.fmtDate(meta.date) + (meta.time ? ' ' + meta.time : '')));
    el.appendChild(hero);

    /* 近期待辦 */
    var open = st.list('tasks').filter(function (t) { return !t.done; }).sort(function (a, b) { return String(a.due || '9999').localeCompare(String(b.due || '9999')); });
    var overdue = open.filter(function (t) { return C.dueState(t.due, today).state === 'overdue'; }).length;
    var todayN = open.filter(function (t) { return C.dueState(t.due, today).state === 'today'; }).length;
    var tk = h('div');
    if (!open.length) tk.appendChild(h('div', { class: 'muted' }, st.list('tasks').length ? '全部完成了' : '還沒有待辦'));
    else {
      if (overdue || todayN) tk.appendChild(h('div', { class: 'badges', style: 'margin:0 0 8px' }, overdue ? UI.badge('逾期 ' + overdue, 'warn') : null, todayN ? UI.badge('今天 ' + todayN, 'accent') : null));
      open.slice(0, 4).forEach(function (t) {
        tk.appendChild(h('a', { class: 'row', href: '#tasks', style: 'text-decoration:none;color:inherit;min-height:44px;border-top:1px solid var(--line)' },
          h('div', { class: 'grow' }, t.title), UI.dueBadge(t.due, false)));
      });
    }
    var ts = C.taskStats(st.get('tasks'));
    if (ts.total) { tk.appendChild(h('div', { style: 'margin-top:10px' }, UI.progress(ts.pct), h('div', { class: 'small muted', style: 'margin-top:4px' }, '已完成 ' + ts.done + ' / ' + ts.total))); }
    el.appendChild(UI.card('近期待辦', '全部', 'tasks', tk));

    /* 待決定 */
    var dc = C.decisionCounts(st.get('decisions')), dec = h('div');
    dec.appendChild(h('div', { class: 'badges', style: 'margin:0 0 6px' }, UI.badge('待討論 ' + dc['待討論'], ''), UI.badge('討論中 ' + dc['討論中'], 'blue'), UI.badge('已決定 ' + dc['已決定'], 'ok')));
    var pend = st.list('decisions').filter(function (d) { return d.status !== '已決定'; }).slice(0, 3);
    if (!dc.total) dec.appendChild(h('div', { class: 'muted' }, '還沒有待決定的事項'));
    pend.forEach(function (d) { dec.appendChild(h('a', { class: 'row', href: '#decisions', style: 'text-decoration:none;color:inherit;min-height:44px;border-top:1px solid var(--line)' }, h('div', { class: 'grow' }, (d.code ? d.code + ' ' : '') + d.title), UI.badge(d.status, d.status === '討論中' ? 'blue' : ''))); });
    el.appendChild(UI.card('待決定', '全部', 'decisions', dec));

    /* 預算 */
    var b = C.budgetSummary(st.get('budget'), meta), bd = h('div');
    bd.appendChild(h('div', { class: 'stats two' },
      h('div', { class: 'stat' }, h('b', null, U.fmtMoney(b.paid)), h('span', null, '已付')),
      h('div', { class: 'stat' }, h('b', null, U.fmtMoney(b.pending)), h('span', null, '待付'))));
    if (b.total !== null) {
      var ratio = b.total ? b.committed / b.total : 0;
      bd.appendChild(h('div', { style: 'margin-top:10px' }, UI.progress(ratio, b.over ? 'over' : ''),
        h('div', { class: 'row small', style: 'margin-top:5px' }, h('span', { class: 'muted grow' }, '總預算 ' + U.fmtMoney(b.total)),
          b.over ? h('b', { class: 'neg' }, '超支 ' + U.fmtMoney(b.over)) : h('b', null, '剩餘 ' + U.fmtMoney(b.remaining)))));
    } else bd.appendChild(h('div', { class: 'small muted', style: 'margin-top:8px' }, '尚未設定總預算'));
    if (b.unquoted) bd.appendChild(h('div', { class: 'small muted', style: 'margin-top:4px' }, b.unquoted + ' 項尚未報價'));
    el.appendChild(UI.card('預算', '明細', 'budget', bd));

    /* 賓客 */
    var g = C.guestSummary(st.get('guests'), meta), gd = h('div');
    gd.appendChild(h('div', { class: 'row', style: 'margin-bottom:10px' }, h('div', { class: 'big-num grow' }, g.total, h('span', { class: 'small muted', style: 'font-weight:400' }, ' 人（不含婉拒）')), h('div', { class: 'right small muted' }, '預估 ' + g.tables + ' 桌')));
    gd.appendChild(h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('b', null, g.ceremony), h('span', null, '證婚')),
      h('div', { class: 'stat' }, h('b', null, g.dinner), h('span', null, '晚宴')),
      h('div', { class: 'stat' }, h('b', null, g.after), h('span', null, 'after party'))));
    el.appendChild(UI.card('賓客', '名單', 'guests', gd));

    /* 最近變更 */
    var rc = C.recentChanges(st.allFiles(), 8), rl = h('div');
    if (!rc.length) rl.appendChild(h('div', { class: 'muted' }, '還沒有任何變更'));
    var route = { tasks: 'tasks', decisions: 'decisions', budget: 'budget', guests: 'guests', tables: 'tables', gifts: 'gifts', vendors: 'vendors', schedule: 'schedule', supplies: 'supplies', music: 'music', meta: 'info' };
    rc.forEach(function (c) {
      rl.appendChild(h('a', { class: 'row', href: '#' + route[c.file], style: 'text-decoration:none;color:inherit;min-height:48px;border-top:1px solid var(--line)' },
        UI.avatar(c.updatedBy),
        h('div', { class: 'grow' }, h('div', null, (c.title || '（無標題）') + (c.deleted ? '（已刪除）' : '')),
          h('div', { class: 'small muted' }, UI.person(c.updatedBy) + '・' + S.MODULE_LABEL[c.file])),
        h('div', { class: 'small muted' }, U.relTime(c.updatedAt))));
    });
    el.appendChild(UI.card('最近變更', null, null, rl));
  } };
})(window);
