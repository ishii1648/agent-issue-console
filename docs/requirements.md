# 要件定義

## 機能要件

1. 会話、正規化した要望、状態、証拠、質問、回答、結果を user 単位で永続化し、再読込後も再開する。
2. 状態は `understanding`、`investigating`、`needs_input`、`validating`、`creating_issue`、
   `completed`、`resolved_without_issue`、`failed` を区別する。
3. repository metadata、default branch SHA、code、Issue、PR、commit と必要な UI 証拠を調査する。
4. 判定結果は `create_issue` と7種の Issue 非作成 disposition を型で表す。
5. allowlist、責務、重複、現在動作、期待動作、完了条件、重大判断、SHA、安全な証拠の全 gate を満たす場合だけ作成する。
6. repository、正規化要望、安定識別子から SHA-256 fingerprint を作り、作成直前と timeout 後に検索する。
7. validation label のみを既定で付け、auto queue は policy が有効な場合だけ行う。
8. Monitor は5状態、unqueued、関連PR、draft、check、質問、証拠を表示する。
9. UI 証拠に URL、環境、viewport、title、主要text/accessibility、screenshot、時刻を含める。
10. LLM 境界を provider から分離し、最初の adapter は OpenCode Go とする。
11. dry-run では読み取りと判定まで行い、GitHub へ一切書き込まない。
12. GitHub、Browser、LLM、state は typed port と deterministic fake を持つ。

## 質問する条件

外部動作を大きく変える選択、repository 不明、code/test でも確定できない UI 観測不足、認証・権限・公開・
課金・削除、矛盾する受け入れ条件、安全に推定できない事実、allowlist 外 repository の場合だけ、一度に一つ
質問します。回答後は保存済み証拠から再開します。

## Issueを作らない条件

同等 Issue、対応中 PR、実装済み、期待を既に満たす、問題を確認できない、責務外、調査・書込権限不足、
secret を安全に除けない、回答待ちの場合は作成しません。調査不能を自動的な調査 Issue にしません。

## 非機能要件

- 最小権限、fail closed、user 単位認可、監査可能性、prompt injection 分離、secret redaction。
- timeout、限定 retry、rate limit 配慮、context/output 上限、曖昧な write の照合。
- keyboard 操作可能で responsive な chat UI と折りたたみ証拠。
- credential/network 不要の fake-backed test。
- Cargo/npm とも lockfile を固定し、依存追加をレビューする。
- 固定 upstream と wrapper を独立して更新可能にする。

## 非ゴール

Mac mini/Codex CLI 操作、shell、code/branch/commit/PR/merge/comment の変更、任意 repository/URL、GitHub
以外の tracker、複数 tenant、高度な vector search、全 provider 対応、危険操作の自動承認は含みません。
