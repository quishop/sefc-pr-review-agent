# Skill: Python 規範

## 型別標注

- 函式參數與回傳值必須有 type hints
- 禁止使用 `Any` 除非有明確註解說明理由
- 複雜型別使用 `TypeAlias`、`TypeVar` 或 `Protocol`
- 回傳 `None` 的函式標注 `-> None`

```python
# Bad
def process(data, config):
    ...

# Good
def process(data: dict[str, Any], config: ProcessConfig) -> ProcessResult:
    ...
```

## 例外處理（bare except = [MUST FIX]）

- 禁止 `except:` 和 `except Exception:`（必須捕捉特定例外）
- `asyncio.CancelledError` 不得被靜默吞掉
- 每個 except 區塊必須 log 或 re-raise，不得空 `pass`
- 不要用 exception 做流程控制

```python
# Bad — [MUST FIX]
try:
    result = await fetch_data()
except:
    pass

# Good
try:
    result = await fetch_data()
except httpx.TimeoutException:
    logger.warning("Fetch timeout, using cached data")
    result = get_cached_data()
```

## Import 規範

- 排序：標準庫 → 第三方 → 本地（isort 風格）
- 禁止 `from module import *`
- 避免 circular import（如果需要，用 `TYPE_CHECKING` guard）

## 非同步處理

- async 函式必須 `await`，不得 floating promise
- 並行用 `asyncio.gather()` 或 `asyncio.TaskGroup`，不用 `threading`
- `async with` 確保資源清理（DB connection、HTTP session）
- timeout 使用 `asyncio.wait_for()` 或 `asyncio.timeout()`

## Django 特定

- View 必須有適當的 permission class
- `QuerySet` 避免 N+1：用 `select_related()` / `prefetch_related()`
- `Model.objects.all()` 在 view 中必須加 filter 或 pagination，不得無限制查詢
- Form/Serializer 的 `validate()` 不要有 side effect
- 自訂 migration 必須有 `reverse_code`

## 常見 Bug Pattern（發現即 [MUST FIX]）

- Mutable default argument：`def f(items=[])` → `def f(items=None)`
- Late binding closure：`for i in range(n): fns.append(lambda: i)` → 用 default arg `lambda i=i: i`
- `datetime.now()` 沒帶 timezone → 用 `datetime.now(tz=UTC)` 或 Django 的 `timezone.now()`
- `==` 比較 `None` → 用 `is None`
- `os.path.join` 拼接使用者輸入 → path traversal 風險

## 程式碼品質（[SUGGESTION]）

- 函式超過 50 行 → 建議拆分
- 用 `dataclass` 或 Pydantic `BaseModel` 取代 raw dict
- f-string 取代 `%` 和 `.format()`
- 用 `pathlib.Path` 取代 `os.path`

## 發現違規時

bare except、mutable default、N+1 query → [MUST FIX]
缺少 type hints、程式碼品質 → [SUGGESTION]
