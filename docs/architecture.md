# Architecture

## Decision

Agent Issue Console uses the pinned Cloudflare OS Workshop as its authenticated chat and Gadget host.
A wrapper-owned Agent Issue Console Gatekeeper exposes a narrow capability to the agent and Monitor
Gadget. The Gatekeeper owns repository policy enforcement, GitHub/Browser/LLM adapters, intake state,
and audits. GitHub remains the workflow source of truth.

```text
Cloudflare Access → Workshop chat / Monitor Gadget
                         │ Cap'n Web, named capability
                         ▼
              Agent Issue Console Gatekeeper
               ├─ Intake Durable Object (SQLite)
               ├─ GitHub REST adapter
               ├─ Browser Rendering adapter
               └─ OpenAI-compatible LLM adapter
                         │
                         ▼
                 allowlisted GitHub repositories
```

The root wrapper generates the service binding and deploy order. `cloudflare-os` stays at its pinned
gitlink. This follows starter update mechanics and avoids an upstream fork.

## Components

- Domain: state machine, policies, evidence, dispositions, fingerprint, Issue renderer, redaction,
  URL guard, monitor classifier, and orchestration.
- Ports: `GitHubRepositoryReader`, `GitHubIssueReader`, `GitHubPullRequestReader`,
  `GitHubCommitReader`, `GitHubIssueWriter`, `VisualEvidenceCollector`, `LanguageModel`, and
  `IntakeStore`.
- Adapters: GitHub REST with least-privilege credential, Browser Rendering snapshot, OpenCode Go
  OpenAI-compatible chat completions, Durable Object storage, and deterministic fakes.
- Surfaces: Cloudflare OS agent capability for Create and a responsive Monitor/chat HTTP shell used
  for local verification and as the Gadget design reference.

## Data model

`Intake` stores owner/user ID, repository, normalized request, state, timestamps, question/answer,
investigation cursor, evidence records, validation, fingerprint, result, and audit IDs. Evidence is
typed (`repository`, `code`, `issue`, `pull_request`, `commit`, `ui`) and stores excerpts plus source
references, never raw credentials. Audit events contain actor, action, outcome, resource, timestamp,
and redacted metadata.

One Durable Object is addressed per authenticated user, providing serialized state changes and
SQLite-backed persistence. GitHub is re-read for mutable workflow state; the DO stores conversations,
evidence, idempotency records, and UI preferences.

## LLM boundary

The LLM receives bounded, labelled untrusted evidence and a fixed policy prompt. It returns a strict
JSON investigation decision. Domain code—not the model—validates repositories/URLs, decides allowed
operations, computes fingerprints, renders the Issue, and invokes writes. OpenCode Go is configured
with a base URL ending in `/v1`, model ID, secret API key, timeout, retries, max steps/context/output.
Cloudflare AI Gateway Custom Providers is an optional later routing layer, not required by the MVP.

## Upstream updates

Fetch `upstream`, review starter and submodule gitlink diffs, run wrapper and upstream checks, then
merge without force-push. Product code stays outside the submodule. Any unavoidable upstream patch
requires a separate ADR, compatibility tests, and a path back to a released starter extension point.

