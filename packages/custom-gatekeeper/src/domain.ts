export const INTAKE_STATES = [
  "understanding",
  "investigating",
  "needs_input",
  "validating",
  "creating_issue",
  "completed",
  "resolved_without_issue",
  "failed",
] as const;

export type IntakeState = (typeof INTAKE_STATES)[number];

export const DISPOSITIONS = [
  "create_issue",
  "duplicate",
  "already_implemented",
  "in_progress",
  "not_substantiated",
  "out_of_scope",
  "blocked",
  "needs_input",
] as const;

export type Disposition = (typeof DISPOSITIONS)[number];
export type EvidenceKind = "repository" | "code" | "issue" | "pull_request" | "commit" | "ui";

export interface RepositoryRef {
  owner: string;
  name: string;
  fullName: string;
}

export interface StatusLabels {
  ready: string;
  running: string;
  needsInput: string;
  failed: string;
  done: string;
}

export interface RepositoryPolicy {
  repository: string;
  validationLabel: string;
  queueLabel: string;
  autoQueueAfterCreate: boolean;
  statusLabels: StatusLabels;
  previewUrl?: string;
  previewHostnameAllowlist: string[];
  requireVisualEvidenceForUi: boolean;
  dryRun: boolean;
}

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  source: string;
  summary: string;
  excerpt?: string;
  capturedAt: string;
  metadata?: Record<string, string | number | boolean | null>;
  visual?: {
    mimeType: "image/webp" | "image/png" | "image/jpeg";
    base64: string;
    viewport: { width: number; height: number };
    environment: string;
    requestedUrl: string;
  };
}

export interface ValidationDecision {
  disposition: Disposition;
  summary: string;
  issueTitle?: string;
  problem?: string;
  currentBehavior?: string;
  expectedBehavior?: string;
  completionCriteria?: string[];
  nonGoals?: string[];
  question?: string;
  relatedIdentifiers?: string[];
}

export interface IssueReference {
  number: number;
  url: string;
  title: string;
}

export interface IntakeSnapshot {
  id: string;
  ownerId: string;
  repository: RepositoryRef;
  request: string;
  normalizedRequest: string;
  state: IntakeState;
  createdAt: string;
  updatedAt: string;
  defaultBranchSha?: string;
  evidence: Evidence[];
  question?: string;
  answer?: string;
  fingerprint?: string;
  decision?: ValidationDecision;
  issue?: IssueReference;
  error?: string;
}

export interface RepositoryMetadata {
  repository: RepositoryRef;
  defaultBranch: string;
  defaultBranchSha: string;
  description?: string;
  permissions: { read: boolean; issuesWrite: boolean };
}

export interface IssueRecord {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  url: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  comments?: CommentRecord[];
}

export interface PullRequestRecord {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed" | "merged";
  url: string;
  draft: boolean;
  updatedAt: string;
  checkState: "pending" | "success" | "failure" | "unknown";
  linkedIssueNumbers: number[];
}

export interface CommentRecord {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  url: string;
}

export interface CommitRecord {
  sha: string;
  message: string;
  url: string;
  committedAt: string;
  files?: string[];
}

export interface CodeMatch {
  path: string;
  sha: string;
  excerpt: string;
  url: string;
}

export interface VisualEvidence {
  requestedUrl: string;
  finalUrl: string;
  environment: string;
  title: string;
  mainText: string;
  accessibility: string;
  screenshot: string;
  viewport: { width: number; height: number };
  capturedAt: string;
}

export type MonitorStatus = "ready" | "running" | "needs_input" | "failed" | "done" | "unqueued";

export interface MonitorItem {
  issue: IssueRecord;
  repository: string;
  status: MonitorStatus;
  relatedPullRequests: PullRequestRecord[];
  pendingQuestion?: string;
  consoleMetadata?: { fingerprint?: string; defaultBranchSha?: string };
}

export interface MonitorSnapshot {
  counts: Record<MonitorStatus, number>;
  items: MonitorItem[];
  recentIssues: IssueRecord[];
  recentPullRequests: PullRequestRecord[];
  refreshedAt: string;
}

export function parseRepository(fullName: string): RepositoryRef {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(fullName.trim());
  if (!match) throw new Error("Repository must use owner/name format.");
  return { owner: match[1], name: match[2], fullName: `${match[1]}/${match[2]}` };
}

export function isTerminalState(state: IntakeState): boolean {
  return state === "completed" || state === "resolved_without_issue" || state === "failed";
}
