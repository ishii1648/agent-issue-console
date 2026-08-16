import type { VisualEvidence } from "./domain.js";
import type { BrowserPort } from "./ports.js";
import { redactSecrets } from "./security.js";

export interface BrowserRenderingConfig {
  accountId: string;
  apiToken: string;
  timeoutMs: number;
}

export class BrowserRenderingRestClient implements BrowserPort {
  constructor(private readonly config: BrowserRenderingConfig, private readonly fetcher: typeof fetch = fetch) {}

  async capture(url: string, options: { environment: string; width: number; height: number }): Promise<VisualEvidence> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetcher(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.config.accountId)}/browser-rendering/snapshot`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.config.apiToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          url,
          formats: ["screenshot", "markdown", "accessibilityTree"],
          viewport: { width: options.width, height: options.height, isMobile: options.width < 600, hasTouch: options.width < 600 },
          screenshotOptions: { type: "webp", encoding: "base64", fullPage: true },
          gotoOptions: { waitUntil: "networkidle2", timeout: this.config.timeoutMs },
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Browser Rendering failed with HTTP ${response.status}.`);
      const payload = await response.json() as { result?: { screenshot?: string; markdown?: string; accessibilityTree?: unknown; content?: string; title?: string; url?: string } };
      const result = payload.result ?? payload as unknown as NonNullable<typeof payload.result>;
      const markdown = redactSecrets(result.markdown ?? result.content ?? "").slice(0, 40_000);
      return {
        requestedUrl: url,
        finalUrl: result.url ?? url,
        environment: options.environment,
        title: redactSecrets(result.title ?? extractTitle(result.content ?? "")),
        mainText: markdown,
        accessibility: redactSecrets(JSON.stringify(result.accessibilityTree ?? {})).slice(0, 40_000),
        screenshot: result.screenshot ?? "",
        viewport: { width: options.width, height: options.height },
        capturedAt: new Date().toISOString(),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function extractTitle(html: string): string {
  return /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? "Untitled page";
}

