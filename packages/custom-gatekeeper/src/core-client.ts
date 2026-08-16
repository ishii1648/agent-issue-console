import type { IntakeResult, MonitorSummary } from "./types.js";

export interface MonitorPullRequest {
  number: number;
  title: string;
  url: string;
  draft: boolean;
  checkState: "pending" | "success" | "failure" | "unknown";
}

export interface MonitorItem {
  repository: string;
  status: "ready" | "running" | "needs_input" | "failed" | "done" | "unqueued";
  pendingQuestion?: string;
  issue: { number: number; title: string; url: string; labels: string[]; updatedAt: string };
  relatedPullRequests: MonitorPullRequest[];
}

export interface MonitorSnapshot {
  counts: Record<"ready" | "running" | "needs_input" | "failed" | "done" | "unqueued", number>;
  items: MonitorItem[];
  refreshedAt: string;
}

export interface ConsoleState {
  submitIntake(request: string, repository?: string, uiRelated?: boolean): Promise<IntakeResult>;
  answerIntake(intakeId: string, answer: string, uiRelated?: boolean): Promise<IntakeResult>;
  getIntake(intakeId: string): Promise<IntakeResult | null>;
  listIntakes(): Promise<IntakeResult[]>;
  getMonitor(repository?: string): Promise<MonitorSnapshot>;
  getMonitorSummary(repository?: string): Promise<MonitorSummary>;
}

export class RustCoreClient implements ConsoleState {
  constructor(
    private readonly core: Fetcher,
    private readonly ownerId: string,
    private readonly defaultRepository: string,
  ) {
    if (!ownerId || ownerId.length > 256) throw new Error("Invalid Agent Issue Console owner capability.");
  }

  submitIntake(request: string, repository?: string, uiRelated = false): Promise<IntakeResult> {
    return this.call("/v1/intakes", {
      method: "POST",
      body: JSON.stringify({ request, repository: repository ?? this.defaultRepository, uiRelated }),
    });
  }

  answerIntake(intakeId: string, answer: string, uiRelated = false): Promise<IntakeResult> {
    return this.call(`/v1/intakes/${encodeURIComponent(intakeId)}/answer`, {
      method: "POST",
      body: JSON.stringify({ answer, uiRelated }),
    });
  }

  getIntake(intakeId: string): Promise<IntakeResult | null> {
    return this.call(`/v1/intakes/${encodeURIComponent(intakeId)}`);
  }

  listIntakes(): Promise<IntakeResult[]> { return this.call("/v1/intakes"); }

  getMonitor(repository?: string): Promise<MonitorSnapshot> {
    return this.call(`/v1/monitor?repository=${encodeURIComponent(repository ?? this.defaultRepository)}`);
  }

  getMonitorSummary(repository?: string): Promise<MonitorSummary> {
    return this.call(`/v1/monitor/summary?repository=${encodeURIComponent(repository ?? this.defaultRepository)}`);
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.core.fetch(`https://agent-issue-core.internal${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-agent-issue-owner": this.ownerId,
      },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error ?? `Agent Issue Console core failed with HTTP ${response.status}.`);
    }
    return response.json() as Promise<T>;
  }
}
