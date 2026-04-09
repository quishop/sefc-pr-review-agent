# Skill: React / JavaScript 規範

## Hooks 規則

### useEffect（最常出錯的地方）
- dependency array 必須完整，不得遺漏
- 一個 useEffect 只做一件事，不要混合多個 side effect
- 必須有 cleanup function（event listener、subscription、timer）
- 不要在 useEffect 裡做可以在 event handler 做的事

```javascript
// Bad — [MUST FIX] 雙重 useEffect 做同一件事
useEffect(() => { onChange(formData); }, []);
useEffect(() => { onChange(formData); }, [formData]);

// Good — 單一 useEffect
useEffect(() => { onChange(formData); }, [formData]);

// Bad — 缺少 cleanup
useEffect(() => {
  const timer = setInterval(fetchData, 5000);
  // 沒有 return cleanup!
}, []);

// Good
useEffect(() => {
  const timer = setInterval(fetchData, 5000);
  return () => clearInterval(timer);
}, []);
```

### useState
- 相關的 state 合併成一個 object，不要拆成多個 useState
- state update 必須 immutable：不用 `.push()`，用 `[...arr, item]`
- 用 functional update 避免 stale closure：`setState(prev => prev + 1)`

### useCallback / useMemo
- 傳給子元件的 callback 用 `useCallback` 包裝（避免不必要的 re-render）
- expensive computation 用 `useMemo`
- 不要過度使用（簡單值不需要 memo）

## 元件規範

- 元件名稱 PascalCase，檔案名稱 PascalCase 或 kebab-case
- 一個檔案一個主要元件
- Props 如果超過 3 個，考慮用 object 傳遞
- 用 Error Boundary 包裝重要的 UI 區塊

```javascript
// Bad — 沒有 Error Boundary
<App>
  <DataView />  // 如果 crash，整個 app 白屏
</App>

// Good
<App>
  <ErrorBoundary fallback={<ErrorMessage />}>
    <DataView />
  </ErrorBoundary>
</App>
```

## API 整合

- 統一用一個 API service 層（`services/api.js`），不散落在元件裡
- Error handling 必須有 try/catch + user-facing error message
- Loading state 必須處理（disabled button、spinner）
- **絕對不在前端程式碼中硬編碼 API key**（用環境變數或 backend proxy）

```javascript
// Bad — [MUST FIX] API key 硬編碼
const API_KEY = 'Esa1NpzGJ2Orc...';

// Good — 環境變數
const API_KEY = process.env.REACT_APP_API_KEY;
```

```javascript
// Bad — error 包成 JSON string
throw new Error(JSON.stringify({ message: '錯誤', details: err.message }));

// Good — 用 Error 物件
const error = new Error('API request failed');
error.details = err.message;
throw error;
```

## Form Validation

- 定義了 validation schema（Yup/Zod）就必須使用，不要留著不用
- 在 submit handler 裡做 validation，不只依賴 HTML5 validation
- Error message 要具體，不要只顯示 "發生錯誤"

## Styling（MUI/Emotion）

- 不在 JSX 裡寫 inline style object（每次 render 都建立新物件）
- 顏色用 theme palette，不用 hardcoded hex（`#4CAF50` → `theme.palette.success.main`）
- styled component 定義在元件外面，不要在 render 裡定義

```javascript
// Bad — hardcoded color, inline style
<Button style={{ backgroundColor: '#4CAF50' }}>OK</Button>

// Good — theme + styled
const SuccessButton = styled(Button)(({ theme }) => ({
  backgroundColor: theme.palette.success.main,
}));
```

## 效能

- 大型列表用 virtualization（react-window / react-virtualized）
- 圖片用 lazy loading
- 路由層級做 code splitting（`React.lazy` + `Suspense`）
- 避免在 render 中建立新的物件/陣列/函式

## 發現違規時

硬編碼 API key、缺少 useEffect cleanup、state mutation → [MUST FIX]
useCallback/memo 缺失、hardcoded color、命名 → [SUGGESTION]
