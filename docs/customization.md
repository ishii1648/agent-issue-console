# Cloudflare OSのカスタマイズ

## Control surface

- `/admin`: site name、logo、accent color、announcement、agent instructions、connector公開範囲。再deploy不要。
- `deployment.jsonc`: Access、route、Worker identity、storage、AI、repository policy、observability。再deploy必要。
- `packages/custom-gatekeeper`: Cloudflare OS bridge と App UI。
- `packages/agent-issue-core`: Rust domain、adapter、state。公開 route は持たせない。

## Sign-in

この wrapper は Cloudflare Access mode を使います。active zone の hostname に self-hosted Access application を
作成し、issuer origin、audience tag、admin email を `deployment.jsonc` に設定します。evaluation で zone を使わない
場合だけ `workersDev: true` にします。本番 hostname、Access policy、公開範囲は人の承認事項です。

## Repository policy

各 repository に validation label、queue label、5種の status label、auto queue、preview URL/hostname、UI証拠必須、
dry-run を設定します。default repository も allowlist entry が必要です。最初は dry-run、auto queue off、preview
なしを推奨します。

## AIとBrowser

OpenCode Go の model、HTTPS base URL、timeout、retry、context/output limit を設定します。API key は Rust core
Worker secret です。Browser Rendering は信頼する専用 preview hostname だけに限定し、ADR 0003 の redirect 制約が
解消されるまで本番の visual evidence 必須化を避けます。

## Storage

Workshop/Context は starter の KV/R2/Artifacts 設定を使います。Rust core の intake は user 単位 Durable Object
SQLite storage に保存します。production と test の Worker/storage 名を分けます。

## Upstream更新

1. `git fetch upstream --tags` と submodule remote fetch を行う。
2. 現在と候補の starter SHA、submodule gitlink、dependency、migration、security boundary を比較する。
3. `upstream/main` は merge せず、受け入れた snapshot delta を owner-authored commit として適用する。
4. Rust/bridge test、upstream build、5 Worker dry-run、rollback compatibility を確認する。
5. old/new SHA と既知制約を commit/PR に記録する。

`cloudflare-os/` への直接変更が必要なら、変更前に理由、代替案、更新影響、戻し方を ADR に記録します。
