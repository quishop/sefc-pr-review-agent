# Skill: Python 規範

## 型別標注

- 函式參數與回傳值必須有 type hints
- 禁止 `Any` 除非有註解說明理由
- 用 `TypedDict` 定義結構化 dict（不用 raw `dict[str, Any]`）
- 用 `@dataclass` 或 Pydantic `BaseModel` 做 config / metadata
- 用 `Literal` 約束有限值域（例如 status）

```python
# Bad
def process(data, config):
    return {"status": "ok"}

# Good
class ProcessResult(TypedDict):
    status: Literal["success", "failed", "timeout"]
    output: str

def process(data: InputData, config: ProcessConfig) -> ProcessResult:
    ...
```

## 例外處理（bare except = [MUST FIX]）

- 禁止 `except:` 和 `except Exception:`（必須捕捉特定例外）
- except 區塊必須 log（帶 `exc_info=True`）或 re-raise，不得空 `pass`
- 使用專案自定義 exception hierarchy（如 `AgentCoreError` 子類）
- `asyncio.CancelledError` 不得被靜默吞掉

```python
# Bad — [MUST FIX]
try:
    result = await fetch_data()
except:
    pass

# Good — 專案 pattern
try:
    result = await worker.invoke(prompt)
except (TimeoutError, asyncio.TimeoutError):
    logger.error("[%s] Worker timed out", worker_id, exc_info=True)
    return WorkerResult(status="timeout", error="...")
except WorkerError as e:
    logger.error("[%s] Worker failed: %s", worker_id, e, exc_info=True)
    raise
```

## Import 規範

- 排序：標準庫 → 第三方 → 本地（isort 風格），每組用空行分隔
- 禁止 `from module import *`
- 相對 import 限同 package 內
- 避免 circular import（用 `TYPE_CHECKING` guard）

## 非同步處理

- async 函式必須 `await`，不得 floating
- timeout 用 `asyncio.wait_for(coro, timeout=seconds)`（專案 pattern）
- 並行用 `asyncio.gather()` 或 `asyncio.TaskGroup`
- async context manager（`async with`）確保資源清理

```python
# 專案 pattern — timeout
if timeout_ms and timeout_ms > 0:
    result = await asyncio.wait_for(
        agent.invoke_async(prompt),
        timeout=timeout_ms / 1000.0,
    )
```

## Django 特定

Django 規範已獨立為 `django.md`。當 diff 包含 Django 相關檔案時會自動載入。

## 常見 Bug Pattern（[MUST FIX]）

- Mutable default：`def f(items=[])` → `def f(items=None)`
- Late binding closure：`lambda: i` in loop → `lambda i=i: i`
- `datetime.now()` 無 timezone → `timezone.now()`（Django）或 `datetime.now(tz=UTC)`
- `==` 比較 None → `is None`
- 硬編碼 secret 在程式碼中（如 `CLIENT_SECRET = "xxx"`）→ 用環境變數

## Logging 規範

- 每個模組 `logger = logging.getLogger(__name__)`
- 結構化格式：`logger.info("[TAG] field=%s", value)`
- exception 必須 `exc_info=True`
- 不要 log 敏感資訊（token、password、API key）

## 發現違規時

bare except、mutable default、hardcoded secret、N+1 query → [MUST FIX]
缺 type hints、logging 格式、命名 → [SUGGESTION]
