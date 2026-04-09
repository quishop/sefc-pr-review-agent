# Skill: API 設計規範

## RESTful 規則

- 路由 kebab-case：`/user-profiles`
- 資源名稱複數：`/users`、`/orders`
- HTTP 方法語意正確：GET 讀、POST 建、PUT/PATCH 改、DELETE 刪
- 正確狀態碼：200、201、204、400、401、403、404、409、422、500

## 統一回應格式（[MUST FIX] 如不一致）

專案使用 `StandardResponse` 格式。所有端點必須一致，不得混用 `JsonResponse` 和 DRF `Response`：

```json
{
  "status": "success",
  "message": "操作成功",
  "data": { ... },
  "timestamp": "2026-04-09T08:00:00Z",
  "meta": { "pagination": { "page": 1, "per_page": 10, "total": 100 } }
}
```

Error 格式：
```json
{
  "status": "error",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email 格式不正確",
    "details": [{"field": "email", "reason": "invalid_format"}]
  }
}
```

- 4xx：message 給使用者看，不洩露內部實作
- 5xx：回傳 generic message，詳細錯誤只寫 log
- 不在 error response 暴露 stack trace、SQL query、檔案路徑

## 必要條件（[MUST FIX]）

- 新增端點必須有 request validation（用 DRF serializer，不要手動 parse）
- 非 public 端點必須有認證（`APIKeyAuthMiddleware` 或 DRF permission class）
- 新增端點必須有對應的 test
- 分頁必須有上限（limit max 100）
- 批次操作必須有上限（batch max 50）

```python
# Bad — 手動 parse，無 validation
def get_products(request):
    shop_id = request.GET.get("shop_id")
    ids = request.GET.get("ids", "").split(",")  # 手動 split
    return JsonResponse({"data": list(qs)})

# Good — serializer + StandardResponse
class ProductListView(APIView):
    def get(self, request):
        serializer = ProductFilterSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return StandardResponse.success(data=products)
```

## 安全規則（[MUST FIX]）

- Response 不回傳 password、token、secret 欄位
- 敏感操作（刪除、權限變更）需要 audit log
- API key 透過 `X-API-KEY` header 傳遞，不放 URL query string

## 建議事項（[SUGGESTION]）

- 加 cache headers（`Cache-Control`, `ETag`）
- Response 加 `X-Request-Id`
- API versioning（`/v1/`）如有外部消費者
- 大資料集用 cursor-based pagination

## 發現違規時

缺少 validation、缺少認證、回應格式不一致、洩露敏感欄位 → [MUST FIX]
cache、versioning、命名 → [SUGGESTION]
