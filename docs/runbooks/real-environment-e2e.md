# Real-environment E2E runbook

This runbook is intentionally not automatic. Use a dedicated GitHub test repository, Cloudflare
evaluation Worker identities/storage, narrow Access policy, and an OpenCode Go test credential.

1. Confirm Node/pnpm/Wrangler versions, root/submodule SHAs, clean tree, target Cloudflare account,
   evaluation route, Worker ownership, and that `pnpm check` passes.
2. Create required labels in the test repository and configure only that repository/preview host.
3. Install the three secrets interactively and verify secret names, never values.
4. Deploy after the operator approves the mutation inventory in the starter operator guide.
5. Verify Access denies an unauthenticated and denied identity, permits the intended operator, and
   restricts `/admin` to administrators.
6. Run a dry-run backend request, duplicate, open-PR, implemented, needs-input/resume, UI evidence,
   unsafe URL, prompt-injection, redaction, and Monitor scenario. Confirm GitHub receives no writes.
7. Disable dry-run. Create one validated Issue; confirm body/SHA/fingerprint/validation label and that
   no queue label was added. Replay the intake and simulate a client timeout; confirm one Issue.
8. Apply each status label in turn and create/link a draft PR with passing/failing checks; verify
   Monitor counts, detail, pending question, PR/check state, and evidence.
9. Review sanitized audit events and Cloudflare logs for secret/prompt/body leakage.
10. Record deployment IDs and restore dry-run or roll back Worker versions if any invariant fails.

Live deployment remains unverified until this runbook is completed and its evidence is attached to
the release record.

