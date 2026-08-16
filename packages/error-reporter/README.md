# Error Reporter

Cloudflare OS が明示的に報告する backend error を受け取る private Worker です。外部 vendor account がなくても
Workers Logs 上で構造化 event を調査できます。

## データ方針

service、environment、release、error category、redacted message/correlation ID のみを扱います。secret、authorization、
conversation、prompt、GitHub/LLM body、source、screenshot を送らないでください。invocation log は既定で無効です。

## 検証

```sh
pnpm --filter error-reporter test
pnpm --filter error-reporter types:check
pnpm --filter error-reporter build
```

外部 observability vendor、長期 retention、production sampling の変更は別途 operator 承認が必要です。
