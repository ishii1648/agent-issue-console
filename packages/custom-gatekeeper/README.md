# Agent Issue Console Gatekeeper

This wrapper-owned Cloudflare OS Gatekeeper hosts the Agent Issue Console capability and management UI. The domain implementation enforces repository and URL policy, builds idempotent validated Issues, and derives monitor state from GitHub.

## Configuration

Non-secret repository policies belong in deployment configuration. Credentials are Wrangler secrets:

- `GITHUB_TOKEN`: preferably a repository-scoped GitHub App installation token.
- `OPENCODE_GO_API_KEY`: OpenCode Go API key.
- `CLOUDFLARE_BROWSER_TOKEN`: only for the Browser Rendering REST adapter.

Never place their values in Git, configuration, logs, Issue bodies, or screenshots.

## Observer policy

The MVP management app is private to the connected account. Repository evidence must not be shared until an observer verifier can prove the collaborator's access to the same repository; production sharing therefore fails closed.

A real integration must decide which observers may retain data and implement verification at that data boundary. Use upstream's [`write-gatekeeper` skill](https://github.com/cloudflare/cloudflare-os/blob/main/.agents/skills/write-gatekeeper/SKILL.md) for observer design, OAuth, URL-scoped resources, writes and simulation, hooks, and configurator UI.

## Check

```sh
pnpm test
pnpm run types:check
pnpm exec wrangler deploy --dry-run
```
