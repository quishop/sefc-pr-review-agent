# Skill: 安全規則

## Critical（發現即 [MUST FIX]）

### 機密洩漏
- Hardcoded API key、token、密碼、connection string
- 偵測 pattern：`sk-`, `ghp_`, `xoxb-`, `Bearer `, `-----BEGIN`, `API_KEY =`, `SECRET =`, `password`
- `.env` 檔案出現在 diff 中（應在 .gitignore）
- 敏感值出現在 log（`console.log(token)`, `logger.info(password)`）
- **前端程式碼中硬編碼 API key**（即使是 internal dashboard 也不行）

```javascript
// Bad — [MUST FIX] 在前端暴露 API key
const API_CONFIG = {
  API_KEY: 'Esa1NpzGJ2Orc...', // 任何人都能從 DevTools 看到
};

// Good — 透過 backend proxy 或環境變數
const API_KEY = process.env.REACT_APP_API_KEY; // build time 注入
```

```python
# Bad — [MUST FIX] 硬編碼在 class 中
class SSOService:
    CLIENT_ID = "xxx-actual-id"
    CLIENT_SECRET = "xxx-actual-secret"

# Good
class SSOService:
    CLIENT_ID = os.environ["SSO_CLIENT_ID"]
    CLIENT_SECRET = os.environ["SSO_CLIENT_SECRET"]
```

### Injection
- SQL 拼接：`f"SELECT * FROM users WHERE id = {user_id}"` → parameterized query
- Command injection：`os.system(f"rm {filename}")` → `subprocess.run([...])` with list args
- HTML injection：未 escape 的使用者輸入直接放進 HTML
- SSRF：使用者輸入的 URL 未驗證就 fetch

### 危險函式
- `eval()`, `exec()`, `Function()` 使用使用者輸入
- `pickle.loads()` 反序列化不信任資料
- `yaml.load()` 不帶 `Loader=SafeLoader`
- `dangerouslySetInnerHTML` 使用未 sanitize 內容

### 認證/授權
- API endpoint 缺少認證檢查
- 權限繞過：先查資料再檢查權限（應先檢查）
- JWT 沒有驗證 signature 或 expiry
- Django view 用 `@csrf_exempt` 但沒有其他認證機制

## 敏感目錄（標記 [SECURITY REVIEW NEEDED]）

改動涉及以下路徑時，即使程式碼本身沒問題也要標記：
- `auth/`, `authentication/`, `login/`, `sso*/`
- `payment/`, `billing/`, `checkout/`
- `admin/`, `permissions/`, `middleware.py`
- 處理 PII 的模組
- `settings.py`, `config.py`, `.env*`

## 依賴安全

- 新增套件如有已知 CVE → [MUST FIX]
- 版本範圍 `*` 或 `>=` → [SUGGESTION]（應 pin 到 minor）

## 環境變數

- 新增環境變數：檢查**同一個 repo** 的 `.env.example` 或 `.env.local` 是否更新
- 不要假設其他 repo 的狀態，只看 diff 裡的檔案

## 發現違規時

機密洩漏、injection、缺少認證 → [MUST FIX]，標注 file:line 和修正方式
敏感目錄 → [SECURITY REVIEW NEEDED]
依賴版本 → [SUGGESTION]
