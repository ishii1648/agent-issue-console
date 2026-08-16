# ADR 0004: Import starter snapshots without inherited root history

- Status: accepted
- Date: 2026-08-16

## Context

The product uses `cloudflare/cloudflare-os-starter`, but the Agent Issue Console repository should
show only locally authored root commits. Merging or branching directly from `upstream/main` preserves
the upstream authors in this repository's reachable history and contributor display.

## Decision

Initialize the root with an owner-authored, parentless commit whose tree exactly matches
`cloudflare/cloudflare-os-starter@93f14dfd68ed1c218d2a7c2168753a6d9b22e145`. Record that SHA and the
`cloudflare-os` gitlink SHA in commit trailers. Keep the `upstream` remote for discovery, but never
merge its history. Future upgrades review the complete snapshot diff and apply the accepted delta as
locally authored commits with old/new upstream provenance.

## Consequences

GitHub displays only Agent Issue Console authors in reachable root history. Ordinary upstream merges
and ancestry-based rebases are unavailable; update tooling and reviewers must compare explicit SHAs.
The pinned submodule retains its own upstream history, which is expected and separate from the root
repository's commit graph.
