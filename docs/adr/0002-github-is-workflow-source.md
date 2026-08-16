# ADR 0002: GitHub is the workflow source of truth

- Status: accepted
- Date: 2026-08-16

Issue labels, PR associations, and checks define Monitor state. Durable Object state stores intake and
evidence but never overrides GitHub workflow status. Mac mini and `codex-issue-loop` APIs are outside
the MVP. Creation and queue enrollment are separate, with auto-queue disabled by default.

