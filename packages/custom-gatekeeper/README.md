# Agent Issue Console Custom Gatekeeper

Cloudflare OS の `WorkerEntrypoint`、Cap'n Web、App UI と Rust core を接続する最小 TypeScript bridge です。
業務ロジック、GitHub/LLM/Browser credential、intake state は保持しません。

agent-facing `CustomSession` は保存済み intake と Monitor summary の read-only capability です。Create と回答は
認証済み App UI capability から、private `AIC_CORE` Service Binding を通して実行します。bridge は account ID を
owner capability header として付与し、Rust Durable Object の user state を分離します。

```sh
pnpm --filter custom-gatekeeper test
pnpm --filter custom-gatekeeper types:check
pnpm --filter custom-gatekeeper build
```

generic outbound API、credential forwarding、GitHub write をこの package に追加しないでください。Cloudflare OS
契約変更へ追随する場合も、domain は Rust 側に保ちます。
