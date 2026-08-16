# 実装計画

1. owner-authored starter snapshot、upstream remote、固定 submodule、作業 branch を確立する。
2. 要件、状態、capability、security、upstream 方針を日本語文書と ADR に固定する。
3. Rust core に domain、fingerprint、Issue body、redaction、Monitor、fake を実装する。
4. Rust typed port と GitHub/OpenCode Go/Browser Rendering/Durable Object adapter を実装する。
5. TypeScript Gatekeeper を owner-scoped private HTTP bridge と App UI に縮小する。
6. Create vertical slice、質問と再開、冪等 create、Monitor を結合する。
7. Rust/toolchain/dependency を固定し、unit、bridge、build、typecheck、clippy、deploy dry-run を通す。
8. setup、実環境E2E、既知制約を更新し、論理 commit、push、draft PR を作成する。

production deploy、Access/DNS変更、credential登録、GitHub App作成、provider課金、visual evidence有効化は operator
承認後に行います。
