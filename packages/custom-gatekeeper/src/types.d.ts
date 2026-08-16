/** Non-secret Agent Issue Console deployment information. */
export interface CustomDeploymentInfo {
  name: string;
  message: string;
}

export type IntakeState = "understanding" | "investigating" | "needs_input" | "validating" | "creating_issue" | "completed" | "resolved_without_issue" | "failed";
export type IntakeDisposition = "create_issue" | "duplicate" | "already_implemented" | "in_progress" | "not_substantiated" | "out_of_scope" | "blocked" | "needs_input";
export interface IntakeEvidenceResult {
  kind: "repository" | "code" | "issue" | "pull_request" | "commit" | "ui";
  source: string;
  summary: string;
  capturedAt: string;
  screenshotDataUrl?: string;
}
export interface IntakeResult {
  id: string;
  repository: string;
  request: string;
  state: IntakeState;
  updatedAt: string;
  disposition?: IntakeDisposition;
  summary?: string;
  question?: string;
  issueUrl?: string;
  evidenceCount: number;
  evidence: IntakeEvidenceResult[];
}
export interface MonitorSummary {
  ready: number;
  running: number;
  needsInput: number;
  failed: number;
  done: number;
  unqueued: number;
  refreshedAt: string;
}

/** Agent Issue Console capability supplied to the Cloudflare OS agent. */
export interface CustomSession {
  /** Returns deployment identity and instructions after recording an observation. */
  getDeploymentInfo(): Promise<CustomDeploymentInfo>;
  /** Returns one persisted intake owned by the connected operator. */
  getIntake(intakeId: string): Promise<IntakeResult | null>;
  /** Lists persisted intakes, newest first. */
  listIntakes(): Promise<IntakeResult[]>;
  /** Refreshes the GitHub-backed queue summary. */
  getMonitorSummary(repository?: string): Promise<MonitorSummary>;
}
