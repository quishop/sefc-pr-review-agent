# Skill: 安全規則

## 必須檢查（發現即列為 MUST FIX）

- Hardcoded secret、API key、token、密碼
- SQL 字串拼接（應使用 parameterized query 或 ORM）
- 未驗證的使用者輸入直接用於 SQL / HTML / shell
- 不安全的 eval() 或 Function() 使用
- 敏感資料寫入 console.log 或 log 系統

## 特殊目錄規則

凡涉及以下目錄的改動，加上標記 [SECURITY REVIEW NEEDED]：
- `auth/`、`authentication/`
- `payment/`、`billing/`
- `admin/`
- 任何處理個人資料（PII）的模組

## 依賴安全

- 新增的 npm / pip 套件如有已知漏洞，列為 [MUST FIX]
- 使用 `*` 或過於寬鬆的版本範圍，列為 [SUGGESTION]

## 環境變數

- 新增環境變數必須同步更新 `.env.example`
- 未在 `.env.example` 更新的列為 [MUST FIX]
