# Skill: API 設計規範

## RESTful 規則

- 路由 kebab-case：`/user-profiles`，不是 `/userProfiles` 或 `/user_profiles`
- 資源名稱複數：`/users`、`/orders`，不是 `/user`、`/order`
- HTTP 方法語意正確：
  - GET：取資料（idempotent，不修改 state）
  - POST：新增資源
  - PUT：完整替換，PATCH：部分更新
  - DELETE：刪除
- 狀態碼正確：200 OK、201 Created、204 No Content、400 Bad Request、401 Unauthorized、403 Forbidden、404 Not Found、409 Conflict、422 Unprocessable Entity、500 Internal Server Error

## 必要條件（[MUST FIX]）

- 新增 API 端點必須有 request validation（body、query params、path params）
- 所有非 public 端點必須有認證（authentication）和授權（authorization）檢查
- 回應格式必須一致：所有端點用同一個 response wrapper
- 新增端點必須有對應的 test

```python
# Bad — no validation, no auth
@app.route('/users', methods=['POST'])
def create_user():
    data = request.json  # no validation
    User.objects.create(**data)

# Good
@app.route('/users', methods=['POST'])
@require_auth
def create_user():
    data = CreateUserSchema().load(request.json)  # validated
    user = User.objects.create(**data)
    return jsonify(UserSchema().dump(user)), 201
```

## Error Response 標準

所有 error 必須回傳一致結構，不得裸回字串或 stack trace：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email format is invalid",
    "details": [{"field": "email", "reason": "invalid_format"}]
  }
}
```

- 4xx 錯誤：message 給使用者看，不洩露內部實作
- 5xx 錯誤：回傳 generic message，詳細錯誤只寫 log
- 不在 error response 暴露 stack trace、SQL query、檔案路徑

## 安全規則（[MUST FIX]）

- API response 不回傳 password、token、secret 欄位
- 分頁必須有上限（例如 `limit` max 100），防止一次拉全表
- 批次操作必須有上限（例如 batch delete max 50）
- 敏感操作（刪除、權限變更）需要 audit log

## 建議事項（[SUGGESTION]）

- 加 cache headers（`Cache-Control`, `ETag`）
- Response 加 `X-Request-Id` 方便追蹤
- API versioning（`/v1/users`）如果有外部消費者
- Pagination 使用 cursor-based（大資料集）而非 offset-based

## 發現違規時

缺少 validation、缺少 auth、洩露敏感欄位 → [MUST FIX]
命名、cache、versioning → [SUGGESTION]
