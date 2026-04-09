# Skill: PR Review

## Step 1：PR 結構驗證

確認以下欄位存在且有效，任一不符合立即回傳 CHANGES_REQUESTED：

- Jira ticket 連結，格式 PROJECT-XXX
- 變更說明，至少 20 字，不接受「fix」「update」「修正」等單詞描述
- 測試方式，需具體說明，不接受「tested locally」「手動測試」
- Checklist 全部勾選，不得有 `- [ ]` 未勾選項目

## Step 2：AC 覆蓋確認

從 Jira ticket 取得所有 Acceptance Criteria，逐條對照 diff：
- 有對應實作標記 ✅
- 找不到對應實作標記 ❌ 並列為 [MUST FIX]

## Step 3：Code 品質審查

**[MUST FIX]** 必須修正，否則不 approve：
- 邏輯錯誤或潛在 bug
- 未處理的 error 或 exception
- AC 未覆蓋的功能

**[SUGGESTION]** 建議改善，不強制：
- 可讀性改善
- 重複程式碼可抽離
- 缺少測試的關鍵路徑

**[SCOPE]** 超出 ticket 範圍的改動需標記，請作者說明原因。

## 評分標準

- 5 分：無任何問題，AC 全覆蓋
- 4 分：只有 SUGGESTION，無 MUST FIX
- 3 分：1–2 個 MUST FIX
- 2 分：3 個以上 MUST FIX 或有安全疑慮
- 1 分：AC 嚴重缺漏或結構性問題

評分 >= 4 → APPROVE
評分 <= 3 → CHANGES_REQUESTED
