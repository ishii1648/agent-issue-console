import type {
  CodeMatch,
  CommitRecord,
  IntakeSnapshot,
  IssueRecord,
  PullRequestRecord,
  RepositoryMetadata,
  RepositoryRef,
  ValidationDecision,
  VisualEvidence,
} from "./domain.js";
import type { BrowserPort, GitHubPort, IntakeStore, LanguageModel, LanguageModelInput, SearchOptions } from "./ports.js";

export class MemoryIntakeStore implements IntakeStore {
  #items = new Map<string, IntakeSnapshot>();
  async get(id: string): Promise<IntakeSnapshot | undefined> { return structuredClone(this.#items.get(id)); }
  async put(intake: IntakeSnapshot): Promise<void> { this.#items.set(intake.id, structuredClone(intake)); }
  async list(): Promise<IntakeSnapshot[]> { return [...this.#items.values()].map((item) => structuredClone(item)); }
}

export class FakeLanguageModel implements LanguageModel {
  readonly calls: LanguageModelInput[] = [];
  constructor(private readonly decisions: ValidationDecision[]) {}
  async decide(input: LanguageModelInput): Promise<ValidationDecision> {
    this.calls.push(structuredClone(input));
    const decision = this.decisions.shift();
    if (!decision) throw new Error("No fake LLM decision configured.");
    return structuredClone(decision);
  }
}

export class FakeBrowser implements BrowserPort {
  readonly calls: string[] = [];
  constructor(private readonly evidence?: VisualEvidence) {}
  async capture(url: string): Promise<VisualEvidence> {
    this.calls.push(url);
    if (!this.evidence) throw new Error("Browser evidence unavailable.");
    return structuredClone(this.evidence);
  }
}

export interface FakeGitHubFixture {
  metadata: RepositoryMetadata;
  tree?: string[];
  files?: Record<string, string>;
  code?: CodeMatch[];
  issues?: IssueRecord[];
  pullRequests?: PullRequestRecord[];
  commits?: CommitRecord[];
  createTimeoutAfterWrite?: boolean;
  writeAllowed?: boolean;
}

export class FakeGitHub implements GitHubPort {
  readonly fixture: Required<Omit<FakeGitHubFixture, "createTimeoutAfterWrite" | "writeAllowed">> & Pick<FakeGitHubFixture, "createTimeoutAfterWrite" | "writeAllowed">;
  createCalls = 0;
  labelCalls = 0;

  constructor(fixture: FakeGitHubFixture) {
    this.fixture = {
      tree: [], files: {}, code: [], issues: [], pullRequests: [], commits: [],
      ...structuredClone(fixture),
    };
  }

  async getRepository(_repository: RepositoryRef): Promise<RepositoryMetadata> { return structuredClone(this.fixture.metadata); }
  async listTree(): Promise<string[]> { return structuredClone(this.fixture.tree); }
  async getFile(_repository: RepositoryRef, _ref: string, path: string): Promise<string> {
    const value = this.fixture.files[path];
    if (value === undefined) throw new Error(`Missing fake file ${path}`);
    return value;
  }
  async searchCode(_repository: RepositoryRef, options: SearchOptions): Promise<CodeMatch[]> {
    return this.fixture.code.filter((item) => matches([item.path, item.excerpt], options.query));
  }
  async searchIssues(_repository: RepositoryRef, options: SearchOptions): Promise<IssueRecord[]> {
    return this.fixture.issues.filter((item) => matches([item.title, item.body], options.query));
  }
  async getIssue(_repository: RepositoryRef, number: number): Promise<IssueRecord> {
    const item = this.fixture.issues.find((candidate) => candidate.number === number);
    if (!item) throw new Error(`Missing fake issue ${number}`);
    return structuredClone(item);
  }
  async getIssueComments(_repository: RepositoryRef, number: number): Promise<IssueRecord["comments"]> {
    return (await this.getIssue(_repository, number)).comments;
  }
  async searchPullRequests(_repository: RepositoryRef, options: SearchOptions): Promise<PullRequestRecord[]> {
    return this.fixture.pullRequests.filter((item) => matches([item.title, item.body], options.query));
  }
  async getPullRequest(_repository: RepositoryRef, number: number): Promise<PullRequestRecord> {
    const item = this.fixture.pullRequests.find((candidate) => candidate.number === number);
    if (!item) throw new Error(`Missing fake pull request ${number}`);
    return structuredClone(item);
  }
  async getPullRequestDiff(): Promise<string> { return "fake diff"; }
  async getPullRequestDiscussion(): Promise<string[]> { return []; }
  async searchCommits(_repository: RepositoryRef, options: SearchOptions): Promise<CommitRecord[]> {
    return this.fixture.commits.filter((item) => matches([item.message, ...(item.files ?? [])], options.query));
  }
  async getCommit(_repository: RepositoryRef, sha: string): Promise<CommitRecord> {
    const item = this.fixture.commits.find((candidate) => candidate.sha === sha);
    if (!item) throw new Error(`Missing fake commit ${sha}`);
    return structuredClone(item);
  }
  async getCommitDiff(): Promise<string> { return "fake commit diff"; }
  async createIssue(repository: RepositoryRef, input: { title: string; body: string; labels: string[] }): Promise<IssueRecord> {
    if (this.fixture.writeAllowed === false) throw new Error("GitHub Issues write permission is unavailable.");
    this.createCalls += 1;
    const issue: IssueRecord = {
      number: Math.max(0, ...this.fixture.issues.map((item) => item.number)) + 1,
      title: input.title, body: input.body, labels: input.labels, state: "open",
      url: `https://github.com/${repository.fullName}/issues/${Math.max(0, ...this.fixture.issues.map((item) => item.number)) + 1}`,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), comments: [],
    };
    this.fixture.issues.push(issue);
    if (this.fixture.createTimeoutAfterWrite && this.createCalls === 1) throw new Error("Issue creation timed out");
    return structuredClone(issue);
  }
  async addLabels(): Promise<void> { this.labelCalls += 1; }
}

function matches(values: string[], query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 2 && !term.includes(":"));
  if (!terms.length) return true;
  const haystack = values.join(" ").toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

