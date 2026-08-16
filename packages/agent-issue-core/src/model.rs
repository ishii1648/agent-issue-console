use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum IntakeState {
    Understanding,
    Investigating,
    NeedsInput,
    Validating,
    CreatingIssue,
    Completed,
    ResolvedWithoutIssue,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Disposition {
    CreateIssue,
    Duplicate,
    AlreadyImplemented,
    InProgress,
    NotSubstantiated,
    OutOfScope,
    Blocked,
    NeedsInput,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceKind {
    Repository,
    Code,
    Issue,
    PullRequest,
    Commit,
    Ui,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryRef {
    pub owner: String,
    pub name: String,
    pub full_name: String,
}

impl RepositoryRef {
    pub fn parse(value: &str) -> Result<Self, String> {
        let trimmed = value.trim();
        let mut parts = trimmed.split('/');
        let owner = parts.next().unwrap_or_default();
        let name = parts.next().unwrap_or_default();
        if parts.next().is_some() || !valid_repo_part(owner) || !valid_repo_part(name) {
            return Err("Repositoryはowner/name形式で指定してください。".into());
        }
        Ok(Self {
            owner: owner.into(),
            name: name.into(),
            full_name: format!("{owner}/{name}"),
        })
    }
}

fn valid_repo_part(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b'-'))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StatusLabels {
    pub ready: String,
    pub running: String,
    pub needs_input: String,
    pub failed: String,
    pub done: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryPolicy {
    pub repository: String,
    pub validation_label: String,
    pub queue_label: String,
    pub auto_queue_after_create: bool,
    pub status_labels: StatusLabels,
    #[serde(default)]
    pub preview_url: Option<String>,
    #[serde(default)]
    pub preview_hostname_allowlist: Vec<String>,
    pub require_visual_evidence_for_ui: bool,
    #[serde(default)]
    pub dry_run: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Viewport {
    pub width: u16,
    pub height: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VisualArtifact {
    pub mime_type: String,
    pub base64: String,
    pub viewport: Viewport,
    pub environment: String,
    pub requested_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Evidence {
    pub id: String,
    pub kind: EvidenceKind,
    pub source: String,
    pub summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub excerpt: Option<String>,
    pub captured_at: String,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub metadata: BTreeMap<String, serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visual: Option<VisualArtifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ValidationDecision {
    pub disposition: Disposition,
    pub summary: String,
    #[serde(default)]
    pub issue_title: Option<String>,
    #[serde(default)]
    pub problem: Option<String>,
    #[serde(default)]
    pub current_behavior: Option<String>,
    #[serde(default)]
    pub expected_behavior: Option<String>,
    #[serde(default)]
    pub completion_criteria: Vec<String>,
    #[serde(default)]
    pub non_goals: Vec<String>,
    #[serde(default)]
    pub question: Option<String>,
    #[serde(default)]
    pub related_identifiers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IssueReference {
    pub number: u64,
    pub url: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IntakeSnapshot {
    pub id: String,
    pub owner_id: String,
    pub repository: RepositoryRef,
    pub request: String,
    pub normalized_request: String,
    pub state: IntakeState,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub default_branch_sha: Option<String>,
    #[serde(default)]
    pub evidence: Vec<Evidence>,
    #[serde(default)]
    pub question: Option<String>,
    #[serde(default)]
    pub answer: Option<String>,
    #[serde(default)]
    pub fingerprint: Option<String>,
    #[serde(default)]
    pub decision: Option<ValidationDecision>,
    #[serde(default)]
    pub issue: Option<IssueReference>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub audit_events: Vec<AuditEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuditEvent {
    pub actor_id: String,
    pub action: String,
    pub outcome: String,
    pub resource: String,
    pub occurred_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryMetadata {
    pub repository: RepositoryRef,
    pub default_branch: String,
    pub default_branch_sha: String,
    #[serde(default)]
    pub description: Option<String>,
    pub permissions: RepositoryPermissions,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryPermissions {
    pub read: bool,
    pub issues_write: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommentRecord {
    pub id: String,
    pub author: String,
    pub body: String,
    pub created_at: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IssueRecord {
    pub number: u64,
    pub title: String,
    pub body: String,
    pub state: String,
    pub url: String,
    pub labels: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub comments: Vec<CommentRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestRecord {
    pub number: u64,
    pub title: String,
    pub body: String,
    pub state: String,
    pub url: String,
    pub draft: bool,
    pub updated_at: String,
    pub check_state: String,
    #[serde(default)]
    pub linked_issue_numbers: Vec<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitRecord {
    pub sha: String,
    pub message: String,
    pub url: String,
    pub committed_at: String,
    #[serde(default)]
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodeMatch {
    pub path: String,
    pub sha: String,
    pub excerpt: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VisualEvidence {
    pub requested_url: String,
    pub final_url: String,
    pub environment: String,
    pub title: String,
    pub main_text: String,
    pub accessibility: String,
    pub screenshot: String,
    pub viewport: Viewport,
    pub captured_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MonitorStatus {
    Ready,
    Running,
    NeedsInput,
    Failed,
    Done,
    Unqueued,
}

impl MonitorStatus {
    pub fn key(&self) -> &'static str {
        match self {
            Self::Ready => "ready",
            Self::Running => "running",
            Self::NeedsInput => "needs_input",
            Self::Failed => "failed",
            Self::Done => "done",
            Self::Unqueued => "unqueued",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleMetadata {
    #[serde(default)]
    pub fingerprint: Option<String>,
    #[serde(default)]
    pub default_branch_sha: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MonitorItem {
    pub issue: IssueRecord,
    pub repository: String,
    pub status: MonitorStatus,
    pub related_pull_requests: Vec<PullRequestRecord>,
    #[serde(default)]
    pub pending_question: Option<String>,
    #[serde(default)]
    pub console_metadata: Option<ConsoleMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MonitorSnapshot {
    pub counts: BTreeMap<String, u64>,
    pub items: Vec<MonitorItem>,
    pub recent_issues: Vec<IssueRecord>,
    pub recent_pull_requests: Vec<PullRequestRecord>,
    pub refreshed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MonitorSummary {
    pub ready: u64,
    pub running: u64,
    pub needs_input: u64,
    pub failed: u64,
    pub done: u64,
    pub unqueued: u64,
    pub refreshed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IntakeEvidenceResult {
    pub kind: EvidenceKind,
    pub source: String,
    pub summary: String,
    pub captured_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub screenshot_data_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IntakeResult {
    pub id: String,
    pub repository: String,
    pub request: String,
    pub state: IntakeState,
    pub updated_at: String,
    #[serde(default)]
    pub disposition: Option<Disposition>,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub question: Option<String>,
    #[serde(default)]
    pub issue_url: Option<String>,
    pub evidence_count: usize,
    pub evidence: Vec<IntakeEvidenceResult>,
}

impl From<&IntakeSnapshot> for IntakeResult {
    fn from(value: &IntakeSnapshot) -> Self {
        Self {
            id: value.id.clone(),
            repository: value.repository.full_name.clone(),
            request: value.request.clone(),
            state: value.state.clone(),
            updated_at: value.updated_at.clone(),
            disposition: value.decision.as_ref().map(|item| item.disposition.clone()),
            summary: value.decision.as_ref().map(|item| item.summary.clone()),
            question: value.question.clone(),
            issue_url: value.issue.as_ref().map(|item| item.url.clone()),
            evidence_count: value.evidence.len(),
            evidence: value
                .evidence
                .iter()
                .map(|item| IntakeEvidenceResult {
                    kind: item.kind.clone(),
                    source: item.source.clone(),
                    summary: item.summary.clone(),
                    captured_at: item.captured_at.clone(),
                    screenshot_data_url: item.visual.as_ref().and_then(|visual| {
                        (!visual.base64.is_empty())
                            .then(|| format!("data:{};base64,{}", visual.mime_type, visual.base64))
                    }),
                })
                .collect(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitIntakeRequest {
    pub request: String,
    #[serde(default)]
    pub repository: Option<String>,
    #[serde(default)]
    pub ui_related: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerIntakeRequest {
    pub answer: String,
    #[serde(default)]
    pub ui_related: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repositoryはowner_name形式だけを受け入れる() {
        assert_eq!(
            RepositoryRef::parse("owner/repo").unwrap().full_name,
            "owner/repo"
        );
        assert!(RepositoryRef::parse("owner/repo/extra").is_err());
        assert!(RepositoryRef::parse("https://github.com/owner/repo").is_err());
    }
}
