import type {
  IssueRecord,
  MonitorItem,
  MonitorSnapshot,
  MonitorStatus,
  PullRequestRecord,
  RepositoryPolicy,
} from "./domain.js";
import { extractConsoleMetadata } from "./issue-body.js";

export function classifyStatus(labels: string[], policy: RepositoryPolicy): MonitorStatus {
  const normalized = new Set(labels.map((label) => label.toLowerCase()));
  const configured = policy.statusLabels;
  if (normalized.has(configured.failed.toLowerCase())) return "failed";
  if (normalized.has(configured.needsInput.toLowerCase())) return "needs_input";
  if (normalized.has(configured.running.toLowerCase())) return "running";
  if (normalized.has(configured.ready.toLowerCase())) return "ready";
  if (normalized.has(configured.done.toLowerCase())) return "done";
  return "unqueued";
}

export function extractPendingQuestion(issue: IssueRecord, status: MonitorStatus): string | undefined {
  if (status !== "needs_input") return undefined;
  const comments = issue.comments ?? [];
  const candidate = [...comments].reverse().find((comment) => /\?|？|question|確認|教えて/i.test(comment.body));
  return candidate?.body.trim();
}

export function buildMonitorSnapshot(
  repository: string,
  policy: RepositoryPolicy,
  issues: IssueRecord[],
  pullRequests: PullRequestRecord[],
  now = new Date(),
): MonitorSnapshot {
  const items: MonitorItem[] = issues.map((issue) => {
    const status = classifyStatus(issue.labels, policy);
    return {
      issue,
      repository,
      status,
      relatedPullRequests: pullRequests.filter((pr) => pr.linkedIssueNumbers.includes(issue.number)),
      pendingQuestion: extractPendingQuestion(issue, status),
      consoleMetadata: extractConsoleMetadata(issue.body),
    };
  });
  const statuses: MonitorStatus[] = ["ready", "running", "needs_input", "failed", "done", "unqueued"];
  const counts = Object.fromEntries(statuses.map((status) => [status, items.filter((item) => item.status === status).length])) as Record<MonitorStatus, number>;
  const byUpdated = <T extends { updatedAt: string }>(a: T, b: T) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  return {
    counts,
    items: [...items].sort((a, b) => byUpdated(a.issue, b.issue)),
    recentIssues: [...issues].sort(byUpdated).slice(0, 10),
    recentPullRequests: [...pullRequests].sort(byUpdated).slice(0, 10),
    refreshedAt: now.toISOString(),
  };
}

