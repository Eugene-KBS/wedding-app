# 婚禮手帳（PWA v0.1）

兩個人每天在手機上用的婚禮籌備工具：待辦、待決定、預算、賓客、流程、廠商、音樂、桌位、禮簿、備品。
純 HTML／CSS／JS，無框架、無打包、無外部 CDN 與字型。規格見 `docs/41-App功能清單與規格.md`。

## 上線（GitHub Pages）
1. 把本資料夾內容放進公開 repo `Eugene-KBS/wedding-app`，啟用 Pages，網址形如 `https://…/wedding-app/`。
2. 所有資源都用相對路徑，service worker 的 scope 也是相對的，放在子路徑即可運作。
3. 外殼只有程式與虛構示範資料（`sample/`）。真實資料在私有 repo `Eugene-KBS/wedding-data` 的 `data/*.json`。
4. 每台裝置第一次打開：選「我是誰」→ 貼 fine-grained token（只授權 wedding-data 的 Contents 讀寫）→「連線測試」→ 開始。
   沒有 token 時是「示範模式」，資料只存本機；切換成正式模式時不會把示範資料寫進 GitHub。
5. iPhone：Safari →「分享」→「加入主畫面」。

## 發佈新版
改了任何檔案後，把 `sw.js` 的 `VERSION` 與 `js/config.js` 的 `version` 一起加一。使用者會看到「有新版本可用」並按「重新整理」更新。
新增或改名檔案時，也要更新 `sw.js` 的 `SHELL` 清單。

## 目錄
| 路徑 | 內容 |
|---|---|
| `index.html`, `manifest.webmanifest`, `sw.js`, `robots.txt` | 外殼 |
| `css/app.css` | 樣式（薄暮濕地，支援深色模式與安全區） |
| `js/` | `config` `util` `schema` `merge` `calc` `store-local` `store-github` `sync` `ui`、各 `view-*`、`main` |
| `sample/` | 虛構示範資料（每個模組至少 3 筆） |
| `tools/validate-data.mjs <資料夾>` | 依規格檢查資料檔，有錯誤時結束碼為 1 |
| `tools/build-preview.mjs <資料夾> <out.html>` | 打包成單一 HTML 預覽檔（不需伺服器、不註冊 SW、不發 fetch、只用記憶體） |
| `tests/` | `node --test tests/*.test.js`；`smoke.py`、`preview-smoke.py`（Playwright） |
| `shots/` | 冒煙測試截圖 |

## 測試
```
node --test tests/*.test.js
mkdir -p /tmp/srv && ln -sfn "$PWD" /tmp/srv/wedding-app && (cd /tmp/srv && python3 -m http.server 8765 &)
python3 tests/smoke.py          # 390×844，走過所有分頁並截圖
python3 tests/preview-smoke.py  # 單一 HTML 與沙盒 iframe
```

## 設計決定
- 路由只用 `#overview`、`#budget` 這類純英數名稱；其他畫面狀態（例如目前的預算分類）放記憶體。頁面切換不依賴網址，在沙盒 iframe 內也能用。
- 全站不用 `alert`／`confirm`／`prompt`；刪除確認與錯誤都是頁內對話框或提示條。
- 匯出（備份 JSON、賓客 CSV）：先嘗試 Blob 下載，同時一定開啟「顯示內容＋複製」面板；複製失敗會全選內容讓人手動複製。
- 預算：已付＝所有付款加總；待付＝有報價項目的（報價−已付，最小 0）加總；剩餘＝總預算−已付−待付；未報價項目另列筆數、不計入待付。
- 賓客：總人數＝未刪除且非「婉拒」的 partySize 加總；桌數＝ceil(晚宴人數 ÷ 每桌人數)。新增賓客預設：只出席晚宴。
- 同步：本機變更 1.5 秒內合併成一次 PUT；409／422 重抓、逐筆合併、最多重試 3 次；輪詢先列資料夾比對 sha，只抓有變的檔。

## 已知限制
見回報；重點：桌位是清單式指派（沒有拖曳桌位圖）、沒有喜餅／電子喜帖／報到（規格列為不做）。
