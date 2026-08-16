# ADR 0003: LLMとBrowser Renderingを小さなportに分離する

- 状態: accepted
- 日付: 2026-08-16

## 決定

小さな `LanguageModel` interface を設け、最初に OpenCode Go の OpenAI-compatible
`/v1/chat/completions` adapter を実装します。credential は Rust core Worker の Wrangler secret に置きます。
Browser は Cloudflare Browser Rendering snapshot API で screenshot、Markdown/accessibility、page content を
一回の限定 request で取得します。domain は request URL を検証し、`allowRequestPattern` で同じ hostname の request
だけを許可します。Cloudflare AI
Gateway Custom Provider は将来追加でき、domain は変更しません。

## 制約

snapshot REST API は effective URL を返しません。成功時の証拠には request URL を記録し、off-host redirect は
`allowRequestPattern` で遮断します。この制御は実 credential を使う専用 preview 環境でE2E確認してから、本番の
visual evidence 必須 policy を有効化します。
