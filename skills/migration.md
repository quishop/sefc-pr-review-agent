# Skill: DB Migration 規範

## 必要條件（[MUST FIX]）

- 每個 migration 必須有 rollback（down migration / `reverse_code`）
- 不得在 migration 中執行業務邏輯，只做 schema 變更
- migration 檔案名稱需包含時間戳記

## 危險操作（發現即 [MUST FIX]）

| 操作 | 風險 | 正確做法 |
|------|------|---------|
| `DROP TABLE` | 資料永久遺失 | 先確認無依賴，加 `IF EXISTS`，先 backup |
| `DROP COLUMN` | 程式碼可能還在讀這個欄位 | 先在 code 移除引用 → deploy → 再 drop |
| `NOT NULL` 無預設值 | 既有 row 會失敗 | 先加 nullable → backfill → 再 set NOT NULL |
| `ALTER TABLE` 大表 | 長時間 lock | 評估 row count，考慮 online migration |
| `RENAME COLUMN` | 程式碼 / ORM 會壞 | 新增 column → 雙寫 → 遷移 → 刪舊 |
| 修改 column type | 隱式 cast 可能 data loss | 新增 column → 轉換 → 驗證 → 切換 |

## Django 特定

- `makemigrations` 產生的自動 migration 需 review，不要盲目 commit
- 自訂 `RunPython` 必須有 `reverse_code`（不能只有 `migrations.RunPython.noop`，除非真的不可逆）
- `AddField` with `default` 在大表上會 rewrite 整張表 → 考慮分步驟
- `ForeignKey` 的 `on_delete` 必須明確選擇（不要用 `CASCADE` 除非確定）
- `unique_together` / `UniqueConstraint` 新增前確認沒有重複資料

```python
# Bad — no reverse, business logic in migration
class Migration(migrations.Migration):
    operations = [
        migrations.RunPython(populate_default_data),  # no reverse_code
    ]

# Good
class Migration(migrations.Migration):
    operations = [
        migrations.RunPython(
            populate_default_data,
            reverse_code=clear_default_data,
        ),
    ]
```

## 關聯確認

- Migration 對應的 Model 變更是否在同一個 PR
- ORM schema 和 migration 是否一致（跑 `makemigrations --check` 不應產生新 migration）
- 有 ForeignKey 變更時，被參照的 model 也要檢查

## 建議事項（[SUGGESTION]）

- 新增欄位建議先 nullable → backfill → NOT NULL（三步驟）
- Index 新增評估 write 效能影響
- 大表 migration 附上預估的 row count 和鎖定時間
- 考慮使用 `SeparateDatabaseAndState` 做零停機 migration

## 發現違規時

DROP 無確認、無 rollback、NOT NULL 無預設值 → [MUST FIX]
Index 效能、migration 步驟建議 → [SUGGESTION]
