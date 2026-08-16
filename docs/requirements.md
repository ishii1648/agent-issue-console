# Requirements

## Functional requirements

1. Intake persists the conversation, normalized request, state, evidence, questions, answers,
   repository policy, result, and audit events across reloads.
2. The state machine distinguishes `understanding`, `investigating`, `needs_input`, `validating`,
   `creating_issue`, `completed`, `resolved_without_issue`, and `failed`.
3. Investigation records repository metadata, default-branch SHA, relevant files/code, Issues, PRs,
   commits, and optional visual evidence.
4. Validation returns `create_issue`, `duplicate`, `already_implemented`, `in_progress`,
   `not_substantiated`, `out_of_scope`, `blocked`, or `needs_input`.
5. Creation is allowed only for an allowlisted repository after a final Issue/PR duplicate check,
   with an observable expectation, completion criteria, safe evidence, and no unresolved decision.
6. A stable SHA-256 fingerprint is computed from repository, normalized request, and stable related
   identifiers. The fingerprint is embedded in the Issue body and searched before every creation or
   timeout retry.
7. Created Issues receive the policy validation label. Queue labels are added only when
   `autoQueueAfterCreate` is true.
8. Monitor classifies configured ready/running/needs-input/failed/done labels and shows related PRs,
   draft/check state, recent comments, pending question, and Agent Issue Console evidence.
9. UI evidence records URL, environment, viewport, title, main text/accessibility data, screenshot
   reference, and timestamp. URL and every redirect target must pass policy.
10. The LLM boundary is provider-neutral; the first adapter is an OpenAI-compatible OpenCode Go
    chat-completions endpoint with configurable model, base URL, timeout, retries, and size limits.
11. Dry-run performs reads and produces the exact proposed outcome but makes no GitHub writes.
12. The implementation exposes typed repository, Issue/PR, commit, write, browser, LLM, and state
    ports with deterministic fakes.

## Question policy

Ask only for a material external-behavior choice; an unknown repository; unavailable UI observation
that code/tests cannot establish; authentication, authorization, publication, billing, or deletion;
conflicting acceptance criteria; an unsafe-to-infer fact; or a repository outside the allowlist.
Ask at most one focused question per turn and resume from saved evidence after the answer.

## No-Issue policy

Do not create when an equivalent Issue exists, a PR is in progress, the default branch already
satisfies the request, the claim is unsubstantiated, the work is out of scope, access is insufficient,
evidence would leak a secret, or user input is pending. Return a typed disposition and evidence.

## Non-functional requirements

- Least privilege, fail closed, per-user authorization, auditability, prompt-injection isolation,
  redaction, bounded context/output, timeouts, exponential backoff with jitter, and rate-limit care.
- No partial Issue on error; reconcile ambiguous GitHub writes before retrying.
- Responsive, keyboard-usable UI with expandable evidence and explicit loading/error states.
- Fake-backed tests must run without credentials or network access.
- The pinned upstream commit and wrapper changes remain independently upgradable.

## Non-goals

Mac mini control, Codex CLI control, code/branch/commit/PR mutation, merge, arbitrary comments,
arbitrary repositories or URLs, non-GitHub trackers, multi-tenant administration, vector search,
provider-complete abstraction, or autonomous approval of dangerous actions.

