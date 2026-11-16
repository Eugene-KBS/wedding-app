"""預覽版測試：單一 HTML，無伺服器、無 service worker、無網路；也在沙盒 iframe（無 same-origin）內測試。"""
import os, sys, subprocess
from playwright.sync_api import sync_playwright
app = os.path.join(os.path.dirname(__file__), '..')
out = '/tmp/preview-test.html'
subprocess.check_call(['node', os.path.join(app, 'tools', 'build-preview.mjs'), os.path.join(app, 'sample'), out])
fails = []
def check(n, c, e=''):
    print(('PASS ' if c else 'FAIL ') + n + (' ' + str(e) if not c and e else ''))
    if not c: fails.append(n)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True)
    reqs = []
    ctx.route('**/*', lambda r: (reqs.append(r.request.url), r.abort()) if not r.request.url.startswith('file://') else r.continue_())
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto('file://' + out); pg.wait_for_selector('.hero')
    check('預覽橫幅', '預覽模式：變更只存在這台裝置' in pg.locator('.banner.preview').inner_text())
    check('無對外請求', not reqs, reqs)
    pg.click('#tabbar a[href="#tasks"]'); pg.click('.fab'); pg.wait_for_selector('.sheet.show')
    pg.locator('.sheet .field', has_text='要做什麼').locator('input').fill('預覽新增'); pg.click('.sheet-foot .btn.primary'); pg.wait_for_timeout(500)
    check('預覽可新增', pg.locator('.item:has-text("預覽新增")').count() == 1)
    pg.screenshot(path=os.path.join(app, 'shots', '23-preview-tasks.png'))
    # 匯出面板
    pg.evaluate("location.hash='#settings'"); pg.wait_for_timeout(300)
    pg.click('text=匯出全部資料'); pg.wait_for_selector('pre.export')
    check('匯出面板有內容', '示範婚禮' in pg.locator('pre.export').inner_text())
    ctx.close()
    # 沙盒 iframe：allow-scripts only → localStorage 不可用
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    ctx.route('**/*', lambda r: r.abort() if not r.request.url.startswith('file://') else r.continue_())
    pg = ctx.new_page(); errs2 = []
    pg.on('pageerror', lambda e: errs2.append(str(e)))
    html = '<iframe id=f sandbox="allow-scripts" src="file://%s" style="width:390px;height:800px;border:0"></iframe>' % out
    open('/tmp/host.html', 'w').write(html)
    pg.goto('file:///tmp/host.html'); fr = pg.frame_locator('#f')
    fr.locator('.hero').wait_for(timeout=8000)
    check('沙盒 iframe 可運作', fr.locator('.banner.preview').count() == 1)
    fr.locator('#tabbar a[href="#guests"]').click(); fr.locator('.fab').click(); fr.locator('.sheet.show').wait_for()
    fr.locator('.sheet .field', has_text='姓名').locator('input').fill('沙盒賓客'); fr.locator('.sheet-foot .btn.primary').click(); pg.wait_for_timeout(500)
    check('沙盒內可新增賓客', fr.locator('.item:has-text("沙盒賓客")').count() == 1)
    check('沙盒無頁面錯誤', not errs2, errs2)
    pg.screenshot(path=os.path.join(app, 'shots', '24-preview-iframe.png'))
    b.close()
sys.exit(1 if fails else 0)
