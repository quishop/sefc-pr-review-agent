# Skill: Python 規範

## 型別標注

- 函式參數與回傳值必須有 type hints
- 使用 `from __future__ import annotations` 支援延遲評估
- 複雜型別使用 `TypeAlias` 或 `TypeVar`
- 禁止使用 `Any` 除非有明確理由並加註解說明

## 例外處理

- 禁止 bare `except:` 或 `except Exception:`（必須捕捉特定例外）
- 非同步程式碼中 `asyncio.CancelledError` 不得被靜默吞掉
- 每個 try/except 區塊必須有明確的錯誤處理（log 或 re-raise）

## Import 規範

- 使用 isort 排序：標準庫 → 第三方 → 本地
- 禁止 wildcard import (`from module import *`)
- 相對 import 限制在同 package 內

## 非同步處理

- async 函式必須用 `await` 呼叫，不得 floating
- 使用 `asyncio.gather()` 進行並行，不使用手動 thread
- async generator 必須有適當的清理邏輯

## 程式碼品質

- 函式長度建議不超過 50 行
- 單一函式單一職責
- 使用 dataclass 或 Pydantic model 取代 raw dict
- 字串格式化使用 f-string，不使用 % 或 .format()

## 發現違規時

bare except → [MUST FIX]
缺少 type hints → [SUGGESTION]
其餘 → [SUGGESTION]
