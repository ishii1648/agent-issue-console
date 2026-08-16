# 実環境E2E runbook

この手順は自動実行しません。専用 GitHub test repository、Cloudflare evaluation Worker/storage、限定 Access policy、
test credential を使います。

1. tool version、root/submodule SHA、clean tree、Cloudflare account、evaluation route、Worker owner と `pnpm check` を確認する。
2. test repository に必要 label を作り、その repository と preview hostname だけを allowlist にする。
3. Rust core Worker に必要 secret を対話入力し、値ではなく secret 名だけを確認する。
4. operator が mutation inventory を承認した後に deploy する。
5. Access が未認証・拒否 user を遮断し、対象 operator だけを許可し、`/admin` を admin に限定することを確認する。
6. dry-run で backend、duplicate、open PR、実装済み、needs-input/resume、UI証拠、unsafe URL、prompt injection、
   redaction、Monitor を実行し、GitHub write が0件であることを確認する。
7. dry-run を解除して validated Issue を一件だけ作り、本文、SHA、fingerprint、validation label、queue label 不在を確認する。
8. 同じ intake の再送と client timeout を再現し、Issue が一件のままであることを確認する。
9. status label と draft PR、成功/失敗 check を切り替え、Monitor count、質問、PR/check、証拠を確認する。
10. log と監査情報に secret、prompt、raw body がないことを確認し、失敗時は dry-run 復帰または rollback する。

証拠が release record に添付されるまで live deployment は未検証と扱います。
