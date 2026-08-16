# Verification record — 2026-08-16

## Passed

- Node.js 24.19.0 temporary toolchain with pnpm 11.9.0.
- Root deployment configuration tests: 10/10.
- Agent Issue Console Create/security/Monitor tests: 13/13.
- Error Reporter regression tests: 2/2.
- Custom Gatekeeper and Error Reporter TypeScript type checks.
- Custom Gatekeeper and Error Reporter TypeScript builds.
- `git diff --check` and pinned submodule provenance.
- Local UI in the in-app browser at desktop and 390×844 mobile viewport: no horizontal overflow,
  all five summary metrics present, Create/Monitor responsive order correct, accessible labels found,
  send transitioned `understanding → investigating`, refresh responded, and no console warnings/errors.

## Partially verified

`pnpm check` passed every automated test and the Context app TypeScript checks, then stalled in the
pinned upstream Vite/esbuild service during `@gadgets/gatekeeper-context` single-file bundling. The
same environment-specific esbuild service IPC stall also affected the original Vitest worker pool;
direct TypeScript builds and Node tests completed normally. The run was interrupted after confirming
zero CPU progress, and all four generated `wrangler.prod.jsonc` files were removed. Therefore the
final upstream frontend/backend builds and Wrangler deploy dry-runs remain unverified on this host.

## External verification not run

No Cloudflare account, Access application, Worker identities, storage, route, GitHub runtime token,
OpenCode Go key, or Browser Rendering token was configured. No production deployment or live GitHub
Issue was created. Complete `docs/runbooks/real-environment-e2e.md` after the operator supplies and
approves those trust-boundary decisions.

