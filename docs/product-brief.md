# Agent Issue Console プロダクト概要

Agent Issue Console は、粗い開発要求を調査し、妥当な場合だけ GitHub Issue を作成します。Issue を作らない
場合は、根拠とともに `duplicate`、`already_implemented`、`in_progress`、`not_substantiated`、
`out_of_scope`、`blocked`、`needs_input` のいずれかを返します。その後の `codex-issue-loop` の状態は
GitHub の Issue、label、Pull Request、check から監視します。

## 利用者と目的

初期利用者は、allowlist 済み repository を扱う一人の認証済み operator です。会話形式で要望を送信し、
重複や時期尚早な Issue を避け、後続処理が着手待ち、実行中、回答待ち、失敗、完了のどこにあるか確認します。

## Create と Monitor

Create は intake、調査、必要な場合の一度だけの質問、妥当性判定、fingerprint による冪等な Issue 作成、証拠、
`agent-issue:validated` label を担当します。通常は本文 preview や確認 dialog を出さず、全 gate を満たせば
自動作成します。queue label は policy が明示的に許可した場合だけ追加します。

Monitor は GitHub を再読込し、status label、Issue、PR、comment、draft/check 状態を表示します。
Mac mini、Codex CLI、`agent-loop start/stop/answer` は操作しません。

## 成功条件

作成される Issue は重複せず、外部から検証でき、調査した default branch SHA と主要証拠を持ち、secret を
含みません。作成しない場合も、利用者が結論を追跡できる具体的な根拠を返します。
