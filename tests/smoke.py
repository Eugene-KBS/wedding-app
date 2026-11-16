"""冒煙測試：python3 tests/smoke.py（需先在 /tmp/srv 以 python3 -m http.server 8765 提供 /wedding-app/）"""
import json, re, sys, base64, os
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://127.0.0.1:8765/wedding-app/')
SHOTS = os.path.join(os.path.dirname(__file__), '..', 'shots')
os.makedirs(SHOTS, exist_ok=True)
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
        w = page.evaluate('[document.documentElement.scrollWidth, window.innerWidth]')
        check('無橫向溢出：' + name, w[0] <= w[1], w)
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
    full = page.evaluate('document.documentElement.scrollHeight')

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
    pg = ctx2.new_page(); pg.goto(BASE); pg.wait_for_selector('.setup')
    pg.wait_for_function('navigator.serviceWorker.ready.then(r=>!!r.active)', timeout=10000)
    scope = pg.evaluate('navigator.serviceWorker.getRegistration().then(r=>r.scope)')
    check('SW 註冊且 scope 為子路徑', scope.endswith('/wedding-app/'), scope)
    pg.wait_for_timeout(500); keys = pg.evaluate('caches.keys()')
    check('SW 快取帶版本號', any('0.1.0' in k for k in keys), keys)
    ctx2.close(); b.close()

passed = sum(1 for _, ok in checks if ok)
print('\n%d/%d 通過' % (passed, len(checks)))
sys.exit(1 if problems else 0)
