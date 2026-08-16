# ADR 0001: Keep product logic in a wrapper-owned Gatekeeper

- Status: accepted
- Date: 2026-08-16

## Context

Agent Issue Console needs GitHub reads and narrowly constrained writes, persistent conversation state,
an LLM, browser evidence, and a Monitor Gadget. The starter intentionally exposes custom Gatekeepers,
service bindings, runtime agent instructions, and Blueprints while pinning Cloudflare OS upstream.

## Decision

Implement policy and integrations in the wrapper-owned custom Gatekeeper. Use the standard Workshop
chat capability and the Gatekeeper App UI for intake and Monitor. Do not modify the submodule.

## Consequences

Upstream updates remain a gitlink change, and capability enforcement cannot be bypassed by prompts.
The deployment must configure the product Gatekeeper and install/feature the Monitor blueprint. A
fully bespoke top-level navigation item would require upstream frontend work and is deferred.
