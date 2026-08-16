# Security model

## Trust boundaries

Authenticated user input is authorized but untrusted. GitHub source, docs, Issues, PRs, reviews,
comments, commit messages, and rendered pages are hostile data. LLM output is an untrusted proposal.
Only validated domain commands cross into adapters.

## Controls

- Exact repository allowlist is checked before every read and write. A default repository never
  implies authorization.
- GitHub credential scope is limited to Metadata/Contents/Issues/Pull requests read and Issues write.
  Contents, administration, workflows, deployments, and code write are not granted.
- The write port has only Issue creation and additive allowlisted labels. No generic HTTP method or
  arbitrary endpoint is exposed to the model.
- Per-user Durable Objects and Cloudflare Access identity isolate conversations and state. A
  Gatekeeper observer must independently have access to the bound repository (strategy B); MVP
  sharing fails closed until that verifier is connected.
- System prompts label external text as evidence and forbid obeying embedded instructions. The
  policy and tool schema are assembled separately from evidence.
- Redaction detects common tokens, private keys, authorization headers, URL credentials, and high
  entropy credential assignments. Redaction runs before logs, persistence, LLM context, Issue bodies,
  screenshots metadata, and audit attributes.
- Preview access is HTTPS-only and hostname-allowlisted. URL credentials, localhost, `.local`, IP
  literals in private/loopback/link-local/reserved ranges, and cloud metadata names are rejected;
  each redirect is revalidated. Browser requests block unnecessary resource types where possible.
- Timeouts, bounded retries, `Retry-After`, input/context/output limits, and per-user rate limits
  constrain resource use. GitHub create timeouts reconcile by fingerprint before retry.
- Dry-run suppresses every write. An Issue body is constructed and validated completely before the
  single create call; labels are included atomically when possible.
- Production and test use separate Worker names, storage namespaces, credentials, allowlists, and
  preview hosts. Fakes are the default for automated tests.

## Secret management

Use `wrangler secret put GITHUB_TOKEN`, `wrangler secret put OPENCODE_GO_API_KEY`, and, only when the
Browser Rendering REST adapter is selected, `wrangler secret put CLOUDFLARE_BROWSER_TOKEN`. Never
store values in `deployment.jsonc`, `.dev.vars`, source, conversation state, screenshots, Issues, or
logs. Local developers may use an ignored `.dev.vars` only with non-production credentials.

## Audit

Record intake transitions, policy decisions, external operation type, resource reference, outcome,
retry/reconciliation, and actor ID. Do not record request/response bodies, authorization headers,
prompts, screenshots, or raw source. Audit retention and export are deployment decisions.

## Residual risks

GitHub PATs are broader than per-installation GitHub App tokens; production should prefer a GitHub App.
Browser screenshots may capture sensitive application data even after text redaction, so visual
evidence retention and access require an explicit deployment policy. Cloudflare OS is early access;
each submodule upgrade needs a trust-boundary review.

