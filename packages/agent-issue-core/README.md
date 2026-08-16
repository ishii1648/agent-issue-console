# Agent Issue Console Rustコア

このpackageは、Agent Issue Consoleの業務ロジック、外部API adapter、per-user Durable Objectを
所有するprivate Cloudflare Workerである。public routeを持たず、Custom Gatekeeperから
Service Binding経由でのみ呼び出す。

```sh
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test --locked
worker-build --release --no-panic-recovery
```

`GITHUB_TOKEN`、`OPENCODE_GO_API_KEY`、`CLOUDFLARE_ACCOUNT_ID`、
`CLOUDFLARE_BROWSER_TOKEN`はこのWorkerのWrangler secretへ登録する。値をsource、設定、logへ
記録してはならない。
