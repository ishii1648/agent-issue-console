import type {
  CodeMatch,
  CommentRecord,
  CommitRecord,
  IssueRecord,
  PullRequestRecord,
  RepositoryMetadata,
  RepositoryRef,
} from "./domain.js";
import type { GitHubPort, SearchOptions } from "./ports.js";
import { redactSecrets } from "./security.js";

export interface GitHubClientConfig {
  token: string;
  allowedRepositories: string[];
  allowedLabels: string[];
  timeoutMs: number;
  retries: number;
  baseUrl?: string;
}

export class GitHubHttpClient implements GitHubPort {
  private readonly baseUrl: string;
  private readonly repositories: Set<string>;
  private readonly labels: Set<string>;

  constructor(private readonly config: GitHubClientConfig, private readonly fetcher: typeof fetch = fetch) {
    this.baseUrl = (config.baseUrl ?? "https://api.github.com").replace(/\/$/, "");
    this.repositories = new Set(config.allowedRepositories.map((value) => value.toLowerCase()));
    this.labels = new Set(config.allowedLabels.map((value) => value.toLowerCase()));
  }

  async getRepository(repository: RepositoryRef): Promise<RepositoryMetadata> {
    const repo = await this.request<RepoResponse>(repository, `/repos/${repository.fullName}`);
    const branch = await this.request<{ commit: { sha: string } }>(repository, `/repos/${repository.fullName}/branches/${encodeURIComponent(repo.default_branch)}`);
    return {
      repository,
      defaultBranch: repo.default_branch,
      defaultBranchSha: branch.commit.sha,
      description: repo.description ?? undefined,
      permissions: { read: true, issuesWrite: Boolean(repo.permissions?.push || repo.permissions?.triage) },
    };
  }

  async listTree(repository: RepositoryRef, ref: string, path = ""): Promise<string[]> {
    const tree = await this.request<{ tree: Array<{ path: string }> }>(repository, `/repos/${repository.fullName}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
    return tree.tree.map((item) => item.path).filter((item) => !path || item.startsWith(path));
  }

  async getFile(repository: RepositoryRef, ref: string, path: string): Promise<string> {
    const result = await this.request<{ content?: string; encoding?: string }>(repository, `/repos/${repository.fullName}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`);
    if (result.encoding !== "base64" || !result.content) throw new Error("GitHub file response is not base64 content.");
    const binary = atob(result.content.replace(/\n/g, ""));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  }

  async searchCode(repository: RepositoryRef, options: SearchOptions): Promise<CodeMatch[]> {
    const query = `${options.query} repo:${repository.fullName}`;
    const result = await this.request<{ items: Array<{ path: string; sha: string; html_url: string; text_matches?: Array<{ fragment: string }> }> }>(repository, `/search/code?q=${encodeURIComponent(query)}&per_page=${options.limit ?? 20}`, { headers: { accept: "application/vnd.github.text-match+json" } });
    return result.items.map((item) => ({ path: item.path, sha: item.sha, url: item.html_url, excerpt: redactSecrets(item.text_matches?.map((match) => match.fragment).join("\n") ?? "") }));
  }

  async searchIssues(repository: RepositoryRef, options: SearchOptions): Promise<IssueRecord[]> {
    const query = `${options.query} repo:${repository.fullName} is:issue`;
    const result = await this.request<{ items: GitHubIssue[] }>(repository, `/search/issues?q=${encodeURIComponent(query)}&per_page=${options.limit ?? 20}`);
    return result.items.map(mapIssue);
  }

  async getIssue(repository: RepositoryRef, number: number): Promise<IssueRecord> {
    return mapIssue(await this.request<GitHubIssue>(repository, `/repos/${repository.fullName}/issues/${number}`));
  }

  async getIssueComments(repository: RepositoryRef, number: number): Promise<CommentRecord[]> {
    const comments = await this.request<GitHubComment[]>(repository, `/repos/${repository.fullName}/issues/${number}/comments?per_page=30`);
    return comments.map(mapComment);
  }

  async searchPullRequests(repository: RepositoryRef, options: SearchOptions): Promise<PullRequestRecord[]> {
    const query = `${options.query} repo:${repository.fullName} is:pr`;
    const result = await this.request<{ items: GitHubIssue[] }>(repository, `/search/issues?q=${encodeURIComponent(query)}&per_page=${options.limit ?? 20}`);
    return Promise.all(result.items.map((item) => this.getPullRequest(repository, item.number)));
  }

  async getPullRequest(repository: RepositoryRef, number: number): Promise<PullRequestRecord> {
    const pr = await this.request<GitHubPull>(repository, `/repos/${repository.fullName}/pulls/${number}`);
    let checkState: PullRequestRecord["checkState"] = "unknown";
    try {
      const checks = await this.request<{ check_runs: Array<{ status: string; conclusion: string | null }> }>(repository, `/repos/${repository.fullName}/commits/${pr.head.sha}/check-runs?per_page=100`);
      checkState = checks.check_runs.some((check) => check.status !== "completed") ? "pending" :
        checks.check_runs.some((check) => !["success", "neutral", "skipped"].includes(check.conclusion ?? "")) ? "failure" :
        checks.check_runs.length ? "success" : "unknown";
    } catch { /* Checks may be unavailable with minimal permissions. */ }
    return {
      number: pr.number, title: pr.title, body: redactSecrets(pr.body ?? ""),
      state: pr.merged_at ? "merged" : pr.state, url: pr.html_url, draft: pr.draft,
      updatedAt: pr.updated_at, checkState, linkedIssueNumbers: extractIssueReferences(`${pr.title}\n${pr.body ?? ""}`),
    };
  }

  async getPullRequestDiff(repository: RepositoryRef, number: number): Promise<string> {
    return this.requestText(repository, `/repos/${repository.fullName}/pulls/${number}`, { headers: { accept: "application/vnd.github.diff" } });
  }

  async getPullRequestDiscussion(repository: RepositoryRef, number: number): Promise<string[]> {
    const [reviews, comments] = await Promise.all([
      this.request<Array<{ body: string | null }>>(repository, `/repos/${repository.fullName}/pulls/${number}/reviews?per_page=100`),
      this.request<Array<{ body: string }>>(repository, `/repos/${repository.fullName}/pulls/${number}/comments?per_page=100`),
    ]);
    return [...reviews.map((item) => item.body ?? ""), ...comments.map((item) => item.body)].map(redactSecrets);
  }

  async searchCommits(repository: RepositoryRef, options: SearchOptions): Promise<CommitRecord[]> {
    const query = `${options.query} repo:${repository.fullName}`;
    const result = await this.request<{ items: GitHubCommit[] }>(repository, `/search/commits?q=${encodeURIComponent(query)}&per_page=${options.limit ?? 20}`);
    return result.items.map(mapCommit);
  }

  async getCommit(repository: RepositoryRef, sha: string): Promise<CommitRecord> {
    const commit = await this.request<GitHubCommit & { files?: Array<{ filename: string }> }>(repository, `/repos/${repository.fullName}/commits/${encodeURIComponent(sha)}`);
    return { ...mapCommit(commit), files: commit.files?.map((file) => file.filename) };
  }

  async getCommitDiff(repository: RepositoryRef, sha: string): Promise<string> {
    return this.requestText(repository, `/repos/${repository.fullName}/commits/${encodeURIComponent(sha)}`, { headers: { accept: "application/vnd.github.diff" } });
  }

  async createIssue(repository: RepositoryRef, input: { title: string; body: string; labels: string[] }): Promise<IssueRecord> {
    this.assertLabels(input.labels);
    const result = await this.request<GitHubIssue>(repository, `/repos/${repository.fullName}/issues`, { method: "POST", body: JSON.stringify(input), retryWrites: false });
    return mapIssue(result);
  }

  async addLabels(repository: RepositoryRef, issueNumber: number, labels: string[]): Promise<void> {
    this.assertLabels(labels);
    await this.request(repository, `/repos/${repository.fullName}/issues/${issueNumber}/labels`, { method: "POST", body: JSON.stringify({ labels }), retryWrites: false });
  }

  private assertRepository(repository: RepositoryRef): void {
    if (!this.repositories.has(repository.fullName.toLowerCase())) throw new Error(`Repository ${repository.fullName} is not allowlisted.`);
  }

  private assertLabels(labels: string[]): void {
    if (labels.some((label) => !this.labels.has(label.toLowerCase()))) throw new Error("A requested label is not allowed by repository policy.");
  }

  private async request<T>(repository: RepositoryRef, path: string, init: RequestInit & { retryWrites?: boolean } = {}): Promise<T> {
    const response = await this.perform(repository, path, init);
    return response.json() as Promise<T>;
  }

  private async requestText(repository: RepositoryRef, path: string, init: RequestInit = {}): Promise<string> {
    return (await this.perform(repository, path, init)).text();
  }

  private async perform(repository: RepositoryRef, path: string, init: RequestInit & { retryWrites?: boolean }): Promise<Response> {
    this.assertRepository(repository);
    const method = init.method ?? "GET";
    const attempts = method === "GET" || init.retryWrites ? this.config.retries + 1 : 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
      try {
        const response = await this.fetcher(`${this.baseUrl}${path}`, {
          ...init,
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${this.config.token}`,
            "content-type": "application/json",
            "user-agent": "agent-issue-console",
            "x-github-api-version": "2022-11-28",
            ...init.headers,
          },
          signal: controller.signal,
        });
        if (response.ok) return response;
        const retryable = response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504;
        if (retryable && attempt + 1 < attempts) continue;
        throw new Error(`GitHub request failed with HTTP ${response.status}.`);
      } catch (error) {
        lastError = error;
        if (attempt + 1 >= attempts) break;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new Error(redactSecrets(lastError instanceof Error ? lastError.message : "GitHub request failed."));
  }
}

interface RepoResponse { default_branch: string; description: string | null; permissions?: { push?: boolean; triage?: boolean } }
interface GitHubIssue { number: number; title: string; body: string | null; state: "open" | "closed"; html_url: string; labels: Array<string | { name?: string }>; created_at: string; updated_at: string }
interface GitHubComment { id: number; user: { login: string }; body: string; created_at: string; html_url: string }
interface GitHubPull { number: number; title: string; body: string | null; state: "open" | "closed"; html_url: string; draft: boolean; merged_at: string | null; updated_at: string; head: { sha: string } }
interface GitHubCommit { sha: string; html_url: string; commit: { message: string; author?: { date?: string } } }

function mapIssue(item: GitHubIssue): IssueRecord {
  return { number: item.number, title: item.title, body: redactSecrets(item.body ?? ""), state: item.state, url: item.html_url, labels: item.labels.map((label) => typeof label === "string" ? label : label.name ?? ""), createdAt: item.created_at, updatedAt: item.updated_at };
}
function mapComment(item: GitHubComment): CommentRecord { return { id: String(item.id), author: item.user.login, body: redactSecrets(item.body), createdAt: item.created_at, url: item.html_url }; }
function mapCommit(item: GitHubCommit): CommitRecord { return { sha: item.sha, message: redactSecrets(item.commit.message), url: item.html_url, committedAt: item.commit.author?.date ?? new Date(0).toISOString() }; }
function extractIssueReferences(value: string): number[] { return [...value.matchAll(/(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)?\s*#(\d+)/gi)].map((match) => Number(match[1])); }

