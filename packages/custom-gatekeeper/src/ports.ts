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

export interface SearchOptions {
  query: string;
  limit?: number;
}

export interface GitHubPort {
  getRepository(repository: RepositoryRef): Promise<RepositoryMetadata>;
  listTree(repository: RepositoryRef, ref: string, path?: string): Promise<string[]>;
  getFile(repository: RepositoryRef, ref: string, path: string): Promise<string>;
  searchCode(repository: RepositoryRef, options: SearchOptions): Promise<CodeMatch[]>;
  searchIssues(repository: RepositoryRef, options: SearchOptions): Promise<IssueRecord[]>;
  getIssue(repository: RepositoryRef, number: number): Promise<IssueRecord>;
  getIssueComments(repository: RepositoryRef, number: number): Promise<IssueRecord["comments"]>;
  searchPullRequests(repository: RepositoryRef, options: SearchOptions): Promise<PullRequestRecord[]>;
  getPullRequest(repository: RepositoryRef, number: number): Promise<PullRequestRecord>;
  getPullRequestDiff(repository: RepositoryRef, number: number): Promise<string>;
  getPullRequestDiscussion(repository: RepositoryRef, number: number): Promise<string[]>;
  searchCommits(repository: RepositoryRef, options: SearchOptions): Promise<CommitRecord[]>;
  getCommit(repository: RepositoryRef, sha: string): Promise<CommitRecord>;
  getCommitDiff(repository: RepositoryRef, sha: string): Promise<string>;
  createIssue(repository: RepositoryRef, input: { title: string; body: string; labels: string[] }): Promise<IssueRecord>;
  addLabels(repository: RepositoryRef, issueNumber: number, labels: string[]): Promise<void>;
}

export interface LanguageModelInput {
  request: string;
  repository: string;
  defaultBranchSha: string;
  evidence: Array<{ kind: string; source: string; summary: string; excerpt?: string }>;
  previousQuestion?: string;
  answer?: string;
  limits: { maxContextCharacters: number; maxOutputCharacters: number };
}

export interface LanguageModel {
  decide(input: LanguageModelInput): Promise<ValidationDecision>;
}

export interface BrowserPort {
  capture(url: string, options: { environment: string; width: number; height: number }): Promise<VisualEvidence>;
}

export interface IntakeStore {
  get(id: string): Promise<IntakeSnapshot | undefined>;
  put(intake: IntakeSnapshot): Promise<void>;
  list(): Promise<IntakeSnapshot[]>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

