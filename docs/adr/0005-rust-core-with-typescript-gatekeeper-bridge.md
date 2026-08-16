# ADR 0005: Rustコアと最小TypeScript Gatekeeperブリッジを採用する

- 状態: accepted
- 日付: 2026-08-16

## 背景

Agent Issue Consoleの初期実装は、Cloudflare OSのCustom Gatekeeperと同じTypeScript Worker内に、
状態遷移、GitHub・LLM・Browser adapter、Durable Object永続化を配置していた。Cloudflare OSの
Gatekeeper APIは`WorkerEntrypoint`、`RpcTarget`、Cap'n Web、TypeScript型生成を前提としている。

一方、アプリケーション固有コードまでnpm ecosystemへ置くと、Shai-Huludのようなpackageを介した
supply-chain攻撃の影響範囲が広がる。Cloudflareは`workers-rs`を提供しており、Rust Workerから
Fetch、Service Binding、Durable Objectなどを利用できる。ただし`workers-rs`のWorkers RPC対応は
experimentalで、Cloudflare OSのobject-capability APIをRustだけで直接実装するには不足がある。

## 決定

次の二層構成を採用する。

1. `packages/custom-gatekeeper`はCloudflare OSとの互換層に限定する。
   - Vendor、User、Gatekeeper、read-only agent session、App UI capabilityを提供する。
   - 外部service credentialと業務状態を保持しない。
   - Rust coreを公開routeのないHTTP Service Binding経由で呼び出す。
2. `packages/agent-issue-core`を`workers-rs`で実装する。
   - intake state machine、repository policy、GitHub調査、LLM判定、Browser evidence、Issue作成、
     monitor、redaction、fingerprint、timeout/retry、Durable Object永続化を所有する。
   - per-user Durable Objectをowner IDでaddressし、他ユーザーの状態を返さない。
   - GitHub、OpenCode Go、Browser RenderingのcredentialはこのWorkerだけへWrangler secretとして渡す。

Service Binding APIはJSON over HTTPとし、primitiveとJSONだけを使う。Rust側Workerは
`workers_dev = false`かつrouteなしとし、WorkshopやInternetから直接到達できないようにする。

## Supply-chain方針

この変更はアプリケーション固有のnpm dependencyとTypeScript実行面を削減するが、Cloudflare OS、
Workshop、Wranglerのpnpm buildは残る。したがってnpm riskを完全には除去しない。

- upstream submoduleとpnpm lockfileを固定する。
- lifecycle scriptを含むdependency変更をreviewし、secretを持たない隔離buildで実行する。
- Rustはtoolchain versionと`Cargo.lock`を固定し、`cargo ... --locked`を使う。
- crateの`build.rs`とprocedural macroを実行コードとしてreviewし、将来`cargo vendor`、
  `cargo vet`、`cargo deny`をCIへ追加する。
- build環境へproduction credentialを渡さず、検証済みartifactをdeploy段階へ昇格する。

Cargo ecosystemにもsupply-chain riskは存在するため、「Rustだから安全」とは扱わない。

## 権限とデータへの影響

GitHubへの権限は変更しない。許可する書き込みはIssue作成とallowlist済みlabel追加だけである。
agent-facing sessionはread-onlyを維持し、Createの書き込みは認証済みApp UIからのみ開始する。

初回production deploy前のため既存production data migrationはない。Rust coreに新しいDurable Object
classを作成し、旧TypeScript `AgentIssueState`は新規処理から外す。既にdeployment済みの環境へ適用する
場合は別途migration計画とrollback手順を承認しなければならない。

## 検討した代替案

### 全面TypeScriptを維持する

Cloudflare OSとの互換性は最も高いが、アプリケーション固有のnpm依存範囲を減らせないため不採用とした。

### Gatekeeperを全面Rust化する

Workers RPCとCap'n WebのRust対応が成熟しておらず、手書き`wasm-bindgen` glueがsecurity boundaryになる。
upstream互換性も弱いため不採用とした。

### Cloudflare OSを使用しない

npm依存を最も大きく削減できるが、Workshop、Access、Gatekeeper、App UIという採用済みproduct基盤を
失う。今回の変更範囲を超えるため不採用とした。

## 結果

Rust Workerというdeploy単位、Service Binding、Durable Object migrationが追加される。deployは
Rust coreをCustom Gatekeeperより先に行い、最後にWorkshopを更新する。deployはatomicではないため、
production適用前に両version間の互換性とrollback可能性を確認する。
