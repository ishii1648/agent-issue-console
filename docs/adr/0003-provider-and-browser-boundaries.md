# ADR 0003: OpenAI-compatible LLM and Browser Rendering snapshot ports

- Status: accepted
- Date: 2026-08-16

Use a small `LanguageModel` interface and first implement OpenCode Go's documented OpenAI-compatible
`/v1/chat/completions` path. Keep credentials in Wrangler secrets. Use Cloudflare Browser Rendering's
snapshot capability to collect screenshot, Markdown/accessibility information, and page content in
one bounded call. Domain code validates hosts and redirects before browser execution. Cloudflare AI
Gateway Custom Providers may later proxy OpenCode Go without changing domain logic.

