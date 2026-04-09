# Skill: 命名規範

## 通用規則

- 變數、函式：camelCase
- 元件、Class：PascalCase
- 檔案名稱：kebab-case
- 常數：UPPER_SNAKE_CASE
- 布林變數以 is / has / should 開頭，例如 isLoading、hasError

## 禁止事項

- 不使用單字母變數（除迴圈 index i、j、k 外）
- 不使用縮寫，除非是公認慣例（id、url、api、dto）
- 不使用 data、info、temp、obj 等無意義命名
- TypeScript 專案禁止使用 any 型別

## 函式命名

- 取值：getXxx
- 設值：setXxx
- 判斷：isXxx / hasXxx / checkXxx
- 事件處理：handleXxx / onXxx
- 非同步：fetchXxx / loadXxx / saveXxx

## 發現違規時

列為 [SUGGESTION]，說明違規位置和建議名稱。
