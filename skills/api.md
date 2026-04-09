# Skill: API 設計規範

## RESTful 規則

- 路由使用 kebab-case，例如 `/user-profiles`
- 資源名稱使用複數名詞，例如 `/users`、`/orders`
- HTTP 方法語意正確：GET 取資料、POST 新增、PUT/PATCH 更新、DELETE 刪除
- 回應狀態碼正確：200 成功、201 建立、400 輸入錯誤、401 未認證、403 無權限、404 不存在

## 必要條件（缺少即 MUST FIX）

- 新增 API 端點必須有對應的 request validation
- 所有 API 必須有認證驗證（除明確標記為 public 的端點）
- 回應格式需一致，不得部分端點回傳陣列、部分回傳物件
- 新增端點必須有對應的 integration test 或 e2e test

## 安全規則

- 不在 API response 回傳密碼、token 等敏感欄位
- 分頁參數需有上限防止一次拉取過多資料
- 需有適當的 rate limiting 考量

## 建議事項（SUGGESTION）

- API response 加上適當的 cache headers
- 錯誤訊息不應洩露內部實作細節
