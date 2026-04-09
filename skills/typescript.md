# Skill: TypeScript 規範

## 型別規則

- 禁止使用 `any`，以 `unknown` 搭配型別守衛替代
- 函式參數與回傳值必須明確標注型別
- 優先使用 `interface` 定義物件型別，`type` 用於 union / intersection
- 使用 `readonly` 修飾不應被修改的屬性

## 非同步處理

- 使用 `async/await`，不使用 `.then().catch()` 鏈
- 所有 async 函式必須有 try/catch 或呼叫端有錯誤處理
- Promise 不得 floating（必須 await 或 return）

## 元件規範（React）

- 元件 props 必須定義 interface，不使用 inline type
- 避免在 render 中建立新的物件或陣列（影響效能）
- useEffect 的 dependency array 必須完整

## 發現違規時

`any` 使用 → [MUST FIX]
其餘 → [SUGGESTION]
