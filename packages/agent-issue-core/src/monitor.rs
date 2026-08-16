use crate::issue_body::extract_console_metadata;
use crate::model::*;
use std::collections::BTreeMap;

fn status_for(issue: &IssueRecord, policy: &RepositoryPolicy) -> MonitorStatus {
    let has = |label: &str| {
        issue
            .labels
            .iter()
            .any(|value| value.eq_ignore_ascii_case(label))
    };
    if has(&policy.status_labels.failed) {
        MonitorStatus::Failed
    } else if has(&policy.status_labels.needs_input) {
        MonitorStatus::NeedsInput
    } else if has(&policy.status_labels.running) {
        MonitorStatus::Running
    } else if has(&policy.status_labels.ready) {
        MonitorStatus::Ready
    } else if has(&policy.status_labels.done) || issue.state == "closed" {
        MonitorStatus::Done
    } else {
        MonitorStatus::Unqueued
    }
}

fn pending_question(issue: &IssueRecord) -> Option<String> {
    issue
        .comments
        .iter()
        .rev()
        .find(|comment| {
            let lower = comment.body.to_lowercase();
            comment.body.contains('？')
                || comment.body.contains('?')
                || lower.contains("needs input")
        })
        .map(|comment| comment.body.clone())
}

pub fn build_monitor_snapshot(
    repository: &str,
    policy: &RepositoryPolicy,
    mut issues: Vec<IssueRecord>,
    mut pulls: Vec<PullRequestRecord>,
    refreshed_at: String,
) -> MonitorSnapshot {
    issues.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    pulls.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    let mut counts = BTreeMap::from([
        ("ready".into(), 0),
        ("running".into(), 0),
        ("needs_input".into(), 0),
        ("failed".into(), 0),
        ("done".into(), 0),
        ("unqueued".into(), 0),
    ]);
    let items = issues
        .iter()
        .cloned()
        .map(|issue| {
            let status = status_for(&issue, policy);
            *counts.entry(status.key().into()).or_insert(0) += 1;
            let (fingerprint, default_branch_sha) = extract_console_metadata(&issue.body);
            let related_pull_requests = pulls
                .iter()
                .filter(|pull| pull.linked_issue_numbers.contains(&issue.number))
                .cloned()
                .collect();
            let pending_question = (status == MonitorStatus::NeedsInput)
                .then(|| pending_question(&issue))
                .flatten();
            MonitorItem {
                issue,
                repository: repository.into(),
                status,
                related_pull_requests,
                pending_question,
                console_metadata: (fingerprint.is_some() || default_branch_sha.is_some())
                    .then_some(ConsoleMetadata {
                        fingerprint,
                        default_branch_sha,
                    }),
            }
        })
        .collect();
    MonitorSnapshot {
        counts,
        items,
        recent_issues: issues.into_iter().take(10).collect(),
        recent_pull_requests: pulls.into_iter().take(10).collect(),
        refreshed_at,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn policy() -> RepositoryPolicy {
        RepositoryPolicy {
            repository: "owner/repo".into(),
            validation_label: "validated".into(),
            queue_label: "ready".into(),
            auto_queue_after_create: false,
            status_labels: StatusLabels {
                ready: "ready".into(),
                running: "running".into(),
                needs_input: "needs-input".into(),
                failed: "failed".into(),
                done: "done".into(),
            },
            preview_url: None,
            preview_hostname_allowlist: vec![],
            require_visual_evidence_for_ui: false,
            dry_run: true,
        }
    }

    #[test]
    fn monitorは五状態とunqueuedを分類する() {
        let labels = ["ready", "running", "needs-input", "failed", "done", "other"];
        let issues = labels
            .iter()
            .enumerate()
            .map(|(index, label)| IssueRecord {
                number: index as u64 + 1,
                title: label.to_string(),
                body: String::new(),
                state: "open".into(),
                url: format!("https://github.com/owner/repo/issues/{}", index + 1),
                labels: vec![label.to_string()],
                created_at: "2026-01-01T00:00:00Z".into(),
                updated_at: "2026-01-01T00:00:00Z".into(),
                comments: vec![],
            })
            .collect();
        let snapshot = build_monitor_snapshot(
            "owner/repo",
            &policy(),
            issues,
            vec![],
            "2026-01-01T00:00:00Z".into(),
        );
        assert_eq!(snapshot.counts.values().sum::<u64>(), 6);
        assert_eq!(snapshot.counts["needs_input"], 1);
    }
}
