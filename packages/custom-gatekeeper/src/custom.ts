import { DurableObject, RpcStub, RpcTarget, WorkerEntrypoint } from "cloudflare:workers";
import { skipRpcValidation, validateRpc } from "capnweb-validate";
import type {
  AccountDescription,
  ApprovalQueue,
  AppUiContext,
  Gatekeeper,
  GatekeeperConnectCallback,
  GatekeeperConnectOptions,
  GatekeeperUiFrame,
  GatekeeperUser,
  GatekeeperUserVerifier,
  ResourceConfiguratorFrame,
  ResourceDescription,
  SupportedResource,
  VendorDescription,
} from "@gadgets/workshop-shared/gatekeeper";
import type { CustomDeploymentInfo, CustomSession, IntakeResult, MonitorSummary } from "./types.js";
import TYPES_CODE from "./types-code.js";
import { AGENT_ISSUE_CONSOLE_HTML } from "./ui.js";
import { RustCoreClient, type ConsoleState, type MonitorSnapshot } from "./core-client.js";

const CUSTOM_ICON = {
  url: "data:image/svg+xml," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='none' stroke='currentColor' stroke-width='18'><path d='M50 38h156v180H50z'/><path d='M82 84h92M82 126h92M82 168h52'/><circle cx='184' cy='170' r='30'/><path d='m171 170 9 9 18-21'/></svg>",
  ),
};

type ObservationQueue = Pick<ApprovalQueue, "authorizeObservation"> &
  Partial<{ [Symbol.dispose](): void }>;
type AccountProps = { accountId: string };
type RuntimeEnv = Cloudflare.Env & { AIC_CORE: Fetcher; AIC_DEFAULT_REPOSITORY?: string };

export function describeCustomVendor(): VendorDescription {
  return {
    displayName: "Agent Issue Console",
    url: "https://github.com/ishii1648/agent-issue-console",
    logo: CUSTOM_ICON,
    color: "#e8f2ff",
    tagline: "Validate GitHub Issues and monitor the coding queue",
    description: "Allowlist済みrepositoryを調査してIssueを作成し、codex-loopのGitHub上の状態を読み取ります。",
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

function coreFor(env: Cloudflare.Env, ownerId: string): RustCoreClient {
  const runtime = env as RuntimeEnv;
  if (!runtime.AIC_CORE) throw new Error("Agent Issue Console Rust core binding is unavailable.");
  return new RustCoreClient(runtime.AIC_CORE, ownerId, runtime.AIC_DEFAULT_REPOSITORY ?? "");
}

@validateRpc()
export class CustomSessionImpl extends RpcTarget implements CustomSession {
  constructor(
    private readonly approvalQueue: ObservationQueue,
    private readonly info: CustomDeploymentInfo,
    private readonly state: Pick<ConsoleState, "getIntake" | "listIntakes" | "getMonitorSummary">,
    private readonly defaultRepository: string,
  ) { super(); }

  async getIntake(intakeId: string): Promise<IntakeResult | null> {
    const result = await this.state.getIntake(intakeId);
    await this.approvalQueue.authorizeObservation({
      title: `Read intake ${intakeId}`,
      description: "保存済みAgent Issue Console intakeを一件読み取りました。",
    });
    return result;
  }

  async listIntakes(): Promise<IntakeResult[]> {
    const results = await this.state.listIntakes();
    await this.approvalQueue.authorizeObservation({
      title: "List Agent Issue Console intakes",
      description: `${results.length}件の保存済みintake summaryを読み取りました。`,
    });
    return results;
  }

  async getMonitorSummary(repository?: string): Promise<MonitorSummary> {
    const target = repository ?? this.defaultRepository;
    const summary = await this.state.getMonitorSummary(target);
    await this.approvalQueue.authorizeObservation({
      title: `Refresh monitor for ${target}`,
      description: "GitHub上のIssueとPull Request queueを読み取りました。",
    });
    return summary;
  }

  async getDeploymentInfo(): Promise<CustomDeploymentInfo> {
    await this.approvalQueue.authorizeObservation({
      title: "Read Agent Issue Console policy information",
      description: "secretを含まないdeployment identityとproduct guidanceを読み取りました。",
    });
    return this.info;
  }

  [Symbol.dispose](): void { this.approvalQueue[Symbol.dispose]?.(); }
}

@validateRpc()
export class CustomGatekeeper extends DurableObject<Cloudflare.Env, AccountProps>
  implements Gatekeeper<CustomSession> {
  async describe(): Promise<ResourceDescription> {
    return {
      url: "agent-issue-console://intakes",
      title: "Agent Issue Console",
      snippet: "調査済みGitHub Issue intakeとcodex-loop monitor。",
      suggestedBindingName: "AGENT_ISSUE_CONSOLE",
      tsType: "CustomSession",
    };
  }
  async getTypeScriptTypes(): Promise<string> { return TYPES_CODE; }
  async getAutoApprovableActions(): Promise<[]> { return []; }

  async startSession(approvalQueue: RpcStub<ApprovalQueue>): Promise<CustomSession> {
    const runtime = this.env as RuntimeEnv;
    return new CustomSessionImpl(
      approvalQueue.dup(),
      { name: this.env.CUSTOM_NAME, message: this.env.CUSTOM_MESSAGE },
      coreFor(this.env, this.ctx.props.accountId),
      runtime.AIC_DEFAULT_REPOSITORY ?? "",
    );
  }

  async addObserver(): Promise<void> {
    throw new Error("Agent Issue Console evidenceはprivateであり、共有observerを許可しません。");
  }
  async removeObserver(): Promise<void> {}
  async applyAction(action: number): Promise<void> {
    throw new Error(`Agent Issue Consoleのagent capabilityはread-onlyです (${action})。`);
  }
  async rejectAction(): Promise<void> {}
  async revertAction(): Promise<void> {
    throw new Error("Agent Issue Consoleのagent capabilityにはrevert可能なactionがありません。");
  }
}

@validateRpc()
export class CustomAccount extends WorkerEntrypoint<Cloudflare.Env, AccountProps>
  implements GatekeeperUser {
  async describe(): Promise<AccountDescription> { return describeCustomAccount(); }
  async getSingletonGatekeeperClass(): Promise<DurableObjectClass<Gatekeeper<CustomSession>>> {
    return this.ctx.exports.CustomGatekeeper({ props: this.ctx.props });
  }

  async startAppUi(_context: AppUiContext): Promise<GatekeeperUiFrame> {
    const runtime = this.env as RuntimeEnv;
    return {
      iframeHtml: AGENT_ISSUE_CONSOLE_HTML,
      ui: new RpcStub(new AgentIssueConsoleUi(
        coreFor(this.env, this.ctx.props.accountId),
        runtime.AIC_DEFAULT_REPOSITORY ?? "",
      )),
    };
  }

  async getSupportedResources(): Promise<SupportedResource[]> { return []; }
  getGatekeeperClassFor(): never { throw new Error("URL-addressed resourceはありません。"); }
  startResourceConfigurator(): Promise<ResourceConfiguratorFrame> {
    throw new Error("URL-addressed resourceはありません。");
  }
  async ensureResources(): Promise<{ url?: string }> { return {}; }
  async revoke(): Promise<void> {}
  reconnect(): Promise<{ url: string }> { throw new Error("Reconnect対象credentialはありません。"); }
  async getAuthenticatedEmail(): Promise<string | null> { return null; }

  @skipRpcValidation()
  async getVerifier(): Promise<Fetcher<GatekeeperUserVerifier>> {
    return this.ctx.exports.CustomVerifier({});
  }
}

@validateRpc()
export class CustomVerifier extends WorkerEntrypoint<Cloudflare.Env>
  implements GatekeeperUserVerifier {
  verify(): void {}
}

@validateRpc()
export class AgentIssueConsoleUi extends RpcTarget {
  constructor(private readonly state: ConsoleState, private readonly defaultRepository: string) {
    super();
  }
  async getVersion(): Promise<string> { return "rust-core-1"; }
  submitIntake(request: string, repository?: string, uiRelated = false): Promise<IntakeResult> {
    return this.state.submitIntake(request, repository ?? this.defaultRepository, uiRelated);
  }
  answerIntake(intakeId: string, answer: string, uiRelated = false): Promise<IntakeResult> {
    return this.state.answerIntake(intakeId, answer, uiRelated);
  }
  listIntakes(): Promise<IntakeResult[]> { return this.state.listIntakes(); }
  getMonitor(repository?: string): Promise<MonitorSnapshot> {
    return this.state.getMonitor(repository ?? this.defaultRepository);
  }
}

@validateRpc()
export class GatekeeperVendor extends WorkerEntrypoint<Cloudflare.Env> {
  async describe(): Promise<VendorDescription> { return describeCustomVendor(); }

  @skipRpcValidation()
  async createAccount(): Promise<Fetcher<GatekeeperUser>> {
    return this.ctx.exports.CustomAccount({ props: { accountId: crypto.randomUUID() } });
  }
  connectAccount(
    _callback: Fetcher<GatekeeperConnectCallback>,
    _options?: GatekeeperConnectOptions,
  ): Promise<{ url: string }> {
    throw new Error("Auto-provisioned accountにconnect flowはありません。");
  }
  async getSupportedResources(): Promise<SupportedResource[]> { return []; }
  async getTypeScriptTypes(): Promise<string> { return TYPES_CODE; }
}
