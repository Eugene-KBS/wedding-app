"""冒煙測試：python3 tests/smoke.py
預設需先在 /tmp/srv 以 python3 -m http.server 8765 提供 /wedding-app/；
環境不能開本機伺服器時用 SERVE_FS=1：由瀏覽器攔截請求直接讀本資料夾的檔案（SW 段落改用 context 攔截）。"""
import json, re, sys, base64, os
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://127.0.0.1:8765/wedding-app/')
APP = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SERVE_FS = os.environ.get('SERVE_FS') == '1'
SHOTS = os.path.join(APP, 'shots')
os.makedirs(SHOTS, exist_ok=True)
VERSION = re.search(r"version: '([^']+)'", open(os.path.join(APP, 'js', 'config.js'), encoding='utf-8').read()).group(1)

def serve_fs(route):
    """SERVE_FS 模式：BASE 底下的請求直接回本機檔案"""
    path = route.request.url.split('?')[0].split('#')[0][len(BASE):] or 'index.html'
    full = os.path.normpath(os.path.join(APP, path))
    if not full.startswith(APP) or not os.path.isfile(full): return route.fulfill(status=404, body='not found')
    types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.txt': 'text/plain'}
    route.fulfill(status=200, path=full, content_type=types.get(os.path.splitext(full)[1], 'application/octet-stream'))

TOUCH_JS = """window.__touch = function (el, type, x, y) {
  var t = new Touch({ identifier: 7, target: el, clientX: x, clientY: y });
  var end = type === 'touchend' || type === 'touchcancel';
  el.dispatchEvent(new TouchEvent(type, { touches: end ? [] : [t], targetTouches: end ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
};"""
problems, checks = [], []

def check(name, cond, extra=''):
    checks.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + (' ' + str(extra) if extra and not cond else ''))
    if not cond: problems.append(name)

def num(txt):
    return int(re.sub(r'[^\d-]', '', txt) or 0)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, service_workers='block', locale='zh-TW')
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' and '401' not in m.text else None)
    ext = []
    def route_ext(route):
        url = route.request.url
        if SERVE_FS and url.startswith(BASE): return serve_fs(route)
        if '127.0.0.1' in url or 'localhost' in url: return route.continue_()
        ext.append(url); route.abort()
    page.route('**/*', route_ext)
    gh_log = []
    def gh_bad(route):
        gh_log.append(route.request.method + ' ' + route.request.url)
        route.fulfill(status=401, content_type='application/json', body='{"message":"Bad credentials"}')
    page.route('https://api.github.com/**', gh_bad)

    def shot(name): page.wait_for_timeout(350); page.screenshot(path=os.path.join(SHOTS, name + '.png'))
    def overflow(name):
        # v0.2 起整頁固定、內容在 #view 內捲動（#view 設 overflow-x:hidden，所以量 #view 本身）
        w = page.evaluate('[document.documentElement.scrollWidth, window.innerWidth, document.getElementById("view").scrollWidth, document.getElementById("view").clientWidth]')
        check('無橫向溢出：' + name, w[0] <= w[1] and w[2] <= w[3], w)
    def route(): return page.evaluate('WApp.app.routeName()')
    def vscroll(y=None):
        if y is None: return page.evaluate('document.getElementById("view").scrollTop')
        return page.evaluate('(function(y){var v=document.getElementById("view");v.scrollTop=y;return v.scrollTop;})(%d)' % y)
    def touch(sel, kind, x, y): page.evaluate('([s,k,x,y]) => __touch(document.querySelector(s), k, x, y)', [sel, kind, x, y])
    def goto(h): page.evaluate("location.hash='#%s'" % h); page.wait_for_timeout(200)
    def field(label): return page.locator('.sheet .field', has_text=label).locator('input:not([type=checkbox]),textarea,select').first
    def save(): page.locator('.sheet-foot .btn.primary').click(); page.wait_for_timeout(450)

    # --- 首次設定
    page.goto(BASE); page.wait_for_selector('.setup')
    check('首次設定畫面出現', page.locator('text=我是 新郎').count() == 1)
    shot('01-setup')
    page.click('#demo-btn'); page.wait_for_timeout(200)
    check('沒選身分會提示', page.locator('.setup').count() == 1 and page.locator('text=請先選').count() >= 1)
    page.click('text=我是 新娘')
    page.fill('#token-input', 'bad token')
    page.click('#test-btn'); page.wait_for_selector('.errbox')
    check('連線失敗有白話說明', '401' in page.locator('.errbox').inner_text() and 'Token' in page.locator('.errbox').inner_text())
    shot('02-setup-error')
    page.click('#demo-btn'); page.wait_for_selector('.hero')

    # --- 總覽
    check('示範模式標示', page.locator('#status').inner_text() == '示範模式' and page.locator('.banner.demo').count() == 1)
    check('倒數天數', page.locator('.hero .big').inner_text().strip()[0].isdigit())
    check('最近變更 8 筆', page.locator('.card:has(h2:has-text("最近變更")) a.row').count() == 8)
    shot('03-overview'); overflow('總覽')

    # --- 原生 App 手感（v0.2）
    page.add_script_tag(content=TOUCH_JS)
    vp = page.get_attribute('meta[name=viewport]', 'content')
    check('viewport 禁止縮放', 'user-scalable=no' in vp and 'maximum-scale=1' in vp, vp)
    check('不自動把數字變電話連結', page.locator('meta[name=format-detection]').count() == 1)
    ta = page.evaluate('getComputedStyle(document.body).touchAction')
    check('touch-action 關閉雙擊與兩指縮放', ta in ('pan-x pan-y', 'manipulation'), ta)
    sel = page.evaluate('[getComputedStyle(document.body).userSelect, getComputedStyle(document.querySelector("#tabbar a")).userSelect]')
    check('介面文字不能被長按選取', sel == ['none', 'none'], sel)
    check('整頁本身不捲動', page.evaluate('document.scrollingElement.scrollHeight <= window.innerHeight + 1'))
    vscroll(400); page.wait_for_timeout(100)
    bars = page.evaluate('[document.getElementById("topbar").getBoundingClientRect().top, Math.round(document.getElementById("tabbar").getBoundingClientRect().bottom), window.innerHeight]')
    check('捲動內容時標題列與分頁列不動', vscroll() > 0 and bars[0] == 0 and bars[1] == bars[2], (vscroll(), bars))
    page.click('#tabbar a[href="#overview"]'); page.wait_for_timeout(700)
    check('再點目前分頁捲回頂端', vscroll() == 0, vscroll())
    page.click('#tabbar a[href="#tasks"]'); page.wait_for_selector('.item')
    check('浮動按鈕在 #view 之外', page.locator('#fab-root .fab').count() == 1 and page.locator('#view .fab').count() == 0)
    y_tasks = vscroll(260); page.click('#tabbar a[href="#guests"]'); page.wait_for_selector('#guest-search')
    check('切到別的分頁從頂端開始', vscroll() == 0, vscroll())
    page.click('#tabbar a[href="#tasks"]'); page.wait_for_selector('.item')
    check('切回分頁回到原本捲動位置', abs(vscroll() - y_tasks) <= 2 and y_tasks > 0, (y_tasks, vscroll()))
    page.click('#tabbar a[href="#more"]'); page.wait_for_selector('.menu')
    page.click('.menu a[href="#schedule"]'); page.wait_for_timeout(50)
    check('進入下一層有滑入動畫', 'anim-push' in page.get_attribute('#view', 'class'))
    check('返回鍵顯示上一層名稱', page.locator('#back').is_visible() and page.inner_text('#back-label') == '更多')
    page.click('#tabbar a[href="#overview"]'); page.wait_for_selector('.hero')
    page.click('#tabbar a[href="#more"]'); page.wait_for_timeout(200)
    check('切回分頁回到上次停留的頁面', route() == 'schedule', route())
    page.click('#tabbar a[href="#more"]'); page.wait_for_selector('.menu')
    check('在下一層再點分頁回第一層', route() == 'more', route())
    # 左緣右滑返回（模擬主畫面 App）
    page.click('.menu a[href="#vendors"]'); page.wait_for_timeout(400)
    page.evaluate('WApp.native.standalone = true')
    touch('#view', 'touchstart', 6, 400); touch('#view', 'touchmove', 60, 402); touch('#view', 'touchmove', 260, 405); touch('#view', 'touchend', 260, 405)
    page.wait_for_timeout(600)
    check('左緣右滑返回上一層', route() == 'more', route())
    page.evaluate('WApp.native.standalone = false')
    page.click('.menu a[href="#vendors"]'); page.wait_for_timeout(400)
    touch('#view', 'touchstart', 6, 400); touch('#view', 'touchmove', 260, 405); touch('#view', 'touchend', 260, 405); page.wait_for_timeout(500)
    check('Safari 分頁裡不攔截右滑（交給瀏覽器）', route() == 'vendors', route())
    # 按壓回饋
    touch('.fab', 'touchstart', 300, 760); page.wait_for_timeout(120)
    pressed = page.evaluate('document.querySelector(".fab").classList.contains("pressed")')
    touch('.fab', 'touchend', 300, 760); page.wait_for_timeout(250)
    check('按住按鈕有按壓回饋、放開後恢復', pressed and not page.evaluate('document.querySelector(".fab").classList.contains("pressed")'))
    # 表單：把手往下拖關閉；有未存修改時先確認
    page.click('.fab'); page.wait_for_selector('.sheet.show'); page.wait_for_timeout(300)
    check('表單有上緣把手', page.evaluate('getComputedStyle(document.querySelector(".sheet-head"), "::before").content') not in ('none', 'normal', ''))
    touch('.sheet-head', 'touchstart', 200, 120); touch('.sheet-head', 'touchmove', 200, 200); touch('.sheet-head', 'touchmove', 200, 330); touch('.sheet-head', 'touchend', 200, 330)
    page.wait_for_timeout(450)
    check('把手往下拖可關閉表單', page.locator('.sheet').count() == 0)
    page.click('.fab'); page.wait_for_selector('.sheet.show'); page.wait_for_timeout(300)
    field('廠商名稱').fill('拖曳測試')
    touch('.sheet-head', 'touchstart', 200, 120); touch('.sheet-head', 'touchmove', 200, 330); touch('.sheet-head', 'touchend', 200, 330)
    page.wait_for_selector('.dialog')
    check('有未存修改時拖曳會先確認', '放棄修改' in page.inner_text('.dialog h3'))
    page.click('.dialog .btn.danger'); page.wait_for_timeout(400)
    page.click('#tabbar a[href="#more"]'); page.wait_for_selector('.menu')   # 回到「更多」第一層，後段測試從選單開始
    page.click('#tabbar a[href="#overview"]'); page.wait_for_selector('.hero')

    # --- 待辦
    page.click('#tabbar a[href="#tasks"]'); page.wait_for_selector('.item')
    check('逾期標示', page.locator('.badge.warn').count() >= 1)
    prog0 = page.locator('.card:has(b:has-text("進度")) .num').inner_text()
    total0 = int(prog0.split('/')[1].split('（')[0])
    shot('04-tasks'); overflow('待辦')
    page.click('.fab'); page.wait_for_selector('.sheet.show')
    field('要做什麼').fill('測試新增的待辦'); save()
    prog1 = page.locator('.card:has(b:has-text("進度")) .num').inner_text()
    check('新增待辦後總數 +1', int(prog1.split('/')[1].split('（')[0]) == total0 + 1, (prog0, prog1))
    page.locator('.item:has-text("測試新增的待辦") .check').click(); page.wait_for_timeout(300)
    check('勾選後進度 +1', prog1.split('/')[0].strip() != page.locator('.card:has(b:has-text("進度")) .num').inner_text().split('/')[0].strip())
    page.click('.seg button:has-text("已完成")'); page.wait_for_timeout(200)
    check('已完成清單有該項', page.locator('.item:has-text("測試新增的待辦")').count() == 1)
    page.locator('.item:has-text("測試新增的待辦") .check').click(); page.wait_for_timeout(200)
    check('已完成可還原', page.locator('.item:has-text("測試新增的待辦")').count() == 0)
    page.click('.seg button:has-text("進行中")')
    page.click('.chip:has-text("新娘")'); page.wait_for_timeout(200)
    check('負責人篩選', page.locator('.item').count() >= 1)

    # --- 待決定
    page.click('.seg button:has-text("待決定")'); page.wait_for_selector('.decision')
    check('待決定並列兩人想法', page.locator('.decision .view').count() >= 6)
    shot('05-decisions'); overflow('待決定')
    page.click('.chip:has-text("已決定")'); page.wait_for_timeout(200)
    check('待決定狀態篩選', page.locator('.decision').count() == 1)

    # --- 預算
    page.click('#tabbar a[href="#budget"]'); page.wait_for_selector('.big-num')
    stats = lambda: [num(x) for x in page.locator('.card .stat b').all_inner_texts()[:2]]
    paid0, pend0 = stats()
    shot('06-budget'); overflow('預算')
    page.locator('.item:has-text("場地與餐飲")').first.click(); page.wait_for_selector('.stat')
    shot('07-budget-category'); overflow('預算分類')
    page.click('.fab'); page.wait_for_selector('.sheet.show')
    field('項目名稱').fill('測試項目'); field('報價').fill('10000')
    page.click('.sheet button:has-text("新增一筆付款")')
    page.locator('.sheet .sub-row input[placeholder="金額"]').fill('3000')
    shot('08-budget-item-form')
    save()
    page.go_back() if False else goto('budget'); page.wait_for_selector('.big-num')
    paid1, pend1 = stats()
    check('預算：已付 +3000', paid1 - paid0 == 3000, (paid0, paid1))
    check('預算：待付 +7000', pend1 - pend0 == 7000, (pend0, pend1))
    check('預算顯示未報價筆數', page.locator('text=項未報價').count() >= 1)

    # --- 賓客
    page.click('#tabbar a[href="#guests"]'); page.wait_for_selector('#guest-search')
    t0 = num(page.locator('.big-num').first.inner_text().split('人')[0])
    shot('09-guests'); overflow('賓客')
    page.click('.fab'); page.wait_for_selector('.sheet.show')
    check('出席欄位用原生開關', page.locator('.sheet .switch-row input[switch]').count() == 3)
    shot('09b-guest-form')
    field('姓名').fill('測試賓客'); field('人數').fill('3'); save()
    t1 = num(page.locator('.big-num').first.inner_text().split('人')[0])
    check('賓客總數 +3', t1 - t0 == 3, (t0, t1))
    page.fill('#guest-search', '測試賓'); page.wait_for_timeout(200)
    check('賓客搜尋', page.locator('.item:has-text("測試賓客")').count() == 1 and page.locator('.item').count() == 1)
    page.fill('#guest-search', '')
    page.click('.btn:has-text("貼上 CSV 匯入")'); page.wait_for_selector('#csv-text')
    page.fill('#csv-text', '姓名,方,分組,人數\n匯入甲,男方,測試組,2\n匯入乙,女方,測試組,1')
    page.wait_for_timeout(400)
    check('CSV 預覽', '可匯入 2 位' in page.locator('.sheet .okbox').inner_text())
    page.click('.sheet-foot .btn.primary'); page.wait_for_timeout(400)
    t2 = num(page.locator('.big-num').first.inner_text().split('人')[0])
    check('CSV 匯入後 +3 人', t2 - t1 == 3, (t1, t2))
    page.click('.btn:has-text("匯出 CSV")'); page.wait_for_selector('pre.export')
    check('匯出面板顯示內容', '匯入甲' in page.locator('pre.export').inner_text())
    page.click('.sheet-foot .btn:has-text("關閉")'); page.wait_for_timeout(350)

    # --- 更多
    page.click('#tabbar a[href="#more"]'); page.wait_for_selector('.menu')
    shot('10-more'); overflow('更多')
    for route, name in [('schedule', '11-schedule'), ('vendors', '12-vendors'), ('music', '13-music'), ('tables', '14-tables'), ('gifts', '15-gifts'), ('supplies', '16-supplies'), ('info', '17-info'), ('settings', '18-settings')]:
        page.click('.menu a[href="#%s"]' % route); page.wait_for_timeout(300)
        check('進入 ' + route, page.locator('#back').is_visible())
        shot(name); overflow(route)
        if route == 'music':
            first = lambda: page.locator('.group-title:has-text("證婚") ~ .item .ttl').first.inner_text()
            f0 = first(); page.locator('.item:has-text("%s") .move button' % f0).nth(1).click(); page.wait_for_timeout(300)
            check('音樂下移', first() != f0)
        page.click('#back'); page.wait_for_selector('.menu')

    # --- 新增流程確認有顯示
    goto('schedule'); page.click('.seg button:has-text("前一日")'); page.wait_for_timeout(200)
    check('流程依日切換', page.locator('.item').count() >= 2)

    # --- 刪除需確認
    goto('supplies'); page.wait_for_selector('.item')
    n0 = page.locator('.item').count()
    page.locator('.item .main').first.click(); page.wait_for_selector('.sheet.show')
    page.click('.sheet-foot .btn.danger'); page.wait_for_selector('.dialog')
    check('刪除前有確認對話框', page.locator('.dialog h3').inner_text() != '')
    page.click('.dialog .btn:has-text("取消")'); page.wait_for_timeout(200)
    check('取消後仍在', page.locator('.item').count() == n0)
    page.click('.sheet-foot .btn.danger'); page.click('.dialog .btn.danger'); page.wait_for_timeout(500)
    check('確認後刪除', page.locator('.item').count() == n0 - 1)

    # --- 設定 → 以 mock 切換正式模式，且不寫入示範資料
    goto('settings'); page.wait_for_selector('#token-input')
    meta = {"schemaVersion": 1, "title": "模擬正式資料", "date": "2027-05-15", "time": "17:00", "venue": "", "city": "", "groom": "", "bride": "", "budgetTotal": None, "perTable": 10,
            "sides": [{"id": "groom", "label": "男方"}, {"id": "bride", "label": "女方"}], "updatedAt": "2026-11-01T00:00:00.000Z", "updatedBy": "E"}
    gh_log.clear()
    def gh_ok(route):
        r = route.request; u = r.url; gh_log.append(r.method + ' ' + u)
        if r.method == 'PUT': return route.fulfill(status=200, content_type='application/json', body=json.dumps({'content': {'sha': 'x1'}}))
        if u.endswith('/contents/data/meta.json?ref=main'):
            return route.fulfill(status=200, content_type='application/json', body=json.dumps({'encoding': 'base64', 'sha': 'm1', 'content': base64.b64encode(json.dumps(meta, ensure_ascii=False).encode()).decode()}))
        if '/contents/data?ref=main' in u:
            return route.fulfill(status=200, content_type='application/json', body=json.dumps([{'name': 'meta.json', 'sha': 'm1'}]))
        if u.endswith('/repos/Eugene-KBS/wedding-data'): return route.fulfill(status=200, content_type='application/json', body='{"permissions":{"push":true}}')
        return route.fulfill(status=404, content_type='application/json', body='{}')
    page.unroute('https://api.github.com/**'); page.route('https://api.github.com/**', gh_ok)
    page.fill('#token-input', 'github_pat_FAKE_TEST_TOKEN')
    page.click('#test-btn'); page.wait_for_selector('.okbox')
    check('連線成功顯示標題', '模擬正式資料' in page.locator('.okbox').inner_text())
    shot('19-settings-connected')
    page.click('#start-btn'); page.wait_for_selector('#status[data-s="synced"]', timeout=8000)
    check('正式模式不含示範資料', page.evaluate("WApp.app.store.list('tasks').length") == 0 and page.evaluate("WApp.app.store.meta().title") == '模擬正式資料')
    check('切換時沒有 PUT', not any(x.startswith('PUT') for x in gh_log), gh_log)
    goto('overview'); page.wait_for_timeout(300)
    check('正式模式沒有示範橫幅', page.locator('.banner.demo').count() == 0)
    check('正式模式有下拉同步提示', page.locator('#view > .ptr').count() == 1)
    shot('20-live-overview')
    # 在正式模式新增 → 1.5 秒內送出一次 PUT
    goto('tasks'); page.click('.fab'); page.wait_for_selector('.sheet.show'); field('要做什麼').fill('正式模式待辦'); save()
    page.wait_for_timeout(2600)
    puts = [x for x in gh_log if x.startswith('PUT')]
    check('正式模式變更會 PUT 一次', len(puts) == 1 and 'tasks.json' in puts[0], puts)
    check('同步狀態為已同步', page.locator('#status').get_attribute('data-s') == 'synced')
    # 回到示範模式：示範資料仍在
    goto('settings'); page.click('text=移除 Token，回到示範模式'); page.click('.dialog .btn.danger'); page.wait_for_timeout(500)
    check('回到示範模式後資料仍在', page.evaluate("WApp.app.mode") == 'demo' and page.evaluate("WApp.app.store.list('tasks').length") > 5)

    # --- 深色模式
    page.emulate_media(color_scheme='dark'); goto('overview'); page.wait_for_selector('.hero'); shot('21-dark-overview')
    goto('budget'); shot('22-dark-budget'); page.emulate_media(color_scheme='light')

    check('無 console／頁面錯誤', not errors, errors[:5])
    check('沒有對外連線（除 mock 的 GitHub）', not ext, ext)
    ctx.close()

    # --- Service worker（獨立 context）
    ctx2 = b.new_context(viewport={'width': 390, 'height': 844})
    if SERVE_FS: ctx2.route(BASE + '**', serve_fs)   # Chromium：context 攔截也涵蓋 service worker 的請求
    pg = ctx2.new_page(); pg.goto(BASE); pg.wait_for_selector('.setup')
    try:
        pg.wait_for_function('navigator.serviceWorker.ready.then(r=>!!r.active)', timeout=10000)
        scope = pg.evaluate('navigator.serviceWorker.getRegistration().then(r=>r.scope)')
        check('SW 註冊且 scope 為子路徑', scope.endswith('/wedding-app/'), scope)
        pg.wait_for_timeout(800); keys = pg.evaluate('caches.keys()')
        check('SW 快取帶版本號 ' + VERSION, any(VERSION in k for k in keys), keys)
        n = pg.evaluate('caches.open("wedding-app-shell-%s").then(c=>c.keys()).then(k=>k.length)' % VERSION)
        check('SW 外殼檔案全部快取', n >= 39, n)
    except Exception as e:
        check('SW 註冊（%s）' % ('SERVE_FS 模式' if SERVE_FS else '伺服器'), False, str(e)[:200])
    ctx2.close(); b.close()

passed = sum(1 for _, ok in checks if ok)
print('\n%d/%d 通過' % (passed, len(checks)))
sys.exit(1 if problems else 0)
