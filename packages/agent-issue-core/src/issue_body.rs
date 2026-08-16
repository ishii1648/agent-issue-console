use crate::fingerprint::fingerprint_marker;
use crate::model::{Evidence, EvidenceKind, RepositoryRef, ValidationDecision};
use crate::security::redact_secrets;

fn bullets(values: &[String], fallback: &str) -> String {
    if values.is_empty() {
        format!("- {fallback}")
    } else {
        values
            .iter()
            .map(|value| format!("- {value}"))
            .collect::<Vec<_>>()
            .join("\n")
    }
}

pub fn render_issue_body(
    repository: &RepositoryRef,
    request: &str,
    default_branch_sha: &str,
    decision: &ValidationDecision,
    evidence: &[Evidence],
    fingerprint: &str,
) -> String {
    let related = evidence
        .iter()
        .filter(|item| item.kind != EvidenceKind::Ui || item.visual.is_some())
        .map(|item| format!("- {:?}: [{}]({})", item.kind, item.summary, item.source))
        .collect::<Vec<_>>();
    let body = format!(
        "## 問題\n\n{}\n\n## 現在の動作\n\n{}\n\n## 調査結果\n\n- 対象repository: {}\n- 確認したdefault branchのcommit SHA: `{}`\n{}\n\n## 期待する動作\n\n{}\n\n## 完了条件\n\n{}\n\n## 非ゴール\n\n{}\n\n## Agent Issue Console metadata\n\n- Agent Issue Consoleによる調査済み\n- 調査commit: `{}`\n- fingerprint: `{}`\n\n{}",
        decision.problem.as_deref().unwrap_or(request),
        decision
            .current_behavior
            .as_deref()
            .unwrap_or("調査証拠から、期待する動作を満たしていないことを確認した。"),
        repository.full_name,
        default_branch_sha,
        if related.is_empty() {
            "- 関連証拠: 追加の参照なし".into()
        } else {
            related.join("\n")
        },
        decision.expected_behavior.as_deref().unwrap_or(request),
        bullets(
            &decision.completion_criteria,
            "期待する外部動作を自動テストまたは再現可能な手順で確認できる。"
        ),
        bullets(
            &decision.non_goals,
            "関連しない機能や内部構造の全面的な変更。"
        ),
        default_branch_sha,
        fingerprint,
        fingerprint_marker(fingerprint),
    );
    redact_secrets(&body)
}

pub fn extract_console_metadata(body: &str) -> (Option<String>, Option<String>) {
    let fingerprint = regex::Regex::new(r"<!-- agent-issue-console:fingerprint=([a-f0-9]{64}) -->")
        .expect("固定fingerprint patternは有効")
        .captures(body)
        .map(|capture| capture[1].to_string());
    let sha = regex::Regex::new(r"調査commit:\s*`([a-f0-9]{7,64})`")
        .expect("固定SHA patternは有効")
        .captures(body)
        .map(|capture| capture[1].to_string());
    (fingerprint, sha)
}
