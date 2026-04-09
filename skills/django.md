# Skill: Django 框架規範

## Model 規範

### 必要欄位
- 所有 model 必須有 `created_at = models.DateTimeField(auto_now_add=True)` 和 `updated_at = models.DateTimeField(auto_now=True)`
- Meta 必須有 `verbose_name`（中文）
- 有 soft delete 需求的 model 加 `deleted_at = models.DateTimeField(null=True, blank=True)`

### ForeignKey
- 必須明確指定 `on_delete`（不默認用 `CASCADE`，除非確認刪除父物件時子物件也該刪）
- 必須有 `related_name`（明確定義反向關聯名稱）
- 考慮 `db_index=True` 在經常查詢的 FK 欄位

```python
# Bad — [MUST FIX]
shop = models.ForeignKey(Shop, on_delete=models.CASCADE)

# Good
shop = models.ForeignKey(
    Shop,
    on_delete=models.PROTECT,
    related_name="products",
    verbose_name="所屬商店",
)
```

### Choices
- 用 `TextChoices` / `IntegerChoices`，不用 magic strings
- 定義在 model class 內部或同檔案

```python
# Bad — magic strings
status = models.CharField(choices=[("enabled", "Enabled"), ("disabled", "Disabled")])
if product.status == "enabled":  # 容易 typo

# Good
class Status(models.TextChoices):
    ENABLED = "enabled", "啟用"
    DISABLED = "disabled", "停用"
    PENDING = "pending", "待處理"

status = models.CharField(choices=Status.choices, default=Status.DISABLED)
if product.status == Status.ENABLED:  # IDE 自動補全，不會 typo
```

### 欄位命名
- 布林欄位：`is_*` / `has_*`（`is_active`, `has_inventory`）
- 時間欄位：`*_at`（`created_at`, `published_at`, `expired_at`）
- 金額欄位：`*_amount` 或 `*_price`，用 `DecimalField` 不用 `FloatField`

## QuerySet 規範（N+1 = [MUST FIX]）

### select_related / prefetch_related
- ForeignKey 取值必須 `select_related()`（SQL JOIN）
- 反向關聯 / M2M 必須 `prefetch_related()`（額外 query，但只一次）

```python
# Bad — N+1（每個 product 都查一次 shop）[MUST FIX]
products = Product.objects.all()
for p in products:
    print(p.shop.name)  # N queries

# Good
products = Product.objects.select_related("shop").all()
for p in products:
    print(p.shop.name)  # 1 query (JOIN)

# 反向關聯
shops = Shop.objects.prefetch_related("products").all()
for s in shops:
    print(s.products.count())  # 2 queries total
```

### 禁止無限制查詢
- View 中禁止 `.all()` 不帶 filter 或 pagination
- 必須有 `[:limit]`、`.filter()`、或 pagination class

```python
# Bad — [MUST FIX] 無限制查詢
def list_products(request):
    return Product.objects.all()  # 可能回傳百萬筆

# Good
def list_products(request):
    return Product.objects.filter(
        shop_id=request.shop_id
    ).select_related("shop")[:100]
```

### BaseRepository
- 使用專案的 `BaseRepository` 做 read/write 分離
- 讀取用 read replica，寫入用 primary
- 需要強一致性的讀取用 `force_primary=True`

## View 規範

### DRF Serializer（[MUST FIX] 如手動 parse）
- 所有 input validation 必須用 DRF serializer，不要手動 `request.GET.get()`
- Serializer 的 `validate()` 不要有 side effect（不寫 DB、不呼叫外部 API）

```python
# Bad — [MUST FIX] 手動 parse
def get_products(request):
    shop_id = request.GET.get("shop_id")
    ids = request.GET.get("ids", "").split(",")  # fragile
    products = Product.objects.filter(id__in=ids)
    return JsonResponse({"data": list(products.values())})

# Good
class ProductFilterSerializer(serializers.Serializer):
    shop_id = serializers.CharField(required=True)
    ids = serializers.ListField(child=serializers.IntegerField(), required=False)

class ProductListView(APIView):
    def get(self, request):
        serializer = ProductFilterSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        products = ProductService.list(**serializer.validated_data)
        return StandardResponse.success(data=ProductSerializer(products, many=True).data)
```

### StandardResponse
- 統一用 `StandardResponse` 回傳，不混用 `JsonResponse` 和 DRF `Response`
- Success：`StandardResponse.success(data=..., message=...)`
- Error：`StandardResponse.error(code=..., message=..., details=...)`

```python
# Bad — [MUST FIX] 混用回應格式
return JsonResponse({"status": "ok", "products": data})       # view A
return Response({"data": products}, status=200)                # view B
return JsonResponse({"error": "not found"}, status=404)        # view C

# Good — 統一格式
return StandardResponse.success(data=products)
return StandardResponse.error(code=ErrorCode.NOT_FOUND, message="商品不存在")
```

### 認證
- 所有非 public endpoint 必須通過 `APIKeyAuthMiddleware`
- DRF view 必須設定 `permission_classes`（不留空）
- `@csrf_exempt` 的 view 必須有其他認證機制

### Error Handling
- 用專案自定義 exception（`ValidationError`, `NotFoundError`, `UnauthorizedError`）
- 不要裸 `except Exception:`，至少 log `exc_info=True`
- 不在 error response 暴露 stack trace

```python
# Bad
try:
    product = ProductService.get(id)
except Exception:
    return JsonResponse({"error": "something went wrong"}, status=500)

# Good
try:
    product = ProductService.get(id)
except Product.DoesNotExist:
    raise NotFoundError(f"Product {id} not found")
except DatabaseError as e:
    logger.error("DB error: %s", e, exc_info=True)
    raise
```

## Migration 規範

（詳見 migration.md，以下為 Django 特定補充）

- `makemigrations` 產生的自動 migration 必須 review，不要盲目 commit
- `RunPython` 必須有 `reverse_code`（不能只有 `migrations.RunPython.noop`，除非真的不可逆）
- `AddField` with `default` 在大表上會 rewrite 整張表 → 考慮分步驟
- 新增 `unique_together` / `UniqueConstraint` 前確認沒有重複資料

## Settings 規範

- 敏感值必須用 `os.environ[]`（非 `os.environ.get()` 帶 default）— 缺少時應 fail fast
- `ALLOWED_HOSTS` 不得為 `["*"]` 在 staging/production
- `DEBUG = False` 在非 local 環境
- Database credentials 不出現在 settings.py（用環境變數）

```python
# Bad — [MUST FIX]
SECRET_KEY = "django-insecure-abc123"
ALLOWED_HOSTS = ["*"]  # production 也是

# Good
SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "localhost").split(",")
```

## Celery / Django-Q 任務

- 任務函式必須是 idempotent（重複執行不會壞）
- 任務參數只用 serializable 型別（str, int, list, dict），不傳 Model instance
- 長時間任務必須有 timeout 設定
- 任務失敗必須有 retry 策略或 error handling

```python
# Bad — 傳 Model instance
@task
def process_product(product):  # product 是 ORM object，不可 serialize
    ...

# Good
@task
def process_product(product_id: int):
    product = Product.objects.get(id=product_id)
    ...
```

## Logging

- 每個模組 `logger = logging.getLogger(__name__)`
- 不在 log 中輸出敏感資訊
- 結構化格式方便搜尋：`logger.info("[PRODUCT] created id=%s shop=%s", product.id, shop.id)`

## 發現違規時

N+1 query、手動 parse input、混用回應格式、hardcoded secret in settings → [MUST FIX]
命名、logging 格式、soft delete 不一致 → [SUGGESTION]
