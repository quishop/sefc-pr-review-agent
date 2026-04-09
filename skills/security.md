# Skill: 安全規則

## Critical（發現即 [MUST FIX]）

### 機密洩漏
- Hardcoded API key、token、密碼、connection string
- 檢查 pattern：`sk-`, `ghp_`, `xoxb-`, `Bearer`, `password =`, `secret =`, `-----BEGIN`
- `.env` 檔案被 commit（檢查 diff 中是否有 `.env` 但不在 `.gitignore`）
- 敏感值出現在 log 輸出（`console.log(token)`, `logger.info(password)`）

### Injection
- SQL 字串拼接：`f"SELECT * FROM users WHERE id = {user_id}"` → 用 parameterized query
- HTML/template injection：未 escape 的使用者輸入直接放進 HTML
- Command injection：`os.system(f"rm {filename}")` → 用 `subprocess.run([...])` with list args
- SSRF：使用者輸入的 URL 未驗證就直接 fetch

### 危險函式
- `eval()`, `exec()`, `Function()` 使用使用者輸入
- `pickle.loads()` 反序列化不信任的資料
- `yaml.load()` 不帶 `Loader=SafeLoader`
- `dangerouslySetInnerHTML` 使用未 sanitize 的內容

### 認證/授權
- 缺少認證檢查的 API endpoint
- 權限檢查可被繞過（先查資料再檢查權限，而非先檢查權限）
- JWT 沒有驗證 signature 或 expiry

## 敏感目錄（標記 [SECURITY REVIEW NEEDED]）

改動涉及以下目錄時，即使程式碼本身沒問題也要標記：
- `auth/`, `authentication/`, `login/`
- `payment/`, `billing/`, `checkout/`
- `admin/`, `permissions/`
- 處理 PII 的模組（email、phone、address、身份證號）

## 依賴安全

- 新增套件如有已知 CVE → [MUST FIX]
- 版本範圍使用 `*` 或 `>=` → [SUGGESTION]（應 pin 到 minor version）

## 環境變數

- 新增環境變數：檢查**同一個 repo** 的 `.env.example` 是否有更新
- 注意：不要假設其他 repo 的 `.env.example` 狀態。只看 diff 裡的檔案。

## 發現違規時

機密洩漏、injection → [MUST FIX]，標注 file:line 和修正方式
敏感目錄 → [SECURITY REVIEW NEEDED]
依賴版本 → [SUGGESTION]
