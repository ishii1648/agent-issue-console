# セットアップとローカル運用

## 前提

Node.js 24、pnpm 11、Rust 1.97.1、`wasm32-unknown-unknown`、`worker-build 0.8.5` を使用します。

```sh
rustup toolchain install 1.97.1 --profile minimal --component rustfmt,clippy --target wasm32-unknown-unknown
cargo install worker-build --version 0.8.5 --locked
git submodule update --init --recursive
pnpm install --frozen-lockfile
pnpm --dir cloudflare-os install --frozen-lockfile
```

`worker-build 0.8.5` の新 panic recovery path は現在の WASM 出力で `externref table` error になるため、build は
明示的に `--no-panic-recovery` を固定しています。panic 時は request が失敗し、次の isolate で復旧します。

## ローカル検証

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm check
```

`pnpm check` は `deployment.dry-run.jsonc` から一時 config を生成し、5 Worker/frontend を build、Wrangler dry-run
した後に一時 file を削除します。`pnpm check:deployment` は operator 所有の本番設定を検証します。

## Secret

account と Rust core Worker 名を確認した後、値を command line に含めず対話入力します。

```sh
pnpm exec wrangler secret put GITHUB_TOKEN --name <agent-issue-core-worker>
pnpm exec wrangler secret put OPENCODE_GO_API_KEY --name <agent-issue-core-worker>
pnpm exec wrangler secret put CLOUDFLARE_ACCOUNT_ID --name <agent-issue-core-worker>
pnpm exec wrangler secret put CLOUDFLARE_BROWSER_TOKEN --name <agent-issue-core-worker>
```

GitHub App token は allowlist repository の Metadata read、Contents read、Issues read/write、Pull requests read、
Checks read に限定します。Contents write、Administration、Workflows、Deployments、PR write は付与しません。
Browser secret は preview URL policy を使う場合だけ必要です。

## Runtime

Access、Worker identity、storage、route の承認後に deploy し、`/admin` で Agent Issue Console Gatekeeper を対象
operator に有効化します。agent-facing session は read-only、Create は App UI のみです。最初は `dryRun: true`、
`autoQueueAfterCreate: false` とし、専用 test repository の E2E 後だけ dry-run を解除します。
