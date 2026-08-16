# Observabilityとerror reporting

## 方針

Workshop、Context、Rust core、Custom Gatekeeper、Error Reporter は Worker ごとに log/trace sampling を設定します。
通常 invocation log は secret や外部本文を誤って残す可能性があるため既定で無効です。明示 error event は private
Error Reporter Worker に構造化して送ります。

## 記録してよい情報

service、environment、release、operation type、HTTP status class、retry/reconciliation outcome、redacted correlation ID、
duration を記録できます。authorization header、secret、conversation、prompt、GitHub body、source excerpt、screenshot、
LLM request/response は記録しません。

## 設定

`deployment.jsonc` の `observability` で enabled と sampling を設定します。Error Reporter の environment/release と
Worker identity は production/test で分離します。外部 vendor へ export する場合は、data residency、retention、
access、cost を人が承認した後に追加します。

## 運用

deploy 後は `wrangler tail` または Workers Logs で correlation ID と error class を確認します。秘密値らしい内容が
見つかった場合は log export を停止し、credential rotation、retention削除、redaction修正を行います。Worker rollback
は dashboard deployment history または `wrangler rollback` を使い、Rust core と bridge の互換 version を一緒に
確認します。
