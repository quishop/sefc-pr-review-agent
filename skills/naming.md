# Skill: 命名規範

## JavaScript / TypeScript

- 變數、函式：camelCase（`getUserName`, `isLoading`）
- 元件、Class：PascalCase（`UserProfile`, `DataService`）
- 常數：UPPER_SNAKE_CASE（`MAX_RETRY_COUNT`, `API_BASE_URL`）
- 檔案名稱：kebab-case（`user-profile.tsx`, `data-service.ts`）
- 布林變數以 is / has / should / can 開頭（`isActive`, `hasPermission`）

## Python

- 變數、函式：snake_case（`get_user_name`, `is_loading`）
- Class：PascalCase（`UserProfile`, `DataService`）
- 常數：UPPER_SNAKE_CASE（`MAX_RETRY`, `DEFAULT_TIMEOUT`）
- 私有成員：前綴 `_`（`_internal_method`），不用 `__` 除非刻意 name mangling
- 模組/檔案名稱：snake_case（`user_profile.py`, `data_service.py`）

## 禁止命名（附修正建議）

| Bad | Why | Better |
|-----|-----|--------|
| `data` | 太模糊 | `userData`, `responsePayload` |
| `info` | 沒有語意 | `userProfile`, `orderDetails` |
| `temp` | 臨時到底是什麼 | `cachedResult`, `pendingItem` |
| `obj`, `val`, `res`, `ret` | 縮寫無意義 | 用完整有意義的名稱 |
| 單字母 `x`, `d`, `s` | 不可讀 | 只允許 loop `i,j,k` 和 lambda `_` |
| `Manager`, `Handler`, `Helper` | 容易變成 god class | 用具體動作命名 |

## 函式命名慣例

| 動作 | 前綴 | 例子 |
|------|------|------|
| 取值 | get / fetch | `getUser()`, `fetchOrders()` |
| 設值 | set / update | `setName()`, `updateStatus()` |
| 判斷 | is / has / can | `isValid()`, `hasPermission()` |
| 轉換 | to / from / parse | `toJSON()`, `fromDTO()` |
| 建立 / 刪除 | create / delete | `createUser()`, `deleteItem()` |
| 事件 | handle / on | `handleSubmit()`, `onClick()` |

## 發現違規時

列為 [SUGGESTION]，格式：`[SUGGESTION] file:line — \`oldName\` → \`suggestedName\` (reason)`
