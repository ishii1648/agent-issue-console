import type {
  Evidence,
  IntakeSnapshot,
  RepositoryPolicy,
  ValidationDecision,
} from "./domain.js";
import { parseRepository } from "./domain.js";
import { createFingerprint, fingerprintMarker, normalizeRequest } from "./fingerprint.js";
import { renderIssueBody } from "./issue-body.js";
import type { BrowserPort, Clock, GitHubPort, IdGenerator, IntakeStore, LanguageModel } from "./ports.js";
import { assertRepositoryAllowed, assertSafePreviewUrl, containsPotentialSecret, redactSecrets } from "./security.js";

export interface SubmitIntakeInput {
  ownerId: string;
  repository: string;
  request: string;
  uiRelated?: boolean;
}

export class AgentIssueWorkflow {
  constructor(private readonly dependencies: {
    github: GitHubPort;
    llm: LanguageModel;
    browser: BrowserPort;
    store: IntakeStore;
    policies: RepositoryPolicy[];
    clock?: Clock;
    ids?: IdGenerator;
    maxContextCharacters?: number;
    maxOutputCharacters?: number;
  }) {}

  async submit(input: SubmitIntakeInput): Promise<IntakeSnapshot> {
    const repository = parseRepository(input.repository);
    const policy = assertRepositoryAllowed(repository, this.dependencies.policies);
    if (!input.request.trim()) throw new Error("Request must not be empty.");
    const now = this.now();
    const intake: IntakeSnapshot = {
      id: this.dependencies.ids?.next() ?? crypto.randomUUID(),
      ownerId: input.ownerId,
      repository,
      request: redactSecrets(input.request.trim()),
      normalizedRequest: normalizeRequest(input.request),
      state: "understanding",
      createdAt: now,
      updatedAt: now,
      evidence: [],
    };
    await this.save(intake);
    return this.investigate(intake, policy, Boolean(input.uiRelated));
  }

  async answer(id: string, ownerId: string, answer: string, uiRelated = false): Promise<IntakeSnapshot> {
    const intake = await this.dependencies.store.get(id);
    if (!intake || intake.ownerId !== ownerId) throw new Error("Intake was not found.");
    if (intake.state !== "needs_input") throw new Error("Intake is not waiting for input.");
    intake.answer = redactSecrets(answer.trim());
    intake.question = undefined;
    intake.state = "investigating";
    await this.save(intake);
    const policy = assertRepositoryAllowed(intake.repository, this.dependencies.policies);
    return this.investigate(intake, policy, uiRelated, true);
  }

  private async investigate(
    intake: IntakeSnapshot,
    policy: RepositoryPolicy,
    uiRelated: boolean,
    resume = false,
  ): Promise<IntakeSnapshot> {
    try {
      intake.state = "investigating";
      await this.save(intake);
      const metadata = await this.dependencies.github.getRepository(intake.repository);
      intake.defaultBranchSha = metadata.defaultBranchSha;
      this.addEvidence(intake, "repository", `https://github.com/${intake.repository.fullName}/tree/${metadata.defaultBranchSha}`, `Default branch ${metadata.defaultBranch} at ${metadata.defaultBranchSha}.`);

      const [code, issues, pullRequests, commits] = await Promise.all([
        this.dependencies.github.searchCode(intake.repository, { query: intake.normalizedRequest, limit: 10 }),
        this.dependencies.github.searchIssues(intake.repository, { query: intake.normalizedRequest, limit: 20 }),
        this.dependencies.github.searchPullRequests(intake.repository, { query: intake.normalizedRequest, limit: 20 }),
        this.dependencies.github.searchCommits(intake.repository, { query: intake.normalizedRequest, limit: 20 }),
      ]);
      if (!resume) {
        for (const match of code) this.addEvidence(intake, "code", match.url, `Relevant code in ${match.path}.`, match.excerpt);
        for (const issue of issues) this.addEvidence(intake, "issue", issue.url, `${issue.state} Issue #${issue.number}: ${issue.title}`, issue.body);
        for (const pr of pullRequests) this.addEvidence(intake, "pull_request", pr.url, `${pr.state} PR #${pr.number}: ${pr.title}`, pr.body);
        for (const commit of commits) this.addEvidence(intake, "commit", commit.url, `${commit.sha.slice(0, 12)} ${commit.message}`);
      }

      if (uiRelated) {
        if (policy.previewUrl) {
          const preview = assertSafePreviewUrl(policy.previewUrl, policy.previewHostnameAllowlist);
          const visual = await this.dependencies.browser.capture(preview.href, { environment: "preview", width: 390, height: 844 });
          assertSafePreviewUrl(visual.finalUrl, policy.previewHostnameAllowlist);
          this.addEvidence(intake, "ui", visual.finalUrl, `${visual.title}; viewport ${visual.viewport.width}×${visual.viewport.height}; ${visual.mainText}`, visual.accessibility);
        } else if (policy.requireVisualEvidenceForUi && code.length === 0) {
          return this.needInput(intake, "現在のUIを確認できるallowlist済みpreview URLまたはスクリーンショットを提示してください。");
        }
      }

      const equivalentIssue = issues.find((item) => item.title.toLowerCase() === intake.normalizedRequest || item.body.toLowerCase().includes(intake.normalizedRequest));
      if (equivalentIssue) return this.resolve(intake, "duplicate", `同じ問題を扱うIssue #${equivalentIssue.number}が存在します。`);
      const openPr = pullRequests.find((item) => item.state === "open");
      if (openPr) return this.resolve(intake, "in_progress", `Pull Request #${openPr.number}で対応中です。`);
      const mergedPr = pullRequests.find((item) => item.state === "merged");
      if (mergedPr) return this.resolve(intake, "already_implemented", `Pull Request #${mergedPr.number}がmerge済みです。`);

      intake.state = "validating";
      await this.save(intake);
      const decision = await this.dependencies.llm.decide({
        request: intake.request,
        repository: intake.repository.fullName,
        defaultBranchSha: metadata.defaultBranchSha,
        evidence: intake.evidence.map(({ kind, source, summary, excerpt }) => ({ kind, source, summary, excerpt })),
        previousQuestion: intake.decision?.question,
        answer: intake.answer,
        limits: {
          maxContextCharacters: this.dependencies.maxContextCharacters ?? 60_000,
          maxOutputCharacters: this.dependencies.maxOutputCharacters ?? 8_000,
        },
      });
      intake.decision = sanitizeDecision(decision);
      if (decision.disposition === "needs_input") {
        if (intake.answer) return this.resolve(intake, "blocked", "回答後も重大な判断を確定できませんでした。");
        return this.needInput(intake, decision.question ?? "期待する外部動作を一つ選んでください。");
      }
      if (decision.disposition !== "create_issue") return this.resolve(intake, decision.disposition, decision.summary);
      if (!metadata.permissions.issuesWrite && !policy.dryRun) return this.resolve(intake, "blocked", "GitHub Issuesへの書き込み権限がありません。");
      if (!decision.issueTitle || !decision.expectedBehavior || !decision.completionCriteria?.length) {
        return this.resolve(intake, "not_substantiated", "外部から検証可能な期待動作または完了条件が不足しています。");
      }

      const fingerprint = await createFingerprint(intake.repository.fullName, intake.request, decision.relatedIdentifiers);
      intake.fingerprint = fingerprint;
      const existing = await this.findFingerprint(intake, fingerprint);
      if (existing) {
        intake.issue = { number: existing.number, url: existing.url, title: existing.title };
        return this.resolve(intake, "duplicate", `同じfingerprintのIssue #${existing.number}が存在します。`);
      }

      // Final duplicate checks are intentionally fresh and immediately precede the write.
      const [finalIssues, finalPrs] = await Promise.all([
        this.dependencies.github.searchIssues(intake.repository, { query: intake.normalizedRequest, limit: 50 }),
        this.dependencies.github.searchPullRequests(intake.repository, { query: intake.normalizedRequest, limit: 50 }),
      ]);
      if (finalIssues.length) return this.resolve(intake, "duplicate", `最終確認で関連Issue #${finalIssues[0].number}を検出しました。`);
      if (finalPrs.some((item) => item.state === "open")) return this.resolve(intake, "in_progress", `最終確認で対応中のPull Request #${finalPrs[0].number}を検出しました。`);

      const body = renderIssueBody({ repository: intake.repository, request: intake.request, defaultBranchSha: metadata.defaultBranchSha, decision, evidence: intake.evidence, fingerprint });
      if (containsPotentialSecret(body)) return this.resolve(intake, "blocked", "Issue本文に安全に記録できない機密情報が含まれます。");
      if (policy.dryRun) {
        intake.decision.summary = `dry-run: ${decision.summary}`;
        intake.state = "completed";
        await this.save(intake);
        return intake;
      }

      intake.state = "creating_issue";
      await this.save(intake);
      const labels = [policy.validationLabel, ...(policy.autoQueueAfterCreate ? [policy.queueLabel] : [])];
      try {
        const created = await this.dependencies.github.createIssue(intake.repository, { title: decision.issueTitle, body, labels });
        intake.issue = { number: created.number, url: created.url, title: created.title };
      } catch (error) {
        const reconciled = await this.findFingerprint(intake, fingerprint);
        if (!reconciled) throw error;
        intake.issue = { number: reconciled.number, url: reconciled.url, title: reconciled.title };
      }
      intake.state = "completed";
      await this.save(intake);
      return intake;
    } catch (error) {
      intake.state = "failed";
      intake.error = redactSecrets(error instanceof Error ? error.message : String(error));
      await this.save(intake);
      return intake;
    }
  }

  private async findFingerprint(intake: IntakeSnapshot, fingerprint: string) {
    const matches = await this.dependencies.github.searchIssues(intake.repository, { query: fingerprintMarker(fingerprint), limit: 10 });
    return matches.find((issue) => issue.body.includes(fingerprintMarker(fingerprint)));
  }

  private async needInput(intake: IntakeSnapshot, question: string): Promise<IntakeSnapshot> {
    intake.state = "needs_input";
    intake.question = redactSecrets(question);
    intake.decision = { disposition: "needs_input", summary: "人間の判断または観測情報が必要です。", question: intake.question };
    await this.save(intake);
    return intake;
  }

  private async resolve(intake: IntakeSnapshot, disposition: ValidationDecision["disposition"], summary: string): Promise<IntakeSnapshot> {
    intake.state = disposition === "create_issue" ? "completed" : "resolved_without_issue";
    intake.decision = { ...(intake.decision ?? { disposition, summary }), disposition, summary: redactSecrets(summary) };
    await this.save(intake);
    return intake;
  }

  private addEvidence(intake: IntakeSnapshot, kind: Evidence["kind"], source: string, summary: string, excerpt?: string): void {
    if (intake.evidence.some((item) => item.kind === kind && item.source === source)) return;
    intake.evidence.push({
      id: `${kind}:${intake.evidence.length + 1}`,
      kind,
      source,
      summary: redactSecrets(summary).slice(0, 2_000),
      excerpt: excerpt ? redactSecrets(excerpt).slice(0, 4_000) : undefined,
      capturedAt: this.now(),
    });
  }

  private now(): string { return (this.dependencies.clock?.now() ?? new Date()).toISOString(); }
  private async save(intake: IntakeSnapshot): Promise<void> {
    intake.updatedAt = this.now();
    await this.dependencies.store.put(intake);
  }
}

function sanitizeDecision(decision: ValidationDecision): ValidationDecision {
  return JSON.parse(redactSecrets(JSON.stringify(decision))) as ValidationDecision;
}

