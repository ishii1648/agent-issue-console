use crate::fingerprint::{create_fingerprint, fingerprint_marker, normalize_request};
use crate::issue_body::render_issue_body;
use crate::model::*;
use crate::ports::*;
use crate::security::{
    contains_potential_secret, redact_secrets, repository_policy, safe_preview_url,
};
use std::collections::BTreeMap;

pub struct Workflow<'a> {
    pub github: &'a dyn GitHubPort,
    pub llm: &'a dyn LanguageModel,
    pub browser: &'a dyn BrowserPort,
    pub store: &'a dyn IntakeStore,
    pub policies: &'a [RepositoryPolicy],
    pub clock: &'a dyn Clock,
    pub ids: &'a dyn IdGenerator,
    pub max_context_characters: usize,
    pub max_output_characters: usize,
}

impl Workflow<'_> {
    pub async fn submit(
        &self,
        owner_id: &str,
        repository: &str,
        request: &str,
        ui_related: bool,
    ) -> Result<IntakeSnapshot, String> {
        let repository = RepositoryRef::parse(repository)?;
        let policy = repository_policy(&repository, self.policies)?.clone();
        if request.trim().is_empty() {
            return Err("要望を入力してください。".into());
        }
        let safe_request = redact_secrets(request.trim());
        let now = self.clock.now();
        let mut intake = IntakeSnapshot {
            id: self.ids.next(owner_id, request),
            owner_id: owner_id.into(),
            repository,
            request: safe_request.clone(),
            normalized_request: normalize_request(&safe_request),
            state: IntakeState::Understanding,
            created_at: now.clone(),
            updated_at: now,
            default_branch_sha: None,
            evidence: vec![],
            question: None,
            answer: None,
            fingerprint: None,
            decision: None,
            issue: None,
            error: None,
            audit_events: vec![],
        };
        self.save(&mut intake).await?;
        self.investigate(intake, &policy, ui_related, false).await
    }

    pub async fn answer(
        &self,
        id: &str,
        owner_id: &str,
        answer: &str,
        ui_related: bool,
    ) -> Result<IntakeSnapshot, String> {
        let mut intake = self
            .store
            .get(id)
            .await?
            .filter(|item| item.owner_id == owner_id)
            .ok_or_else(|| "Intakeが見つかりません。".to_string())?;
        if intake.state != IntakeState::NeedsInput {
            return Err("このIntakeは回答待ちではありません。".into());
        }
        intake.answer = Some(redact_secrets(answer.trim()));
        intake.question = None;
        intake.state = IntakeState::Investigating;
        self.save(&mut intake).await?;
        let policy = repository_policy(&intake.repository, self.policies)?.clone();
        self.investigate(intake, &policy, ui_related, true).await
    }

    async fn investigate(
        &self,
        mut intake: IntakeSnapshot,
        policy: &RepositoryPolicy,
        ui_related: bool,
        resume: bool,
    ) -> Result<IntakeSnapshot, String> {
        let result = self
            .investigate_inner(&mut intake, policy, ui_related, resume)
            .await;
        match result {
            Ok(()) => Ok(intake),
            Err(error) => {
                intake.state = IntakeState::Failed;
                intake.error = Some(redact_secrets(&error));
                self.save(&mut intake).await?;
                Ok(intake)
            }
        }
    }

    async fn investigate_inner(
        &self,
        intake: &mut IntakeSnapshot,
        policy: &RepositoryPolicy,
        ui_related: bool,
        resume: bool,
    ) -> Result<(), String> {
        intake.state = IntakeState::Investigating;
        self.save(intake).await?;
        let metadata = self.github.get_repository(&intake.repository).await?;
        intake.default_branch_sha = Some(metadata.default_branch_sha.clone());
        self.add_evidence(
            intake,
            EvidenceKind::Repository,
            &format!(
                "https://github.com/{}/tree/{}",
                intake.repository.full_name, metadata.default_branch_sha
            ),
            &format!(
                "Default branch {} at {}.",
                metadata.default_branch, metadata.default_branch_sha
            ),
            None,
        );

        let search = SearchOptions {
            query: intake.normalized_request.clone(),
            limit: 20,
        };
        let code = self
            .github
            .search_code(
                &intake.repository,
                SearchOptions {
                    limit: 10,
                    ..search.clone()
                },
            )
            .await?;
        let issues = self
            .github
            .search_issues(&intake.repository, search.clone())
            .await?;
        let pull_requests = self
            .github
            .search_pull_requests(&intake.repository, search.clone())
            .await?;
        let commits = self
            .github
            .search_commits(&intake.repository, search)
            .await?;

        if !resume {
            for item in &code {
                self.add_evidence(
                    intake,
                    EvidenceKind::Code,
                    &item.url,
                    &format!("Relevant code in {}.", item.path),
                    Some(&item.excerpt),
                );
            }
            for item in &issues {
                self.add_evidence(
                    intake,
                    EvidenceKind::Issue,
                    &item.url,
                    &format!("{} Issue #{}: {}", item.state, item.number, item.title),
                    Some(&item.body),
                );
            }
            for item in &pull_requests {
                self.add_evidence(
                    intake,
                    EvidenceKind::PullRequest,
                    &item.url,
                    &format!("{} PR #{}: {}", item.state, item.number, item.title),
                    Some(&item.body),
                );
            }
            for item in &commits {
                self.add_evidence(
                    intake,
                    EvidenceKind::Commit,
                    &item.url,
                    &format!("{} {}", &item.sha[..item.sha.len().min(12)], item.message),
                    None,
                );
            }
        }

        if ui_related {
            if let Some(preview_url) = &policy.preview_url {
                let preview = safe_preview_url(preview_url, &policy.preview_hostname_allowlist)?;
                let visual = self
                    .browser
                    .capture(
                        preview.as_str(),
                        "preview",
                        Viewport {
                            width: 390,
                            height: 844,
                        },
                    )
                    .await?;
                safe_preview_url(&visual.final_url, &policy.preview_hostname_allowlist)?;
                let evidence_index = intake.evidence.len();
                self.add_evidence(
                    intake,
                    EvidenceKind::Ui,
                    &visual.final_url,
                    &format!(
                        "{}; viewport {}×{}; {}",
                        visual.title,
                        visual.viewport.width,
                        visual.viewport.height,
                        visual.main_text
                    ),
                    Some(&visual.accessibility),
                );
                if !visual.screenshot.is_empty() && intake.evidence.len() > evidence_index {
                    intake.evidence[evidence_index].visual = Some(VisualArtifact {
                        mime_type: "image/webp".into(),
                        base64: visual.screenshot,
                        viewport: visual.viewport,
                        environment: visual.environment,
                        requested_url: visual.requested_url,
                    });
                }
            } else if policy.require_visual_evidence_for_ui && code.is_empty() {
                self.need_input(
                    intake,
                    "現在のUIを確認できるallowlist済みpreview URLまたはscreenshotを提示してください。",
                )
                .await?;
                return Ok(());
            }
        }

        if let Some(issue) = issues.iter().find(|item| {
            item.title.to_lowercase() == intake.normalized_request
                || item
                    .body
                    .to_lowercase()
                    .contains(&intake.normalized_request)
        }) {
            self.resolve(
                intake,
                Disposition::Duplicate,
                &format!("同じ問題を扱うIssue #{}が存在します。", issue.number),
            )
            .await?;
            return Ok(());
        }
        if let Some(pull) = pull_requests.iter().find(|item| item.state == "open") {
            self.resolve(
                intake,
                Disposition::InProgress,
                &format!("Pull Request #{}で対応中です。", pull.number),
            )
            .await?;
            return Ok(());
        }
        if let Some(pull) = pull_requests.iter().find(|item| item.state == "merged") {
            self.resolve(
                intake,
                Disposition::AlreadyImplemented,
                &format!("Pull Request #{}がmerge済みです。", pull.number),
            )
            .await?;
            return Ok(());
        }

        intake.state = IntakeState::Validating;
        self.save(intake).await?;
        let decision = self
            .llm
            .decide(LanguageModelInput {
                request: intake.request.clone(),
                repository: intake.repository.full_name.clone(),
                default_branch_sha: metadata.default_branch_sha.clone(),
                evidence: intake
                    .evidence
                    .iter()
                    .map(|item| LanguageModelEvidence {
                        kind: format!("{:?}", item.kind).to_lowercase(),
                        source: item.source.clone(),
                        summary: item.summary.clone(),
                        excerpt: item.excerpt.clone(),
                    })
                    .collect(),
                previous_question: intake
                    .decision
                    .as_ref()
                    .and_then(|item| item.question.clone()),
                answer: intake.answer.clone(),
                max_context_characters: self.max_context_characters,
                max_output_characters: self.max_output_characters,
            })
            .await?;
        let decision = sanitize_decision(decision)?;
        intake.decision = Some(decision.clone());
        if decision.disposition == Disposition::NeedsInput {
            if intake.answer.is_some() {
                self.resolve(
                    intake,
                    Disposition::Blocked,
                    "回答後も重大な判断を確定できませんでした。",
                )
                .await?;
            } else {
                self.need_input(
                    intake,
                    decision
                        .question
                        .as_deref()
                        .unwrap_or("期待する外部動作を一つ選んでください。"),
                )
                .await?;
            }
            return Ok(());
        }
        if decision.disposition != Disposition::CreateIssue {
            self.resolve(intake, decision.disposition, &decision.summary)
                .await?;
            return Ok(());
        }
        if !metadata.permissions.issues_write && !policy.dry_run {
            self.resolve(
                intake,
                Disposition::Blocked,
                "GitHub Issuesへの書き込み権限がありません。",
            )
            .await?;
            return Ok(());
        }
        if decision.issue_title.is_none()
            || decision.expected_behavior.is_none()
            || decision.completion_criteria.is_empty()
        {
            self.resolve(
                intake,
                Disposition::NotSubstantiated,
                "外部から検証可能な期待動作または完了条件が不足しています。",
            )
            .await?;
            return Ok(());
        }

        let fingerprint = create_fingerprint(
            &intake.repository.full_name,
            &intake.request,
            &decision.related_identifiers,
        );
        intake.fingerprint = Some(fingerprint.clone());
        if let Some(existing) = self.find_fingerprint(intake, &fingerprint).await? {
            intake.issue = Some(IssueReference {
                number: existing.number,
                url: existing.url,
                title: existing.title,
            });
            self.resolve(
                intake,
                Disposition::Duplicate,
                &format!("同じfingerprintのIssue #{}が存在します。", existing.number),
            )
            .await?;
            return Ok(());
        }

        let final_issues = self
            .github
            .search_issues(
                &intake.repository,
                SearchOptions {
                    query: intake.normalized_request.clone(),
                    limit: 50,
                },
            )
            .await?;
        let final_pulls = self
            .github
            .search_pull_requests(
                &intake.repository,
                SearchOptions {
                    query: intake.normalized_request.clone(),
                    limit: 50,
                },
            )
            .await?;
        if let Some(issue) = final_issues.first() {
            self.resolve(
                intake,
                Disposition::Duplicate,
                &format!("最終確認で関連Issue #{}を検出しました。", issue.number),
            )
            .await?;
            return Ok(());
        }
        if let Some(pull) = final_pulls.iter().find(|item| item.state == "open") {
            self.resolve(
                intake,
                Disposition::InProgress,
                &format!(
                    "最終確認で対応中のPull Request #{}を検出しました。",
                    pull.number
                ),
            )
            .await?;
            return Ok(());
        }

        let body = render_issue_body(
            &intake.repository,
            &intake.request,
            &metadata.default_branch_sha,
            &decision,
            &intake.evidence,
            &fingerprint,
        );
        if contains_potential_secret(&body) {
            self.resolve(
                intake,
                Disposition::Blocked,
                "Issue本文に安全に記録できない機密情報が含まれます。",
            )
            .await?;
            return Ok(());
        }
        if policy.dry_run {
            if let Some(value) = intake.decision.as_mut() {
                value.summary = format!("dry-run: {}", value.summary);
            }
            intake.state = IntakeState::Completed;
            self.save(intake).await?;
            return Ok(());
        }

        intake.state = IntakeState::CreatingIssue;
        self.save(intake).await?;
        let mut labels = vec![policy.validation_label.clone()];
        if policy.auto_queue_after_create {
            labels.push(policy.queue_label.clone());
        }
        let created = self
            .github
            .create_issue(
                &intake.repository,
                decision.issue_title.as_deref().unwrap_or_default(),
                &body,
                &labels,
            )
            .await;
        let issue = match created {
            Ok(issue) => issue,
            Err(error) => self
                .find_fingerprint(intake, &fingerprint)
                .await?
                .ok_or(error)?,
        };
        intake.issue = Some(IssueReference {
            number: issue.number,
            url: issue.url,
            title: issue.title,
        });
        intake.state = IntakeState::Completed;
        self.save(intake).await?;
        Ok(())
    }

    async fn find_fingerprint(
        &self,
        intake: &IntakeSnapshot,
        fingerprint: &str,
    ) -> Result<Option<IssueRecord>, String> {
        let marker = fingerprint_marker(fingerprint);
        Ok(self
            .github
            .search_issues(
                &intake.repository,
                SearchOptions {
                    query: marker.clone(),
                    limit: 10,
                },
            )
            .await?
            .into_iter()
            .find(|issue| issue.body.contains(&marker)))
    }

    async fn need_input(&self, intake: &mut IntakeSnapshot, question: &str) -> Result<(), String> {
        intake.state = IntakeState::NeedsInput;
        intake.question = Some(redact_secrets(question));
        intake.decision = Some(ValidationDecision {
            disposition: Disposition::NeedsInput,
            summary: "人間の判断または観測情報が必要です。".into(),
            issue_title: None,
            problem: None,
            current_behavior: None,
            expected_behavior: None,
            completion_criteria: vec![],
            non_goals: vec![],
            question: intake.question.clone(),
            related_identifiers: vec![],
        });
        self.save(intake).await
    }

    async fn resolve(
        &self,
        intake: &mut IntakeSnapshot,
        disposition: Disposition,
        summary: &str,
    ) -> Result<(), String> {
        intake.state = if disposition == Disposition::CreateIssue {
            IntakeState::Completed
        } else {
            IntakeState::ResolvedWithoutIssue
        };
        if let Some(decision) = intake.decision.as_mut() {
            decision.disposition = disposition;
            decision.summary = redact_secrets(summary);
        } else {
            intake.decision = Some(ValidationDecision {
                disposition,
                summary: redact_secrets(summary),
                issue_title: None,
                problem: None,
                current_behavior: None,
                expected_behavior: None,
                completion_criteria: vec![],
                non_goals: vec![],
                question: None,
                related_identifiers: vec![],
            });
        }
        self.save(intake).await
    }

    fn add_evidence(
        &self,
        intake: &mut IntakeSnapshot,
        kind: EvidenceKind,
        source: &str,
        summary: &str,
        excerpt: Option<&str>,
    ) {
        if intake
            .evidence
            .iter()
            .any(|item| item.kind == kind && item.source == source)
        {
            return;
        }
        intake.evidence.push(Evidence {
            id: format!("{:?}:{}", kind, intake.evidence.len() + 1),
            kind,
            source: source.into(),
            summary: redact_secrets(summary).chars().take(2_000).collect(),
            excerpt: excerpt.map(|value| redact_secrets(value).chars().take(4_000).collect()),
            captured_at: self.clock.now(),
            metadata: BTreeMap::new(),
            visual: None,
        });
    }

    async fn save(&self, intake: &mut IntakeSnapshot) -> Result<(), String> {
        intake.updated_at = self.clock.now();
        let action = format!("state:{:?}", intake.state).to_lowercase();
        if intake
            .audit_events
            .last()
            .is_none_or(|event| event.action != action)
        {
            intake.audit_events.push(AuditEvent {
                actor_id: intake.owner_id.clone(),
                action,
                outcome: if intake.state == IntakeState::Failed {
                    "failure".into()
                } else {
                    "success".into()
                },
                resource: intake.repository.full_name.clone(),
                occurred_at: intake.updated_at.clone(),
            });
        }
        self.store.put(intake).await
    }
}

fn sanitize_decision(decision: ValidationDecision) -> Result<ValidationDecision, String> {
    let json = serde_json::to_string(&decision).map_err(|error| error.to_string())?;
    serde_json::from_str(&redact_secrets(&json)).map_err(|error| error.to_string())
}
