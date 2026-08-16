# Agent Issue Console — Product brief

Agent Issue Console turns a rough engineering request into either a validated GitHub Issue or a
well-evidenced decision not to create one. It also presents the GitHub-backed state of work handled
later by `codex-issue-loop`.

## Users and jobs

The initial user is one authenticated operator working with an allowlisted set of repositories.
They need to submit an idea conversationally, avoid duplicate or premature Issues, and see whether
the downstream coding loop is waiting, running, blocked on an answer, failed, or done.

## Product responsibilities

Create owns intake, investigation, optional single-question clarification, validation, idempotent
Issue creation, evidence, and the `agent-issue:validated` label. Monitor owns read-only summaries and
details derived from GitHub Issues, labels, Pull Requests, comments, and checks.

The product does not implement code, execute shell commands, control a Mac mini, or operate the
coding loop. Creating an Issue and placing it on the coding queue are separate decisions.

## Experience

The default surface is a compact chat. The repository, current processing state, outcome, and Issue
link remain visible; evidence is expandable. When evidence and expected behavior are sufficient, the
system creates the Issue without a preview dialog. It asks one concise question only when a human
decision or missing observation materially changes the externally visible requirement.

Success means a validated Issue is safe, non-duplicative, externally testable, reproducible from a
recorded default-branch SHA, and visible immediately in Monitor—or a specific no-Issue disposition
is returned with evidence.

