# Setup and local operation

## Prerequisites

Use Node.js 24 and pnpm 11 as declared by the starter. Initialize with:

```sh
git submodule update --init --recursive
pnpm install
pnpm --dir cloudflare-os install
```

The committed `deployment.jsonc` is safe-by-default: one allowlisted repository, dry-run enabled,
auto-queue disabled, and no preview host. Replace infrastructure placeholders only for an approved
evaluation or production deployment.

## Local checks

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm check
```

`pnpm check` uses `deployment.dry-run.jsonc`, generates temporary Wrangler configs, builds the four
Workers/frontend, performs Wrangler deploy dry-runs, and removes the generated configs. It does not
deploy. `pnpm check:deployment` validates the operator-owned `deployment.jsonc` after its placeholders
have been replaced and before any approved deployment.

## Secrets

After confirming the exact Cloudflare account and custom Gatekeeper Worker identity, enter secrets
interactively; never place values on the command line or in this repository:

```sh
pnpm exec wrangler secret put GITHUB_TOKEN --name <custom-gatekeeper-worker>
pnpm exec wrangler secret put OPENCODE_GO_API_KEY --name <custom-gatekeeper-worker>
pnpm exec wrangler secret put CLOUDFLARE_BROWSER_TOKEN --name <custom-gatekeeper-worker>
```

Prefer a GitHub App installation token restricted to allowlisted repositories. Minimum repository
permissions are Metadata read, Contents read, Issues read/write, and Pull requests read. Commit and
checks reads may require Contents/Checks read. Do not grant Contents write, Administration, Workflows,
Deployments, or Pull request write.

OpenCode Go uses the configured OpenAI-compatible base URL and model. Fetch current model IDs from
the provider's `/v1/models` endpoint before deployment. The Browser token is needed only when a
policy has a preview URL and UI evidence is enabled; its Cloudflare scope is Browser Rendering Write
for the chosen account.

## Cloudflare OS runtime setup

Deploy only after Access, Worker identities, storage ownership, and route are explicitly approved.
In `/admin`, enable the Agent Issue Console Gatekeeper for intended operators, keep arbitrary
connectors disabled, and install the product agent instructions. The Gatekeeper advertises a
full-page management app titled Agent Issue Console; its chat-oriented Create panel is the write
surface. The agent-facing session is read-only so side effects cannot bypass the Gatekeeper action
boundary.

Set `dryRun` to `false` only after a successful test-repository E2E and label creation. Keep
`autoQueueAfterCreate` false for the MVP.
