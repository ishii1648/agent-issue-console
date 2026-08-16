# プロダクト仕様

## Repository policy

policy は `repository`、validation/queue label、5種の status label、`autoQueueAfterCreate`、preview URL、
preview hostname allowlist、UI証拠必須 flag、dry-run を持ち、adapter 呼出前に検証します。

## Intake と判定

terminal result は disposition、summary、repository、default SHA、evidence、fingerprint、任意の Issue reference
を返します。LLM が質問できるのは回答前の一度だけで、回答後も決まらない場合は `blocked` です。Issue 作成
直前に Issue、PR、fingerprint を再検索します。

## Fingerprint

全角 ASCII/space を互換文字へ寄せ、小文字化、trim、連続空白の縮約、末尾の軽微な句読点除去を行います。
`v1\n<owner/repo>\n<normalized request>\n<sorted identifiers>` を SHA-256 で hash し、非表示 metadata
として本文に埋めます。open/closed を問わず一致を優先します。

## Issue本文

「問題」「現在の動作」「調査結果」「期待する動作」「完了条件」「非ゴール」「Agent Issue Console metadata」
で構成し、default SHA、主要証拠、fingerprint を記録します。内部実装を完了条件に固定しません。

## GitHub境界

typed read は repository/default SHA/tree/file/code、Issue/comment、PR/diff/review/check、commit/diff を扱います。
write は Issue 作成と policy 許可済み label 追加だけです。各 fetch は timeout signal を使い、read を限定 retry
します。Issue create エラーは再送前に fingerprint で照合します。

## Monitor と UI証拠

status 優先度は failed、needs-input、running、ready、done で、validation label だけなら `unqueued` です。
UI は HTTPS と exact hostname allowlist を要求し、URL credential、localhost、private/link-local/reserved IP、
metadata host を拒否します。390×844 で capture し、`allowRequestPattern` で同一 hostname の request だけを許可します。

## Error処理

利用者向け error は redaction します。dry-run は full validation 後に write せず終了します。期待動作・完了条件
不足は `not_substantiated`、write 権限不足は `blocked` です。
