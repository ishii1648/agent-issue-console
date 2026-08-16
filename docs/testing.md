# Testing strategy

## Layers

- Unit: normalization/fingerprint, state transitions, question policy, allowlists, URL/SSRF checks,
  redaction, Issue rendering, monitor classification, and retry decisions.
- Contract: fake and HTTP adapters run against the same typed port expectations, including pagination,
  errors, rate limits, and write reconciliation.
- Integration: a fake GitHub/LLM/browser vertical slice persists intake state, asks at most once,
  creates or suppresses an Issue, and refreshes Monitor.
- UI: responsive layout, form/keyboard behavior, evidence disclosure, state/result rendering, and
  accessible labels at desktop and mobile viewports.
- Deployment: root `pnpm check` builds the wrapper and performs Wrangler dry-runs without credentials.

## Required scenario matrix

Automated domain/integration tests cover: valid backend request; no needless question; material
decision; resume after answer; duplicate Issue; open PR; merged/implemented; replay idempotency;
create-timeout reconciliation; UI evidence success; missing UI evidence question; repository/URL
allowlists; localhost/private/link-local/metadata rejection; prompt injection treated as data; secret
redaction; missing write authority; dry-run; all five monitor states; PR/check display; and created
Issue evidence.

Real-service behavior is captured in `docs/runbooks/real-environment-e2e.md` because credentials,
billing, Access policy, and deployment identity are human-controlled. Never run that playbook against
a production repository first; use a dedicated allowlisted test repository and preview environment.

## Quality gates

Run `pnpm test`, `pnpm --dir packages/custom-gatekeeper run types:check`, `pnpm check`, and verify no
generated `wrangler.prod.jsonc`, secrets, or submodule modifications remain. Local UI QA captures
desktop/mobile screenshots and checks browser console errors.

