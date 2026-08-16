use crate::model::*;
use async_trait::async_trait;

#[derive(Debug, Clone)]
pub struct SearchOptions {
    pub query: String,
    pub limit: usize,
}

#[async_trait(?Send)]
#[allow(dead_code)]
pub trait GitHubPort {
    async fn get_repository(
        &self,
        repository: &RepositoryRef,
    ) -> Result<RepositoryMetadata, String>;
    async fn list_tree(
        &self,
        repository: &RepositoryRef,
        reference: &str,
        path: Option<&str>,
    ) -> Result<Vec<String>, String>;
    async fn get_file(
        &self,
        repository: &RepositoryRef,
        reference: &str,
        path: &str,
    ) -> Result<String, String>;
    async fn search_code(
        &self,
        repository: &RepositoryRef,
        options: SearchOptions,
    ) -> Result<Vec<CodeMatch>, String>;
    async fn search_issues(
        &self,
        repository: &RepositoryRef,
        options: SearchOptions,
    ) -> Result<Vec<IssueRecord>, String>;
    async fn get_issue(
        &self,
        repository: &RepositoryRef,
        number: u64,
    ) -> Result<IssueRecord, String>;
    async fn get_issue_comments(
        &self,
        repository: &RepositoryRef,
        number: u64,
    ) -> Result<Vec<CommentRecord>, String>;
    async fn search_pull_requests(
        &self,
        repository: &RepositoryRef,
        options: SearchOptions,
    ) -> Result<Vec<PullRequestRecord>, String>;
    async fn get_pull_request(
        &self,
        repository: &RepositoryRef,
        number: u64,
    ) -> Result<PullRequestRecord, String>;
    async fn get_pull_request_diff(
        &self,
        repository: &RepositoryRef,
        number: u64,
    ) -> Result<String, String>;
    async fn get_pull_request_discussion(
        &self,
        repository: &RepositoryRef,
        number: u64,
    ) -> Result<Vec<String>, String>;
    async fn search_commits(
        &self,
        repository: &RepositoryRef,
        options: SearchOptions,
    ) -> Result<Vec<CommitRecord>, String>;
    async fn get_commit(
        &self,
        repository: &RepositoryRef,
        sha: &str,
    ) -> Result<CommitRecord, String>;
    async fn get_commit_diff(
        &self,
        repository: &RepositoryRef,
        sha: &str,
    ) -> Result<String, String>;
    async fn create_issue(
        &self,
        repository: &RepositoryRef,
        title: &str,
        body: &str,
        labels: &[String],
    ) -> Result<IssueRecord, String>;
    async fn add_labels(
        &self,
        repository: &RepositoryRef,
        issue_number: u64,
        labels: &[String],
    ) -> Result<(), String>;
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageModelInput {
    pub request: String,
    pub repository: String,
    pub default_branch_sha: String,
    pub evidence: Vec<LanguageModelEvidence>,
    pub previous_question: Option<String>,
    pub answer: Option<String>,
    pub max_context_characters: usize,
    pub max_output_characters: usize,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageModelEvidence {
    pub kind: String,
    pub source: String,
    pub summary: String,
    pub excerpt: Option<String>,
}

#[async_trait(?Send)]
pub trait LanguageModel {
    async fn decide(&self, input: LanguageModelInput) -> Result<ValidationDecision, String>;
}

#[async_trait(?Send)]
pub trait BrowserPort {
    async fn capture(
        &self,
        url: &str,
        environment: &str,
        viewport: Viewport,
    ) -> Result<VisualEvidence, String>;
}

#[async_trait(?Send)]
pub trait IntakeStore {
    async fn get(&self, id: &str) -> Result<Option<IntakeSnapshot>, String>;
    async fn put(&self, intake: &IntakeSnapshot) -> Result<(), String>;
    async fn list(&self) -> Result<Vec<IntakeSnapshot>, String>;
}

pub trait Clock {
    fn now(&self) -> String;
}

pub trait IdGenerator {
    fn next(&self, owner_id: &str, request: &str) -> String;
}
