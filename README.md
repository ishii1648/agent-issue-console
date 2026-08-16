# Agent Issue Console

Agent Issue Console は、粗い改善要求を調査済みかつ冪等な GitHub Issue に変換し、後続の
`codex-issue-loop` の状態を GitHub から監視する Cloudflare OS アプリケーションです。
GitHub をワークフロー状態の正本とし、shell 実行、コード変更、Mac mini 操作、coding loop 操作は行いません。

アプリケーション固有のドメインロジック、GitHub・LLM・Browser Rendering adapter、永続状態は Rust Worker
に置きます。TypeScript は Cloudflare OS の Cap'n Web Gatekeeper と App UI を接続する最小ブリッジに限定します。
Cloudflare OS 自体と Wrangler は TypeScript/npm 由来であるため npm 依存を完全には除去できませんが、
アプリケーション固有の依存面を小さくしています。

## 構成

- `packages/agent-issue-core/`: 非公開の Rust Worker。Create、Monitor、policy、adapter、Durable Object。
- `packages/custom-gatekeeper/`: Cloudflare OS 向け最小 TypeScript bridge と chat UI。
- `packages/error-reporter/`: wrapper 所有の非公開 error reporter。
- `cloudflare-os/`: 固定 SHA の upstream submodule。直接変更しません。
- `docs/`: 日本語の要件、設計、セキュリティ、運用資料。

root の履歴は `cloudflare/cloudflare-os-starter@93f14dfd68ed1c218d2a7c2168753a6d9b22e145`
のレビュー済み snapshot を owner 自身の commit として開始しています。starter の履歴は merge せず、
submodule gitlink と commit trailer で由来を追跡します。

## ローカル検証

Node.js 24、pnpm 11、Rust 1.97.1、`worker-build 0.8.5` を使用します。

```sh
git submodule update --init --recursive
pnpm install --frozen-lockfile
pnpm --dir cloudflare-os install --frozen-lockfile
cargo test --manifest-path packages/agent-issue-core/Cargo.toml --locked
pnpm test
pnpm typecheck
pnpm lint
pnpm check
```

`pnpm check` は synthetic な `deployment.dry-run.jsonc` を使い、5つの Worker と frontend を build して
Wrangler deploy dry-run を実行します。Cloudflare へ deploy はしません。

## 設定と deploy

本番の control surface は `deployment.jsonc` です。Cloudflare account、Access、Worker 名、route、repository
policy、OpenCode Go、Browser Rendering、observability を設定します。secret は設定ファイルや command argument
に置かず、対象の Rust core Worker に対して `wrangler secret put` で対話入力します。

```sh
pnpm check:deployment
pnpm deploy
```

deploy は人が account、Access/DNS、credential、課金、公開範囲を承認した後だけ行います。詳細は
[セットアップ](docs/setup.md)、[アーキテクチャ](docs/architecture.md)、[セキュリティ](docs/security.md)、
[実環境E2E](docs/runbooks/real-environment-e2e.md)を参照してください。

## upstream 更新

`upstream` の旧新 SHA と submodule gitlink の差分をすべてレビューし、受け入れた tree 差分を local commit
として適用します。`upstream/main` は merge しません。wrapper の拡張境界で実現できない変更を
`cloudflare-os/` に加える場合は、変更前に ADR、互換テスト、将来戻す方法を用意します。
