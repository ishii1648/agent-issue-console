# Implementation plan

1. Bootstrap from the pinned starter, record remotes/submodule provenance, and establish the branch.
2. Freeze product requirements, state machine, capability API, security policy, and ADRs.
3. Implement pure domain policy, fingerprints, Issue body/redaction, monitor classification, and fakes.
4. Implement typed GitHub REST reads/writes and timeout reconciliation behind the allowlist.
5. Implement the persistent Create vertical slice and compact chat/result/evidence surface.
6. Add Monitor summary/list/detail with PR draft/check/comment context and refresh.
7. Add Browser Rendering snapshot port plus strict URL guard and fake UI evidence tests.
8. Add provider-neutral LLM port and OpenCode Go OpenAI-compatible adapter with secret-only auth.
9. Run unit/integration/UI/build/typecheck/dry-run checks; document real-environment setup/E2E.
10. Commit logical units, push the feature branch, and open a draft PR.

Production deployment, Access/DNS changes, credential installation, GitHub App creation, provider
billing, and enabling visual evidence are explicitly deferred to an operator-approved deployment.

