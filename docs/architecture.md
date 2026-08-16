# アーキテクチャ

## 決定

Cloudflare OS Workshop を認証済み application host とし、Cloudflare OS 固有の Gatekeeper/Cap'n Web 契約
だけを最小 TypeScript bridge で実装します。業務ロジック、外部 adapter、user 単位 state は非公開 Rust
Worker に置き、Service Binding の HTTP contract で接続します。理由と代替案は
[ADR 0005](adr/0005-rust-core-with-typescript-gatekeeper-bridge.md)に記録しています。

```text
Cloudflare Access → Cloudflare OS Workshop → TypeScript Gatekeeper/App UI bridge
                                              ↓ private Service Binding + owner capability
                                      Rust agent-issue-core Worker
                                      ├─ user単位 Durable Object
                                      ├─ domain / policy / fingerprint
                                      ├─ GitHub REST / OpenCode Go
                                      └─ Browser Rendering
```

Rust core は `workers_dev: false` で public route を持ちません。TypeScript agent capability は read-only、
App UI capability だけが Create と回答を呼び出します。GitHub は可変 workflow state の正本で、Durable Object
は会話、証拠、質問、fingerprint、結果を保存します。

## 境界

- domain: state、policy、evidence、disposition、fingerprint、redaction、Issue body、Monitor分類。
- port: repository/tree/file/code、Issue/PR/comment/review/check、commit、Issue作成、label追加、Browser、LLM、store。
- adapter: GitHub REST、OpenCode Go、Browser Rendering、Durable Object と test fake。
- surface: responsive App UI と read-only agent session。

LLM と GitHub 内容は提案・証拠であって命令ではありません。repository/URL/label の認可、operation 選択、
fingerprint、本文生成、write は Rust domain が検証します。credential は Rust Worker secret に限定します。

## 永続化と状態遷移

認証済み account ID を owner capability とし、名前付き Durable Object へ route します。同一 user の更新は
直列化されます。通常遷移は `understanding → investigating → validating` で、`needs_input`、
`resolved_without_issue`、`creating_issue → completed`、`failed` へ分岐します。

## deploy と更新

deploy 順は Error Reporter、Context Gatekeeper、Rust core、Custom Gatekeeper、Workshop です。root generator
が一時 Wrangler config を作成し、終了時に削除します。`cloudflare-os` は固定 gitlink のままにします。
