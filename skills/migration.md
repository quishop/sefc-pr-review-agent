# Skill: DB Migration 規範

## 必要條件（缺少即 MUST FIX）

- 每個 migration 必須有對應的 rollback（down migration）
- migration 檔案名稱需包含時間戳記，例如 `20240101_add_users_table`
- 不得在 migration 中執行業務邏輯，只做 schema 變更

## 危險操作檢查（發現即 MUST FIX）

- 直接 DROP TABLE 或 DROP COLUMN（應先確認無資料依賴）
- 在大型資料表上新增 NOT NULL 欄位而無預設值
- 移除欄位前未確認應用程式已不再使用該欄位

## 建議事項（SUGGESTION）

- 新增欄位建議先設為 nullable，待資料填充後再設為 NOT NULL
- index 的新增應評估對 write 效能的影響
- 有外鍵約束的操作需注意順序

## 關聯確認

- migration 對應的 model 變更是否一併更新
- ORM schema 定義是否與 migration 一致
