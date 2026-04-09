# Skill: PR Review

## Step 1：PR 結構驗證

確認以下欄位存在且有效：

- Jira ticket 連結，格式 PROJECT-XXX → 缺少列為 [SUGGESTION]
- 變更說明，至少 20 字，不接受「fix」「update」「修正」等單詞描述 → 不符合列為 [SUGGESTION]
- 測試方式，需具體說明，不接受「tested locally」「手動測試」→ 缺少列為 [SUGGESTION]

注意：PR description 的格式問題（未勾選 checklist、缺少欄位）是 [SUGGESTION]，不是 [MUST FIX]。
只有程式碼的邏輯錯誤和安全問題才能列為 [MUST FIX]。

## Step 2：AC 覆蓋確認

如果有 Jira Acceptance Criteria，逐條對照 diff：
- 有對應實作 → ✅ Covered
- 找不到對應實作 → ❌ Not covered，列為 [MUST FIX]
- Ticket 沒有定義 AC → 標注「No AC defined in ticket」

如果無法取得 Jira ticket（MCP 失敗或無 ticket），標注「Jira AC unavailable」並繼續 code review。

## Step 3：Code 品質審查

**[MUST FIX]** 必須修正（僅限以下情況）：
- 程式碼邏輯錯誤或潛在 bug
- 未處理的 error 或 exception
- 安全漏洞（hardcoded secret、SQL injection、XSS）
- AC 明確要求但未實作的功能

**[SUGGESTION]** 建議改善，不強制：
- 可讀性改善
- 命名規範
- 重複程式碼可抽離
- 缺少測試的關鍵路徑
- PR description 格式問題

**[SCOPE]** 超出 ticket 範圍的改動需標記，請作者說明原因。

## 評分標準

- 5 分：無任何問題，AC 全覆蓋（或無 AC）
- 4 分：只有 SUGGESTION，無 MUST FIX
- 3 分：1–2 個 MUST FIX
- 2 分：3 個以上 MUST FIX
- 1 分：嚴重安全漏洞或結構性問題

評分 >= 4 → APPROVE
評分 <= 3 → CHANGES_REQUESTED
