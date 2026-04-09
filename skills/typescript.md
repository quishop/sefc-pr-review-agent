# Skill: TypeScript 規範

## 型別規則

- 禁止 `any` → [MUST FIX]。用 `unknown` + type guard 替代
- 函式參數與回傳值必須標注型別
- 物件型別優先用 `interface`，`type` 用於 union / intersection / mapped types
- 用 `readonly` 保護不應被修改的屬性
- 用 `as const` 取代 enum（更好的 tree shaking）

```typescript
// Bad — [MUST FIX]
function parse(data: any) { return data.name; }

// Good
function parse(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'name' in data) {
    return (data as { name: string }).name;
  }
  throw new Error('Invalid data');
}
```

## 非同步處理

- `async/await` 取代 `.then().catch()` 鏈
- 所有 async 函式必須有 error handling（try/catch 或 caller 處理）
- Promise 不得 floating（必須 `await`、`return`、或 `.catch()`）
- 用 `Promise.all()` 並行，避免 sequential await loop

```typescript
// Bad — sequential, slow
for (const id of ids) {
  await fetchUser(id);  // N requests in series
}

// Good — parallel
await Promise.all(ids.map(id => fetchUser(id)));
```

## React 元件

- Props 必須定義 `interface`，不用 inline type
- 避免在 render 中建立新物件/陣列（每次 render 都觸發 re-render）
- `useEffect` dependency array 必須完整（lint rule: react-hooks/exhaustive-deps）
- `useCallback` / `useMemo` 用在 expensive computation 或傳給子元件的 callback
- 不在 `useEffect` 裡做可以在 event handler 裡做的事

```tsx
// Bad — creates new object every render
<Button style={{ color: 'red' }} onClick={() => handleClick(id)} />

// Good
const buttonStyle = useMemo(() => ({ color: 'red' }), []);
const handleButtonClick = useCallback(() => handleClick(id), [id]);
<Button style={buttonStyle} onClick={handleButtonClick} />
```

## Next.js 特定

- Server Component 不要用 `useState`、`useEffect`（那是 Client Component 的）
- `'use client'` 只加在真正需要 interactivity 的元件
- 資料 fetch 優先在 Server Component 用 `fetch()` + cache
- 動態路由的 `params` 要做型別驗證
- `next/image` 取代 `<img>`，`next/link` 取代 `<a>`

## 常見 Bug Pattern（[MUST FIX]）

- Optional chaining 後直接 `.length`：`arr?.length > 0` → `(arr?.length ?? 0) > 0`
- `==` 比較（應用 `===`，除了 `== null` 檢查）
- `JSON.parse()` 沒有 try/catch
- `useEffect` 缺少 cleanup function（event listener、subscription、timer）
- State update 不是 immutable：`state.items.push(x)` → `[...state.items, x]`

## 發現違規時

`any` 使用、bug pattern → [MUST FIX]，附 file:line 和修正建議
元件規範、命名 → [SUGGESTION]
