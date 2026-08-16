use crate::model::*;
use crate::ports::*;
use crate::security::{UNTRUSTED_EVIDENCE_PREAMBLE, contains_potential_secret, redact_secrets};
use async_trait::async_trait;
use base64::Engine;
use serde::Deserialize;
use serde::de::DeserializeOwned;
use std::collections::HashSet;
use std::time::Duration;
use url::form_urlencoded::byte_serialize;
use worker::*;

fn encode(value: &str) -> String {
    byte_serialize(value.as_bytes()).collect()
}

fn outbound_request(
    url: &str,
    method: Method,
    headers: &[(&str, &str)],
    body: Option<&str>,
) -> std::result::Result<Request, String> {
    let request_headers = Headers::new();
    for (name, value) in headers {
        request_headers
            .set(name, value)
            .map_err(|error| error.to_string())?;
    }
    let mut init = RequestInit::new();
    init.with_method(method).with_headers(request_headers);
    if let Some(body) = body {
        init.with_body(Some(worker::wasm_bindgen::JsValue::from_str(body)));
    }
    Request::new_with_init(url, &init).map_err(|error| error.to_string())
}

async fn send(request: Request, timeout_ms: u64) -> std::result::Result<Response, String> {
    let timeout = timeout_ms.min(u32::MAX as u64) as u32;
    let signal = worker::AbortSignal::from(web_sys::AbortSignal::timeout_with_u32(timeout));
    Fetch::Request(request)
        .send_with_signal(&signal)
        .await
        .map_err(|error| redact_secrets(&error.to_string()))
}

#[derive(Clone)]
pub struct GitHubClient {
    token: String,
    repositories: HashSet<String>,
    labels: HashSet<String>,
    retries: u8,
    timeout_ms: u64,
    base_url: String,
}

impl GitHubClient {
    pub fn new(
        token: String,
        repositories: Vec<String>,
        labels: Vec<String>,
        timeout_ms: u64,
        retries: u8,
    ) -> Self {
        Self {
            token,
            repositories: repositories
                .into_iter()
                .map(|value| value.to_lowercase())
                .collect(),
            labels: labels
                .into_iter()
                .map(|value| value.to_lowercase())
                .collect(),
            retries,
            timeout_ms,
            base_url: "https://api.github.com".into(),
        }
    }

    fn assert_repository(&self, repository: &RepositoryRef) -> std::result::Result<(), String> {
        self.repositories
            .contains(&repository.full_name.to_lowercase())
            .then_some(())
            .ok_or_else(|| {
                format!(
                    "Repository {} はallowlistに含まれていません。",
                    repository.full_name
                )
            })
    }

    fn assert_labels(&self, labels: &[String]) -> std::result::Result<(), String> {
        if labels
            .iter()
            .any(|label| !self.labels.contains(&label.to_lowercase()))
        {
            Err("要求されたlabelはrepository policyで許可されていません。".into())
        } else {
            Ok(())
        }
    }

    async fn request<T: DeserializeOwned>(
        &self,
        repository: &RepositoryRef,
        path: &str,
        method: Method,
        body: Option<&str>,
        accept: &str,
        retry_write: bool,
    ) -> std::result::Result<T, String> {
        let mut response = self
            .perform(repository, path, method, body, accept, retry_write)
            .await?;
        response
            .json()
            .await
            .map_err(|error| format!("GitHub response JSONが不正です: {error}"))
    }

    #[allow(dead_code)]
    async fn request_text(
        &self,
        repository: &RepositoryRef,
        path: &str,
        accept: &str,
    ) -> std::result::Result<String, String> {
        let mut response = self
            .perform(repository, path, Method::Get, None, accept, false)
            .await?;
        response.text().await.map_err(|error| error.to_string())
    }

    async fn perform(
        &self,
        repository: &RepositoryRef,
        path: &str,
        method: Method,
        body: Option<&str>,
        accept: &str,
        retry_write: bool,
    ) -> std::result::Result<Response, String> {
        self.assert_repository(repository)?;
        let attempts = if method == Method::Get || retry_write {
            self.retries + 1
        } else {
            1
        };
        let mut last = "GitHub request failed.".to_string();
        for attempt in 0..attempts {
            let request = outbound_request(
                &format!("{}{}", self.base_url, path),
                method.clone(),
                &[
                    ("accept", accept),
                    ("authorization", &format!("Bearer {}", self.token)),
                    ("content-type", "application/json"),
                    ("user-agent", "agent-issue-console"),
                    ("x-github-api-version", "2022-11-28"),
                ],
                body,
            )?;
            match send(request, self.timeout_ms).await {
                Ok(response) if (200..300).contains(&response.status_code()) => {
                    return Ok(response);
                }
                Ok(response) => {
                    let status = response.status_code();
                    last = format!("GitHub request failed with HTTP {status}.");
                    if !matches!(status, 429 | 502 | 503 | 504) {
                        break;
                    }
                }
                Err(error) => last = error,
            }
            if attempt + 1 < attempts {
                Delay::from(Duration::from_millis(100 * 2_u64.pow(attempt.into()))).await;
            }
        }
        Err(redact_secrets(&last))
    }
}

#[derive(Deserialize)]
struct RepoResponse {
    default_branch: String,
    description: Option<String>,
    permissions: Option<RepoPermissions>,
}

#[derive(Deserialize)]
struct RepoPermissions {
    push: Option<bool>,
    triage: Option<bool>,
}

#[derive(Deserialize)]
struct BranchResponse {
    commit: BranchCommit,
}

#[derive(Deserialize)]
struct BranchCommit {
    sha: String,
}

#[derive(Deserialize)]
struct SearchResponse<T> {
    items: Vec<T>,
}

#[derive(Deserialize)]
struct GitHubIssue {
    number: u64,
    title: String,
    body: Option<String>,
    state: String,
    html_url: String,
    labels: Vec<GitHubLabel>,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum GitHubLabel {
    Name(String),
    Object { name: Option<String> },
}

#[derive(Deserialize)]
struct GitHubComment {
    id: u64,
    user: GitHubUser,
    body: String,
    created_at: String,
    html_url: String,
}

#[derive(Deserialize)]
struct GitHubUser {
    login: String,
}

#[derive(Deserialize)]
struct GitHubPull {
    number: u64,
    title: String,
    body: Option<String>,
    state: String,
    html_url: String,
    draft: bool,
    merged_at: Option<String>,
    updated_at: String,
    head: GitHubHead,
}

#[derive(Deserialize)]
struct GitHubHead {
    sha: String,
}

#[derive(Deserialize)]
struct CheckRuns {
    check_runs: Vec<CheckRun>,
}

#[derive(Deserialize)]
struct CheckRun {
    status: String,
    conclusion: Option<String>,
}

#[derive(Deserialize)]
struct GitHubCommit {
    sha: String,
    html_url: String,
    commit: GitHubCommitValue,
    #[serde(default)]
    files: Vec<GitHubFile>,
}

#[derive(Deserialize)]
struct GitHubCommitValue {
    message: String,
    author: Option<GitHubCommitAuthor>,
}

#[derive(Deserialize)]
struct GitHubCommitAuthor {
    date: Option<String>,
}

#[derive(Deserialize)]
struct GitHubFile {
    filename: String,
}

#[derive(Deserialize)]
struct GitHubCode {
    path: String,
    sha: String,
    html_url: String,
    #[serde(default)]
    text_matches: Vec<TextMatch>,
}

#[derive(Deserialize)]
struct TextMatch {
    fragment: String,
}

fn map_issue(item: GitHubIssue) -> IssueRecord {
    IssueRecord {
        number: item.number,
        title: item.title,
        body: redact_secrets(item.body.as_deref().unwrap_or_default()),
        state: item.state,
        url: item.html_url,
        labels: item
            .labels
            .into_iter()
            .filter_map(|label| match label {
                GitHubLabel::Name(name) => Some(name),
                GitHubLabel::Object { name } => name,
            })
            .collect(),
        created_at: item.created_at,
        updated_at: item.updated_at,
        comments: vec![],
    }
}

fn map_commit(item: GitHubCommit) -> CommitRecord {
    CommitRecord {
        sha: item.sha,
        message: redact_secrets(&item.commit.message),
        url: item.html_url,
        committed_at: item
            .commit
            .author
            .and_then(|author| author.date)
            .unwrap_or_else(|| "1970-01-01T00:00:00Z".into()),
        files: item.files.into_iter().map(|file| file.filename).collect(),
    }
}

fn issue_references(value: &str) -> Vec<u64> {
    regex::Regex::new(r"(?i)(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)?\s*#(\d+)")
        .expect("固定Issue reference patternは有効")
        .captures_iter(value)
        .filter_map(|capture| capture[1].parse().ok())
        .collect()
}

#[async_trait(?Send)]
impl GitHubPort for GitHubClient {
    async fn get_repository(
        &self,
        repository: &RepositoryRef,
    ) -> std::result::Result<RepositoryMetadata, String> {
        let repo: RepoResponse = self
            .request(
                repository,
                &format!("/repos/{}", repository.full_name),
                Method::Get,
                None,
                "application/vnd.github+json",
                false,
            )
            .await?;
        let branch: BranchResponse = self
            .request(
                repository,
                &format!(
                    "/repos/{}/branches/{}",
                    repository.full_name,
                    encode(&repo.default_branch)
                ),
                Method::Get,
                None,
                "application/vnd.github+json",
                false,
            )
            .await?;
        Ok(RepositoryMetadata {
            repository: repository.clone(),
            default_branch: repo.default_branch,
            default_branch_sha: branch.commit.sha,
            description: repo.description,
            permissions: RepositoryPermissions {
                read: true,
                issues_write: repo.permissions.is_some_and(|permissions| {
                    permissions.push.unwrap_or(false) || permissions.triage.unwrap_or(false)
                }),
            },
        })
    }

    async fn list_tree(
        &self,
        repository: &RepositoryRef,
        reference: &str,
        path: Option<&str>,
    ) -> std::result::Result<Vec<String>, String> {
        #[derive(Deserialize)]
        struct Tree {
            tree: Vec<TreeItem>,
        }
        #[derive(Deserialize)]
        struct TreeItem {
            path: String,
        }
        let result: Tree = self
            .request(
                repository,
                &format!(
                    "/repos/{}/git/trees/{}?recursive=1",
                    repository.full_name,
                    encode(reference)
                ),
                Method::Get,
                None,
                "application/vnd.github+json",
                false,
            )
            .await?;
        Ok(result
            .tree
            .into_iter()
            .map(|item| item.path)
            .filter(|item| path.is_none_or(|prefix| item.starts_with(prefix)))
            .collect())
    }

    async fn get_file(
        &self,
        repository: &RepositoryRef,
        reference: &str,
        path: &str,
    ) -> std::result::Result<String, String> {
        #[derive(Deserialize)]
        struct Content {
            content: Option<String>,
            encoding: Option<String>,
        }
        let encoded_path = path.split('/').map(encode).collect::<Vec<_>>().join("/");
        let result: Content = self
            .request(
                repository,
                &format!(
                    "/repos/{}/contents/{}?ref={}",
                    repository.full_name,
                    encoded_path,
                    encode(reference)
                ),
                Method::Get,
                None,
                "application/vnd.github+json",
                false,
            )
            .await?;
        if result.encoding.as_deref() != Some("base64") {
            return Err("GitHub file responseがbase64ではありません。".into());
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(result.content.unwrap_or_default().replace('\n', ""))
            .map_err(|error| error.to_string())?;
        String::from_utf8(bytes).map_err(|_| "GitHub file contentがUTF-8ではありません。".into())
    }

    async fn search_code(
        &self,
        repository: &RepositoryRef,
        options: SearchOptions,
    ) -> std::result::Result<Vec<CodeMatch>, String> {
        let result: SearchResponse<GitHubCode> = self
            .request(
                repository,
                &format!(
                    "/search/code?q={}&per_page={}",
                    encode(&format!("{} repo:{}", options.query, repository.full_name)),
                    options.limit
                ),
                Method::Get,
                None,
                "application/vnd.github.text-match+json",
                false,
            )
            .await?;
        Ok(result
            .items
            .into_iter()
            .map(|item| CodeMatch {
                path: item.path,
                sha: item.sha,
                url: item.html_url,
                excerpt: redact_secrets(
                    &item
                        .text_matches
                        .into_iter()
                        .map(|value| value.fragment)
                        .collect::<Vec<_>>()
                        .join("\n"),
                ),
            })
            .collect())
    }

    async fn search_issues(
        &self,
        repository: &RepositoryRef,
        options: SearchOptions,
    ) -> std::result::Result<Vec<IssueRecord>, String> {
        let result: SearchResponse<GitHubIssue> = self
            .request(
                repository,
                &format!(
                    "/search/issues?q={}&per_page={}",
                    encode(&format!(
                        "{} repo:{} is:issue",
                        options.query, repository.full_name
                    )),
                    options.limit
                ),
                Method::Get,
                None,
                "application/vnd.github+json",
                false,
            )
            .await?;
        Ok(result.items.into_iter().map(map_issue).collect())
    }

    async fn get_issue(
        &self,
        repository: &RepositoryRef,
        number: u64,
    ) -> std::result::Result<IssueRecord, String> {
        Ok(map_issue(
            self.request(
                repository,
                &format!("/repos/{}/issues/{number}", repository.full_name),
                Method::Get,
                None,
                "application/vnd.github+json",
                false,
            )
            .await?,
        ))
    }

    async fn get_issue_comments(
        &self,
        repository: &RepositoryRef,
        number: u64,
    ) -> std::result::Result<Vec<CommentRecord>, String> {
        let values: Vec<GitHubComment> = self
            .request(
                repository,
                &format!(
                    "/repos/{}/issues/{number}/comments?per_page=30",
                    repository.full_name
                ),
                Method::Get,
                None,
                "application/vnd.github+json",
                false,
            )
            .await?;
        Ok(values
            .into_iter()
            .map(|item| CommentRecord {
                id: item.id.to_string(),
                author: item.user.login,
                body: redact_secrets(&item.body),
                created_at: item.created_at,
                url: item.html_url,
            })
            .collect())
    }

    async fn search_pull_requests(
        &self,
        repository: &RepositoryRef,
        options: SearchOptions,
    ) -> std::result::Result<Vec<PullRequestRecord>, String> {
        let result: SearchResponse<GitHubIssue> = self
            .request(
                repository,
                &format!(
                    "/search/issues?q={}&per_page={}",
                    encode(&format!(
                        "{} repo:{} is:pr",
                        options.query, repository.full_name
                    )),
                    options.limit
                ),
                Method::Get,
                None,
                "application/vnd.github+json",
                false,
            )
            .await?;
        let mut pulls = Vec::new();
        for item in result.items {
            pulls.push(self.get_pull_request(repository, item.number).await?);
        }
        Ok(pulls)
    }

    async fn get_pull_request(
        &self,
        repository: &RepositoryRef,
        number: u64,
    ) -> std::result::Result<PullRequestRecord, String> {
        let pull: GitHubPull = self
            .request(
                repository,
                &format!("/repos/{}/pulls/{number}", repository.full_name),
                Method::Get,
                None,
                "application/vnd.github+json",
                false,
            )
            .await?;
        let checks: std::result::Result<CheckRuns, String> = self
            .request(
                repository,
                &format!(
                    "/repos/{}/commits/{}/check-runs?per_page=100",
                    repository.full_name,
                    encode(&pull.head.sha)
                ),
                Method::Get,
                None,
                "application/vnd.github+json",
                false,
            )
            .await;
        let check_state = checks
            .map(|checks| {
                if checks
                    .check_runs
                    .iter()
                    .any(|check| check.status != "completed")
                {
                    "pending"
                } else if checks.check_runs.iter().any(|check| {
                    !matches!(
                        check.conclusion.as_deref(),
                        Some("success" | "neutral" | "skipped")
                    )
                }) {
                    "failure"
                } else if checks.check_runs.is_empty() {
                    "unknown"
                } else {
                    "success"
                }
            })
            .unwrap_or("unknown")
            .to_string();
        let body = redact_secrets(pull.body.as_deref().unwrap_or_default());
        Ok(PullRequestRecord {
            number: pull.number,
            title: pull.title.clone(),
            body: body.clone(),
            state: if pull.merged_at.is_some() {
                "merged".into()
            } else {
                pull.state
            },
            url: pull.html_url,
            draft: pull.draft,
            updated_at: pull.updated_at,
            check_state,
            linked_issue_numbers: issue_references(&format!("{}\n{}", pull.title, body)),
        })
    }

    async fn get_pull_request_diff(
        &self,
        repository: &RepositoryRef,
        number: u64,
    ) -> std::result::Result<String, String> {
        self.request_text(
            repository,
            &format!("/repos/{}/pulls/{number}", repository.full_name),
            "application/vnd.github.diff",
        )
        .await
    }

    async fn get_pull_request_discussion(
        &self,
        repository: &RepositoryRef,
        number: u64,
    ) -> std::result::Result<Vec<String>, String> {
        #[derive(Deserialize)]
        struct Body {
            body: Option<String>,
        }
        let reviews: Vec<Body> = self
            .request(
                repository,
                &format!(
                    "/repos/{}/pulls/{number}/reviews?per_page=100",
                    repository.full_name
                ),
                Method::Get,
                None,
                "application/vnd.github+json",
                false,
            )
            .await?;
        let comments: Vec<Body> = self
            .request(
                repository,
                &format!(
                    "/repos/{}/pulls/{number}/comments?per_page=100",
                    repository.full_name
                ),
                Method::Get,
                None,
                "application/vnd.github+json",
                false,
            )
            .await?;
        Ok(reviews
            .into_iter()
            .chain(comments)
            .map(|item| redact_secrets(item.body.as_deref().unwrap_or_default()))
            .collect())
    }

    async fn search_commits(
        &self,
        repository: &RepositoryRef,
        options: SearchOptions,
    ) -> std::result::Result<Vec<CommitRecord>, String> {
        let result: SearchResponse<GitHubCommit> = self
            .request(
                repository,
                &format!(
                    "/search/commits?q={}&per_page={}",
                    encode(&format!("{} repo:{}", options.query, repository.full_name)),
                    options.limit
                ),
                Method::Get,
                None,
                "application/vnd.github+json",
                false,
            )
            .await?;
        Ok(result.items.into_iter().map(map_commit).collect())
    }

    async fn get_commit(
        &self,
        repository: &RepositoryRef,
        sha: &str,
    ) -> std::result::Result<CommitRecord, String> {
        Ok(map_commit(
            self.request(
                repository,
                &format!("/repos/{}/commits/{}", repository.full_name, encode(sha)),
                Method::Get,
                None,
                "application/vnd.github+json",
                false,
            )
            .await?,
        ))
    }
    async fn get_commit_diff(
        &self,
        repository: &RepositoryRef,
        sha: &str,
    ) -> std::result::Result<String, String> {
        self.request_text(
            repository,
            &format!("/repos/{}/commits/{}", repository.full_name, encode(sha)),
            "application/vnd.github.diff",
        )
        .await
    }

    async fn create_issue(
        &self,
        repository: &RepositoryRef,
        title: &str,
        body: &str,
        labels: &[String],
    ) -> std::result::Result<IssueRecord, String> {
        self.assert_labels(labels)?;
        let payload =
            serde_json::json!({ "title": title, "body": body, "labels": labels }).to_string();
        Ok(map_issue(
            self.request(
                repository,
                &format!("/repos/{}/issues", repository.full_name),
                Method::Post,
                Some(&payload),
                "application/vnd.github+json",
                false,
            )
            .await?,
        ))
    }

    async fn add_labels(
        &self,
        repository: &RepositoryRef,
        issue_number: u64,
        labels: &[String],
    ) -> std::result::Result<(), String> {
        self.assert_labels(labels)?;
        let payload = serde_json::json!({ "labels": labels }).to_string();
        let _: serde_json::Value = self
            .request(
                repository,
                &format!(
                    "/repos/{}/issues/{issue_number}/labels",
                    repository.full_name
                ),
                Method::Post,
                Some(&payload),
                "application/vnd.github+json",
                false,
            )
            .await?;
        Ok(())
    }
}

#[derive(Clone)]
pub struct OpenCodeGoClient {
    pub base_url: String,
    pub model: String,
    pub api_key: String,
    pub retries: u8,
    pub max_output_tokens: usize,
    pub timeout_ms: u64,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}
#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}
#[derive(Deserialize)]
struct ChatMessage {
    content: String,
}

#[async_trait(?Send)]
impl LanguageModel for OpenCodeGoClient {
    async fn decide(
        &self,
        input: LanguageModelInput,
    ) -> std::result::Result<ValidationDecision, String> {
        let mut context = serde_json::to_string(&input).map_err(|error| error.to_string())?;
        context.truncate(input.max_context_characters);
        let system = format!(
            "{UNTRUSTED_EVIDENCE_PREAMBLE}\nJSON objectを一つだけ返すこと。dispositionはcreate_issue、duplicate、already_implemented、in_progress、not_substantiated、out_of_scope、blocked、needs_inputのいずれか。重大なproduct判断または必要なUI観測がない場合だけ質問する。create_issueではissueTitle、problem、currentBehavior、expectedBehavior、completionCriteria、nonGoals、relatedIdentifiersを含める。"
        );
        let payload = serde_json::json!({ "model": self.model, "messages": [{"role":"system","content":system},{"role":"user","content":context}], "max_tokens": self.max_output_tokens, "temperature": 0 }).to_string();
        let mut last = "LLM request failed.".to_string();
        for attempt in 0..=self.retries {
            let request = outbound_request(
                &format!("{}/chat/completions", self.base_url.trim_end_matches('/')),
                Method::Post,
                &[
                    ("authorization", &format!("Bearer {}", self.api_key)),
                    ("content-type", "application/json"),
                ],
                Some(&payload),
            )?;
            match send(request, self.timeout_ms).await {
                Ok(mut response) if (200..300).contains(&response.status_code()) => {
                    let response: ChatResponse =
                        response.json().await.map_err(|error| error.to_string())?;
                    let mut raw = response
                        .choices
                        .first()
                        .map(|choice| choice.message.content.trim().to_string())
                        .filter(|value| !value.is_empty())
                        .ok_or_else(|| "LLMがdecisionを返しませんでした。".to_string())?;
                    raw.truncate(input.max_output_characters);
                    return serde_json::from_str(&redact_secrets(&raw))
                        .map_err(|_| "LLMが不正なdecision JSONを返しました。".into());
                }
                Ok(response) => {
                    last = format!("LLM request failed with HTTP {}.", response.status_code());
                    if response.status_code() < 500 && response.status_code() != 429 {
                        break;
                    }
                }
                Err(error) => last = error,
            }
            if attempt < self.retries {
                Delay::from(Duration::from_millis(100 * 2_u64.pow(attempt.into()))).await;
            }
        }
        Err(redact_secrets(&last))
    }
}

#[derive(Clone)]
pub struct BrowserRenderingClient {
    pub account_id: String,
    pub api_token: String,
    pub timeout_ms: u64,
}

#[derive(Deserialize)]
struct BrowserEnvelope {
    result: BrowserResult,
    #[serde(default)]
    meta: BrowserMeta,
}
#[derive(Default, Deserialize)]
struct BrowserMeta {
    #[serde(default)]
    title: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserResult {
    #[serde(default)]
    screenshot: String,
    #[serde(default)]
    markdown: String,
    #[serde(default)]
    accessibility_tree: serde_json::Value,
    #[serde(default)]
    content: String,
}

fn browser_allow_pattern(url: &str) -> std::result::Result<String, String> {
    let parsed = url::Url::parse(url).map_err(|_| "Browser URLが不正です。".to_string())?;
    let hostname = parsed
        .host_str()
        .ok_or_else(|| "Browser URLにhostnameがありません。".to_string())?;
    Ok(format!(
        r"/^https:\/\/{}(?::443)?(?:\/|$)/",
        regex::escape(hostname)
    ))
}

fn visual_text_is_safe(title: &str, main_text: &str, accessibility: &str) -> bool {
    !contains_potential_secret(&format!("{title}\n{main_text}\n{accessibility}"))
}

#[async_trait(?Send)]
impl BrowserPort for BrowserRenderingClient {
    async fn capture(
        &self,
        url: &str,
        environment: &str,
        viewport: Viewport,
    ) -> std::result::Result<VisualEvidence, String> {
        let allow_pattern = browser_allow_pattern(url)?;
        let payload = serde_json::json!({ "url": url, "formats": ["screenshot", "markdown", "accessibilityTree"], "viewport": {"width": viewport.width, "height": viewport.height, "isMobile": viewport.width < 600, "hasTouch": viewport.width < 600}, "screenshotOptions": {"type":"webp","encoding":"base64","fullPage":true}, "gotoOptions": {"waitUntil":"networkidle2","timeout":self.timeout_ms}, "allowRequestPattern": [allow_pattern] }).to_string();
        let request = outbound_request(
            &format!(
                "https://api.cloudflare.com/client/v4/accounts/{}/browser-rendering/snapshot",
                encode(&self.account_id)
            ),
            Method::Post,
            &[
                ("authorization", &format!("Bearer {}", self.api_token)),
                ("content-type", "application/json"),
            ],
            Some(&payload),
        )?;
        let mut response = send(request, self.timeout_ms).await?;
        if !(200..300).contains(&response.status_code()) {
            return Err(format!(
                "Browser Rendering failed with HTTP {}.",
                response.status_code()
            ));
        }
        let envelope: BrowserEnvelope = response.json().await.map_err(|error| error.to_string())?;
        let result = envelope.result;
        let title = if envelope.meta.title.is_empty() {
            regex::Regex::new(r"(?is)<title[^>]*>([^<]*)</title>")
                .expect("固定title patternは有効")
                .captures(&result.content)
                .map(|capture| capture[1].trim().to_string())
                .unwrap_or_else(|| "Untitled page".into())
        } else {
            envelope.meta.title
        };
        let raw_main_text = if result.markdown.is_empty() {
            &result.content
        } else {
            &result.markdown
        };
        let raw_accessibility = result.accessibility_tree.to_string();
        let main_text = redact_secrets(raw_main_text).chars().take(40_000).collect();
        let accessibility = redact_secrets(&raw_accessibility)
            .chars()
            .take(40_000)
            .collect();
        let screenshot = if visual_text_is_safe(&title, raw_main_text, &raw_accessibility) {
            result.screenshot
        } else {
            String::new()
        };
        Ok(VisualEvidence {
            requested_url: url.into(),
            // Snapshot REST APIはeffective URLを返さない。off-host requestは
            // allowRequestPatternで遮断し、検証済みrequest URLを記録する。
            final_url: url.into(),
            environment: environment.into(),
            title: redact_secrets(&title),
            main_text,
            accessibility,
            screenshot,
            viewport,
            captured_at: Date::now().to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn browser_patternはrequest先hostnameだけを許可する() {
        let pattern = browser_allow_pattern("https://preview.example.com/app").expect("pattern");
        assert!(pattern.contains("preview\\.example\\.com"));
        assert!(pattern.starts_with(r"/^https:\/\/"));
    }

    #[test]
    fn visual_textにsecretがあればscreenshotを保存しない() {
        assert!(!visual_text_is_safe(
            "Preview",
            "token=github_pat_abcdefghijklmnopqrstuvwxyz123456",
            "main"
        ));
    }
}
