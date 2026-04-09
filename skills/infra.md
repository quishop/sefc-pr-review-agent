# Skill: Infrastructure 規範

## Terraform

- 所有資源必須有 `tags` 標記（環境、專案、負責人）
- 不得 hardcode 敏感資訊，使用 variable 或 secrets manager
- `terraform plan` 輸出需在 PR description 貼上或附上 link
- 刪除資源前需確認無其他資源依賴

## Kubernetes

- 所有 deployment 必須設定 resource requests 和 limits
- 不使用 `latest` tag，必須指定明確版本號
- 需有 liveness 和 readiness probe
- 敏感資料使用 Secret 而非 ConfigMap

## Docker

- base image 必須指定明確版本，不使用 `latest`
- 避免以 root 執行容器，使用 non-root user
- 多階段 build 減少 image 大小
- .dockerignore 需排除不必要的檔案

## GitHub Actions Workflow

- secrets 必須透過 `${{ secrets.XXX }}` 引用，不得 hardcode
- 第三方 action 必須 pin 到特定 commit SHA，不使用 `@main` 或 `@latest`
- 需有適當的 permission 設定，遵循最小權限原則

## 發現違規時

hardcode secret → [MUST FIX]
latest tag → [MUST FIX]
其餘 → [SUGGESTION]
