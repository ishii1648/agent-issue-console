# ADR 0002: GitHubをワークフロー状態の正本にする

- 状態: accepted
- 日付: 2026-08-16

Issue label、PR association、check を Monitor state の正本とします。Durable Object は intake と証拠を保存しますが、
GitHub の可変 workflow state を上書きしません。Mac mini と `codex-issue-loop` API は MVP の範囲外です。
Issue 作成と queue 投入は分離し、auto-queue は既定で無効にします。
