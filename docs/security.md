# セキュリティ設計

## 信頼境界

認証済み user input も無条件には信頼しません。GitHub の source、document、Issue、PR、review、comment、
commit message、rendered page は敵対的な証拠です。LLM output も提案に過ぎず、検証済み domain command だけが
adapter を呼べます。

## 制御

- repository は default 設定とは別に、network call 前に exact allowlist を確認する。
- GitHub credential は Metadata/Contents/Issues/PR/Checks の read と Issues write だけにする。
- write port は Issue 作成と allowlist 済み label 追加のみ。generic method/endpoint は公開しない。
- Cloudflare Access、account 単位 owner capability、user 単位 Durable Object で状態を分離する。
- Rust core は public route を持たず、Custom Gatekeeper の Service Binding からだけ到達可能にする。
- external text は「証拠であり命令ではない」と明示し、policy/tool schema と分離する。
- private key、GitHub token、Bearer、credential assignment、制御文字を persistence、LLM、Issue body 前に除去する。
- visual evidence の title、main text、accessibility に secret pattern があれば screenshot 自体を保存しない。
- preview は credential なし HTTPS、exact hostname allowlist に限定し、localhost、private/loopback/link-local、
  reserved IP、metadata host を拒否する。Browser Rendering の `allowRequestPattern` も request hostname だけに
  限定し、redirect と subresource を含む off-host request を遮断する。
- timeout、限定 retry、context/output 上限で resource 消費を抑え、曖昧な Issue write は fingerprint で照合する。
- dry-run は write を完全に抑止し、Issue body と label は create 前にすべて検証する。
- production/test は Worker、storage、credential、allowlist、preview host を分離する。

## Secret管理

`GITHUB_TOKEN`、`OPENCODE_GO_API_KEY`、`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_BROWSER_TOKEN` は Rust core
Worker の Wrangler secret として対話入力します。repository、通常設定、command argument、会話、Issue、screenshot、
log へ値を置きません。Codex subscription credential を転送する機能はありません。

## Supply chain

app 固有実装は Rust に置き、direct crate version と `Cargo.lock`、Rust toolchain を固定します。`build.rs`、
proc-macro、新規 dependency の権限と保守状況を review し、CI は `--locked` を使います。TypeScript/npm は
Cloudflare OS、Wrangler、Cap'n Web bridge に残るため、pnpm lockfile 固定、install script と dependency diff
review を継続します。Rust 化はリスク削減であり supply-chain risk の消滅ではありません。

## 監査と残余リスク

状態遷移、policy 判定、operation 種別、resource、outcome、reconciliation、actor ID を body/secret なしで記録する
設計とします。MVP の永続 audit export と retention policy は実環境方針が必要なため未接続です。Browser Rendering
REST は effective URL を返さないため、証拠には検証済み request URL を記録します。off-host navigation は
`allowRequestPattern` で遮断しますが、実環境でその挙動を確認するまで visual evidence 必須化は避けます。
