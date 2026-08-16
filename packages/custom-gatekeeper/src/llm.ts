import type { ValidationDecision } from "./domain.js";
import type { LanguageModel, LanguageModelInput } from "./ports.js";
import { DISPOSITIONS } from "./domain.js";
import { UNTRUSTED_EVIDENCE_PREAMBLE, redactSecrets } from "./security.js";

export interface OpenAiCompatibleConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  retries: number;
  maxOutputTokens: number;
}

export class OpenAiCompatibleLanguageModel implements LanguageModel {
  constructor(private readonly config: OpenAiCompatibleConfig, private readonly fetcher: typeof fetch = fetch) {}

  async decide(input: LanguageModelInput): Promise<ValidationDecision> {
    const context = JSON.stringify({
      request: input.request,
      repository: input.repository,
      defaultBranchSha: input.defaultBranchSha,
      previousQuestion: input.previousQuestion,
      answer: input.answer,
      evidence: input.evidence,
    }).slice(0, input.limits.maxContextCharacters);
    const system = `${UNTRUSTED_EVIDENCE_PREAMBLE}\nReturn one JSON object only. disposition must be one of: ${DISPOSITIONS.join(", ")}. Ask only for a material product decision or unavailable required UI observation. For create_issue include issueTitle, problem, currentBehavior, expectedBehavior, completionCriteria, nonGoals, and relatedIdentifiers.`;
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
      try {
        const response = await this.fetcher(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: { authorization: `Bearer ${this.config.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model: this.config.model, messages: [{ role: "system", content: system }, { role: "user", content: context }], max_tokens: this.config.maxOutputTokens, temperature: 0 }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable && attempt < this.config.retries) continue;
          throw new Error(`LLM request failed with HTTP ${response.status}.`);
        }
        const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        const raw = payload.choices?.[0]?.message?.content?.trim();
        if (!raw) throw new Error("LLM returned no decision.");
        const decision = JSON.parse(raw.slice(0, input.limits.maxOutputCharacters)) as ValidationDecision;
        if (!DISPOSITIONS.includes(decision.disposition)) throw new Error("LLM returned an invalid disposition.");
        return JSON.parse(redactSecrets(JSON.stringify(decision))) as ValidationDecision;
      } catch (error) {
        lastError = error;
        if (attempt >= this.config.retries) break;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new Error(redactSecrets(lastError instanceof Error ? lastError.message : "LLM request failed."));
  }
}

