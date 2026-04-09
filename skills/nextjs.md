# Skill: Next.js 框架規範

## App Router 架構

### Server Component vs Client Component
- **預設是 Server Component**，不需要標註
- 只有需要 interactivity（state、effect、browser API）才加 `'use client'`
- `'use client'` 的位置越深越好（葉子元件），不要加在 layout 或 page 層級

```tsx
// Bad — [MUST FIX] Server Component 裡用了 client hooks
export default function ProductPage() {
  const [count, setCount] = useState(0);  // Server Component 不能用 useState
  return <div>{count}</div>;
}

// Good — 拆分 Server / Client
// app/products/page.tsx (Server Component)
export default async function ProductPage() {
  const products = await fetchProducts();  // server-side fetch
  return <ProductList products={products} />;
}

// components/ProductList.tsx (Client Component)
'use client';
export function ProductList({ products }: Props) {
  const [filter, setFilter] = useState('');
  return ...;
}
```

### 資料取得
- Server Component 用 `fetch()` 或直接呼叫 DB/API（不經 client）
- 不在 Server Component 用 `useEffect` + `fetch`（那是 client pattern）
- `fetch()` 預設有 cache，用 `{ cache: 'no-store' }` 或 `{ next: { revalidate: 60 } }` 控制

```tsx
// Bad — client-side fetch in Server Component
export default function Page() {
  const [data, setData] = useState(null);
  useEffect(() => { fetch('/api/data').then(...) }, []);  // 不應該這樣
}

// Good — server-side fetch
export default async function Page() {
  const data = await fetch('https://api.example.com/data', {
    next: { revalidate: 60 },  // ISR: 60 秒重新驗證
  }).then(r => r.json());
  return <DataView data={data} />;
}
```

### Route Handler（API Routes）
- 放在 `app/api/` 目錄，用 `route.ts`
- export `GET`, `POST`, `PUT`, `DELETE` 函式（不用 `handler`）
- 用 `NextRequest` / `NextResponse` 型別
- 驗證 request body（用 zod 或手動驗證）

```tsx
// Bad — 無驗證
export async function POST(request: NextRequest) {
  const body = await request.json();  // 直接信任 input
  await db.insert(body);
}

// Good
import { z } from 'zod';
const schema = z.object({ name: z.string().min(1), email: z.string().email() });

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  await db.insert(parsed.data);
  return NextResponse.json({ success: true }, { status: 201 });
}
```

## Routing 規範

### 檔案結構
- `page.tsx` — 頁面元件
- `layout.tsx` — 共享 layout（不要在這裡放 `'use client'`）
- `loading.tsx` — Suspense fallback
- `error.tsx` — Error boundary（必須是 `'use client'`）
- `not-found.tsx` — 404 頁面

### 動態路由
- `params` 必須做型別驗證，不要直接信任

```tsx
// Bad — 直接信任 params
export default async function Page({ params }: { params: { id: string } }) {
  const product = await getProduct(params.id);  // id 可能是任意字串
}

// Good — 驗證後使用
export default async function Page({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) notFound();
  const product = await getProduct(id);
  if (!product) notFound();
}
```

## 效能規範

### Image
- `<img>` → `next/image`（[MUST FIX] 如果是使用者可見的圖片）
- 必須設定 `width` + `height` 或 `fill`（避免 CLS）
- 外部圖片來源加到 `next.config.js` 的 `images.remotePatterns`

```tsx
// Bad — [MUST FIX]
<img src="/hero.jpg" />
<img src={product.imageUrl} />

// Good
import Image from 'next/image';
<Image src="/hero.jpg" width={800} height={400} alt="Hero" />
<Image src={product.imageUrl} fill alt={product.name} sizes="(max-width: 768px) 100vw, 50vw" />
```

### Link
- `<a>` → `next/link`（[SUGGESTION]）
- 外部連結用 `<a target="_blank" rel="noopener noreferrer">`

### Code Splitting
- 大型元件用 `dynamic()` lazy load
- `ssr: false` 只用在真的不需要 SSR 的元件（如 chart library）

```tsx
import dynamic from 'next/dynamic';

const HeavyChart = dynamic(() => import('@/components/Chart'), {
  loading: () => <Skeleton />,
  ssr: false,
});
```

### Metadata
- 每個 page 必須 export `metadata` 或 `generateMetadata`
- 至少包含 `title` 和 `description`

```tsx
// Good
export const metadata: Metadata = {
  title: '商品列表 | Quishop',
  description: '瀏覽所有商品',
};
```

## Middleware

- `middleware.ts` 放在專案根目錄（不在 `app/` 裡面）
- 用 `matcher` 限制執行範圍，不要每個 request 都跑
- 認證檢查放 middleware，不要散落在每個 page

```typescript
// Good
export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
};

export function middleware(request: NextRequest) {
  const token = request.cookies.get('session');
  if (!token) return NextResponse.redirect(new URL('/login', request.url));
}
```

## 環境變數

- Client-side 環境變數必須用 `NEXT_PUBLIC_` 前綴
- Server-only 的 secret 不加 `NEXT_PUBLIC_`（洩漏到 client = [MUST FIX]）
- 用 `env.mjs` 或 zod 做 runtime 驗證

```typescript
// Bad — [MUST FIX] server secret 暴露給 client
const apiKey = process.env.NEXT_PUBLIC_API_SECRET;  // 任何人都能看到

// Good
// Server Component / Route Handler 裡直接用
const apiKey = process.env.API_SECRET;  // 不帶 NEXT_PUBLIC_，client 看不到
```

## Error Handling

- 每個 route segment 建議有 `error.tsx`（catch 該區塊的 runtime error）
- `error.tsx` 必須是 `'use client'`
- 提供 retry 機制（`reset` function）

```tsx
'use client';
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div>
      <h2>發生錯誤</h2>
      <p>{error.message}</p>
      <button onClick={reset}>重試</button>
    </div>
  );
}
```

## 常見 Bug Pattern（[MUST FIX]）

- Server Component 裡用 `useState` / `useEffect` / `useRouter`（push/replace 是 client-only）
- `'use client'` 加在 layout.tsx 導致整個子樹都變 client
- `fetch()` 在 Server Component 裡用相對路徑（`/api/...`）→ build 時會失敗，用完整 URL
- `cookies()` / `headers()` 在非 Server Component 中呼叫
- `redirect()` 放在 try/catch 裡（redirect 會 throw，被 catch 攔住就不會跳轉）

```tsx
// Bad — [MUST FIX] redirect 被 catch 吞掉
try {
  if (!user) redirect('/login');  // throws NEXT_REDIRECT
  ...
} catch (e) {
  // redirect 的 throw 被這裡攔住了！
}

// Good — redirect 放在 try/catch 外面
if (!user) redirect('/login');
try {
  ...
} catch (e) {
  ...
}
```

## 發現違規時

Server Component 用 client hooks、`<img>` 取代 `next/image`、secret 暴露到 client → [MUST FIX]
metadata 缺失、code splitting、`<a>` 取代 `next/link` → [SUGGESTION]
