# テスト戦略

## 層

- Rust unit/integration: fingerprint、state、質問、allowlist、SSRF、redaction、Issue body、Monitor、write照合。
- adapter contract: typed port と fake が repository/Issue/PR/commit/write の同じ契約を満たすこと。
- bridge: owner capability が private HTTP binding にだけ転送されることと agent read authorization。
- UI: chat、responsive layout、evidence disclosure、keyboard/accessibility、loading/error。
- deployment: root `pnpm check` が5 Workerを build し Wrangler dry-run すること。

## 自動化済みシナリオ

妥当な要求の自動作成、不要な質問なし、重大判断の質問と保存状態からの再開、duplicate、open PR、merged PR、
fingerprint 冪等性、create timeout 照合、UI証拠、UI観測不足時だけの質問、repository/URL/SSRF allowlist、
prompt injection をdataとして扱うこと、secret除去、write権限不足、dry-run、5種のMonitor状態、関連PR/check、
Agent Issue Console metadata を Rust test で検証します。deployment generator、TypeScript bridge、Error Reporter は
それぞれの regression test を持ちます。

## Quality gate

```sh
cargo test --manifest-path packages/agent-issue-core/Cargo.toml --locked
cargo fmt --manifest-path packages/agent-issue-core/Cargo.toml --check
cargo clippy --manifest-path packages/agent-issue-core/Cargo.toml --all-targets --locked -- -D warnings
pnpm test
pnpm typecheck
pnpm lint
pnpm check
git diff --check
```

credential、billing、Access policy、公開 route を伴う確認は自動実行せず、専用 test repository で
`docs/runbooks/real-environment-e2e.md` を実施します。
