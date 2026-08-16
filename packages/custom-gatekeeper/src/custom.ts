import {
  DurableObject,
  RpcStub,
  RpcTarget,
  WorkerEntrypoint,
} from "cloudflare:workers";
import { skipRpcValidation, validateRpc } from "capnweb-validate";
import type {
  AccountDescription,
  ApprovalQueue,
  Gatekeeper,
  GatekeeperConnectCallback,
  GatekeeperConnectOptions,
  GatekeeperUser,
  GatekeeperUserVerifier,
  ResourceConfiguratorFrame,
  ResourceDescription,
  SupportedResource,
  VendorDescription,
  AppUiContext,
  GatekeeperUiFrame,
} from "@gadgets/workshop-shared/gatekeeper";
import type { CustomDeploymentInfo, CustomSession, IntakeResult, MonitorSummary } from "./types.js";
import TYPES_CODE from "./types-code.js";
import { AGENT_ISSUE_CONSOLE_HTML } from "./ui.js";
import type { IntakeSnapshot, MonitorSnapshot, RepositoryPolicy } from "./domain.js";
import { parseRepository } from "./domain.js";
import type { GitHubPort, IntakeStore } from "./ports.js";
import { DurableIntakeStore } from "./durable-store.js";
import { GitHubHttpClient } from "./github.js";
import { OpenAiCompatibleLanguageModel } from "./llm.js";
import { BrowserRenderingRestClient } from "./browser.js";
import { AgentIssueWorkflow } from "./workflow.js";
import { buildMonitorSnapshot } from "./monitor.js";

const CUSTOM_ICON = {
  url:
    "data:image/svg+xml," +
    encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='none' stroke='currentColor' stroke-width='18'><path d='M50 38h156v180H50z'/><path d='M82 84h92M82 126h92M82 168h52'/><circle cx='184' cy='170' r='30'/><path d='m171 170 9 9 18-21'/></svg>",
    ),
};

type ObservationQueue = Pick<ApprovalQueue, "authorizeObservation"> &
  Partial<{ [Symbol.dispose](): void }>;

interface ConsoleRuntime {
  workflow: AgentIssueWorkflow;
  store: IntakeStore;
  github: GitHubPort;
  policies: RepositoryPolicy[];
  defaultRepository: string;
  ownerId: string;
}

type RuntimeEnv = Cloudflare.Env & {
  AIC_DEFAULT_REPOSITORY?: string;
  AIC_REPOSITORY_POLICIES?: string;
  AIC_DRY_RUN?: string;
  AIC_LLM_MODEL?: string;
  AIC_LLM_BASE_URL?: string;
  AIC_LLM_TIMEOUT_MS?: string;
  AIC_LLM_RETRIES?: string;
  AIC_MAX_CONTEXT_CHARACTERS?: string;
  AIC_MAX_OUTPUT_CHARACTERS?: string;
  AIC_MAX_OUTPUT_TOKENS?: string;
  AIC_BROWSER_TIMEOUT_MS?: string;
  GITHUB_TOKEN?: string;
  OPENCODE_GO_API_KEY?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_BROWSER_TOKEN?: string;
};

type AccountProps = { accountId: string };
type ConsoleState = Pick<AgentIssueState, "submitIntake" | "answerIntake" | "getIntake" | "listIntakes" | "getMonitor" | "getMonitorSummary">;

export function describeCustomVendor(): VendorDescription {
  return {
    displayName: "Agent Issue Console",
    url: "https://github.com/ishii1648/agent-issue-console",
    logo: CUSTOM_ICON,
    color: "#e8f2ff",
    tagline: "Validate GitHub Issues and monitor the coding queue",
    description:
      "Investigates allowlisted repositories, creates validated Issues, and reads codex-loop state from GitHub.",
    autoProvisionsAccount: true,
    providesAuth: false,
  };
}

export function describeCustomAccount(): AccountDescription {
  return {
    displayName: "Agent Issue Console",
    avatar: CUSTOM_ICON,
    singleton: { tsType: "CustomSession" },
    providesUi: { title: "Agent Issue Console", icon: CUSTOM_ICON },
  };
}

@validateRpc()
export class CustomSessionImpl extends RpcTarget implements CustomSession {
  readonly #approvalQueue: ObservationQueue;
  readonly #info: CustomDeploymentInfo;
  readonly #state?: ConsoleState;
  readonly #defaultRepository: string;

  constructor(approvalQueue: ObservationQueue, info: CustomDeploymentInfo, state?: ConsoleState, defaultRepository = "") {
    super();
    this.#approvalQueue = approvalQueue;
    this.#info = info;
    this.#state = state;
    this.#defaultRepository = defaultRepository;
  }

  async getIntake(intakeId: string): Promise<IntakeResult | null> {
    const result = await this.requireState().getIntake(intakeId);
    await this.#approvalQueue.authorizeObservation({ title: `Read intake ${intakeId}`, description: "Read one persisted Agent Issue Console intake." });
    return result;
  }

  async listIntakes(): Promise<IntakeResult[]> {
    const results = await this.requireState().listIntakes();
    await this.#approvalQueue.authorizeObservation({ title: "List Agent Issue Console intakes", description: `Read ${results.length} persisted intake summaries.` });
    return results;
  }

  async getMonitorSummary(repository?: string): Promise<MonitorSummary> {
    const target = repository ?? this.#defaultRepository;
    const summary = await this.requireState().getMonitorSummary(target);
    await this.#approvalQueue.authorizeObservation({ title: `Refresh monitor for ${target}`, description: "Read the current Issue and Pull Request queue from GitHub." });
    return summary;
  }

  private requireState(): ConsoleState {
    if (!this.#state) throw new Error("Agent Issue Console runtime is unavailable in this test session.");
    return this.#state;
  }

  async getDeploymentInfo(): Promise<CustomDeploymentInfo> {
    await this.#approvalQueue.authorizeObservation({
      title: "Read Agent Issue Console policy information",
      description: "Read the non-secret deployment identity and product guidance.",
    });
    return this.#info;
  }

  [Symbol.dispose](): void {
    this.#approvalQueue[Symbol.dispose]?.();
  }
}

@validateRpc()
export class CustomGatekeeper extends DurableObject<Cloudflare.Env, AccountProps> implements Gatekeeper<CustomSession> {
  async describe(): Promise<ResourceDescription> {
    return {
      url: "agent-issue-console://intakes",
      title: "Agent Issue Console",
      snippet: "Validated GitHub Issue intake and codex-loop monitor.",
      suggestedBindingName: "AGENT_ISSUE_CONSOLE",
      tsType: "CustomSession",
    };
  }

  async getTypeScriptTypes(): Promise<string> {
    return TYPES_CODE;
  }

  async getAutoApprovableActions(): Promise<[]> {
    return [];
  }

  async startSession(approvalQueue: RpcStub<ApprovalQueue>): Promise<CustomSession> {
    const env = this.env as RuntimeEnv;
    const state = (this.ctx.exports.AgentIssueState as unknown as {
      getByName(name: string): DurableObjectStub<AgentIssueState>;
    }).getByName(this.ctx.props.accountId);
    return new CustomSessionImpl(approvalQueue.dup(), {
      name: this.env.CUSTOM_NAME,
      message: this.env.CUSTOM_MESSAGE,
    }, state, env.AIC_DEFAULT_REPOSITORY ?? "");
  }

  async addObserver(_id: string, _user: Fetcher<GatekeeperUserVerifier>): Promise<void> {
    throw new Error("Agent Issue Console evidence is private in the MVP; shared observers are not permitted.");
  }
  async removeObserver(_id: string): Promise<void> {}

  async applyAction(action: number): Promise<void> {
    throw new Error(`Agent Issue Console's agent capability is read-only (${action}).`);
  }

  async rejectAction(_action: number): Promise<void> {}

  async revertAction(_action: number): Promise<void> {
    throw new Error("Agent Issue Console's agent capability has no actions to revert.");
  }
}

function parsePolicies(env: RuntimeEnv): RepositoryPolicy[] {
  const raw = JSON.parse(env.AIC_REPOSITORY_POLICIES ?? "[]") as Array<Omit<RepositoryPolicy, "dryRun"> & { previewUrl?: string | null }>;
  return raw.map((policy) => ({ ...policy, previewUrl: policy.previewUrl ?? undefined, dryRun: env.AIC_DRY_RUN !== "false" }));
}

function buildRuntime(env: RuntimeEnv, storage: DurableObjectStorage, ownerId: string): ConsoleRuntime {
  const policies = parsePolicies(env);
  const store = new DurableIntakeStore(storage, ownerId);
  const github = new GitHubHttpClient({
    token: env.GITHUB_TOKEN ?? "",
    allowedRepositories: policies.map((policy) => policy.repository),
    allowedLabels: policies.flatMap((policy) => [policy.validationLabel, policy.queueLabel, ...Object.values(policy.statusLabels)]),
    timeoutMs: 20_000,
    retries: 2,
  });
  const llm = new OpenAiCompatibleLanguageModel({
    baseUrl: env.AIC_LLM_BASE_URL ?? "https://opencode.ai/zen/go/v1",
    model: env.AIC_LLM_MODEL ?? "gpt-5.6-luna",
    apiKey: env.OPENCODE_GO_API_KEY ?? "",
    timeoutMs: numberFromEnv(env.AIC_LLM_TIMEOUT_MS, 45_000),
    retries: numberFromEnv(env.AIC_LLM_RETRIES, 2),
    maxOutputTokens: numberFromEnv(env.AIC_MAX_OUTPUT_TOKENS, 4_000),
  });
  const browser = new BrowserRenderingRestClient({
    accountId: env.CLOUDFLARE_ACCOUNT_ID ?? "",
    apiToken: env.CLOUDFLARE_BROWSER_TOKEN ?? "",
    timeoutMs: numberFromEnv(env.AIC_BROWSER_TIMEOUT_MS, 30_000),
  });
  return {
    workflow: new AgentIssueWorkflow({
      github,
      llm,
      browser,
      store,
      policies,
      maxContextCharacters: numberFromEnv(env.AIC_MAX_CONTEXT_CHARACTERS, 60_000),
      maxOutputCharacters: numberFromEnv(env.AIC_MAX_OUTPUT_CHARACTERS, 8_000),
    }),
    store,
    github,
    policies,
    defaultRepository: env.AIC_DEFAULT_REPOSITORY ?? policies[0]?.repository ?? "",
    ownerId,
  };
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function presentIntake(intake: IntakeSnapshot): IntakeResult {
  return {
    id: intake.id,
    repository: intake.repository.fullName,
    request: intake.request,
    state: intake.state,
    updatedAt: intake.updatedAt,
    disposition: intake.decision?.disposition,
    summary: intake.decision?.summary,
    question: intake.question,
    issueUrl: intake.issue?.url,
    evidenceCount: intake.evidence.length,
    evidence: intake.evidence.map((item) => ({
      kind: item.kind,
      source: item.source,
      summary: item.summary,
      capturedAt: item.capturedAt,
      screenshotDataUrl: item.visual?.base64
        ? `data:${item.visual.mimeType};base64,${item.visual.base64}`
        : undefined,
    })),
  };
}

@validateRpc()
export class AgentIssueState extends DurableObject<RuntimeEnv> {
  private runtime(): ConsoleRuntime {
    return buildRuntime(this.env, this.ctx.storage, this.ctx.id.toString());
  }

  async submitIntake(request: string, repository?: string, uiRelated = false): Promise<IntakeResult> {
    const runtime = this.runtime();
    const result = await runtime.workflow.submit({
      ownerId: runtime.ownerId,
      repository: repository ?? runtime.defaultRepository,
      request,
      uiRelated,
    });
    return presentIntake(result);
  }

  async answerIntake(intakeId: string, answer: string, uiRelated = false): Promise<IntakeResult> {
    const runtime = this.runtime();
    return presentIntake(await runtime.workflow.answer(intakeId, runtime.ownerId, answer, uiRelated));
  }

  async getIntake(intakeId: string): Promise<IntakeResult | null> {
    const result = await this.runtime().store.get(intakeId);
    return result ? presentIntake(result) : null;
  }

  async listIntakes(): Promise<IntakeResult[]> {
    return (await this.runtime().store.list()).map(presentIntake);
  }

  async getMonitor(repository?: string): Promise<MonitorSnapshot> {
    const runtime = this.runtime();
    const ref = parseRepository(repository ?? runtime.defaultRepository);
    const policy = runtime.policies.find((item) => item.repository.toLowerCase() === ref.fullName.toLowerCase());
    if (!policy) throw new Error(`Repository ${ref.fullName} is not allowlisted.`);
    const [issues, pulls] = await Promise.all([
      runtime.github.searchIssues(ref, { query: `label:${policy.validationLabel}`, limit: 100 }),
      runtime.github.searchPullRequests(ref, { query: "is:pr", limit: 100 }),
    ]);
    await Promise.all(issues.map(async (issue) => {
      issue.comments = await runtime.github.getIssueComments(ref, issue.number);
    }));
    return buildMonitorSnapshot(ref.fullName, policy, issues, pulls);
  }

  async getMonitorSummary(repository?: string): Promise<MonitorSummary> {
    const snapshot = await this.getMonitor(repository);
    return {
      ready: snapshot.counts.ready,
      running: snapshot.counts.running,
      needsInput: snapshot.counts.needs_input,
      failed: snapshot.counts.failed,
      done: snapshot.counts.done,
      unqueued: snapshot.counts.unqueued,
      refreshedAt: snapshot.refreshedAt,
    };
  }
}

@validateRpc()
export class CustomAccount extends WorkerEntrypoint<Cloudflare.Env, AccountProps> implements GatekeeperUser {
  async describe(): Promise<AccountDescription> {
    return describeCustomAccount();
  }

  async getSingletonGatekeeperClass(): Promise<DurableObjectClass<Gatekeeper<CustomSession>>> {
    return this.ctx.exports.CustomGatekeeper({ props: this.ctx.props });
  }

  async startAppUi(_context: AppUiContext): Promise<GatekeeperUiFrame> {
    const state = (this.ctx.exports.AgentIssueState as unknown as {
      getByName(name: string): DurableObjectStub<AgentIssueState>;
    }).getByName(this.ctx.props.accountId);
    return {
      iframeHtml: AGENT_ISSUE_CONSOLE_HTML,
      ui: new RpcStub(new AgentIssueConsoleUi(state, (this.env as RuntimeEnv).AIC_DEFAULT_REPOSITORY ?? "")),
    };
  }

  async getSupportedResources(): Promise<SupportedResource[]> {
    return [];
  }

  getGatekeeperClassFor(_url: string): never {
    throw new Error("Custom Gatekeeper has no URL-addressed resources.");
  }

  startResourceConfigurator(_resourceUrlPattern: string): Promise<ResourceConfiguratorFrame> {
    throw new Error("Custom Gatekeeper has no URL-addressed resources.");
  }

  async ensureResources(_resourceUrlPatterns: string[]): Promise<{ url?: string }> {
    return {};
  }

  async revoke(): Promise<void> {}

  reconnect(): Promise<{ url: string }> {
    throw new Error("Custom Gatekeeper has no credentials to reconnect.");
  }

  async getAuthenticatedEmail(): Promise<string | null> {
    return null;
  }

  @skipRpcValidation()
  async getVerifier(): Promise<Fetcher<GatekeeperUserVerifier>> {
    return this.ctx.exports.CustomVerifier({});
  }
}

@validateRpc()
export class CustomVerifier extends WorkerEntrypoint<Cloudflare.Env> implements GatekeeperUserVerifier {
  verify(): void {}
}

@validateRpc()
export class AgentIssueConsoleUi extends RpcTarget {
  constructor(
    private readonly state: ConsoleState,
    private readonly defaultRepository: string,
  ) {
    super();
  }

  async getVersion(): Promise<string> {
    return "mvp-1";
  }

  submitIntake(request: string, repository?: string, uiRelated = false): Promise<IntakeResult> {
    return this.state.submitIntake(request, repository ?? this.defaultRepository, uiRelated);
  }

  answerIntake(intakeId: string, answer: string, uiRelated = false): Promise<IntakeResult> {
    return this.state.answerIntake(intakeId, answer, uiRelated);
  }

  listIntakes(): Promise<IntakeResult[]> {
    return this.state.listIntakes();
  }

  getMonitor(repository?: string): Promise<MonitorSnapshot> {
    return this.state.getMonitor(repository ?? this.defaultRepository);
  }
}

@validateRpc()
export class GatekeeperVendor extends WorkerEntrypoint<Cloudflare.Env> {
  async describe(): Promise<VendorDescription> {
    return describeCustomVendor();
  }

  @skipRpcValidation()
  async createAccount(): Promise<Fetcher<GatekeeperUser>> {
    return this.ctx.exports.CustomAccount({ props: { accountId: crypto.randomUUID() } });
  }

  connectAccount(
    _callback: Fetcher<GatekeeperConnectCallback>,
    _options?: GatekeeperConnectOptions,
  ): Promise<{ url: string }> {
    throw new Error("Custom Gatekeeper is auto-provisioned and has no connect flow.");
  }

  async getSupportedResources(_options?: { userId?: string }): Promise<SupportedResource[]> {
    return [];
  }

  async getTypeScriptTypes(): Promise<string> {
    return TYPES_CODE;
  }
}
