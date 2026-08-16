mod adapters;
mod fingerprint;
mod issue_body;
mod model;
mod monitor;
mod ports;
mod security;
mod workflow;
#[cfg(test)]
mod workflow_tests;

use adapters::{BrowserRenderingClient, GitHubClient, OpenCodeGoClient};
use async_trait::async_trait;
use fingerprint::create_fingerprint;
use model::*;
use monitor::build_monitor_snapshot;
use ports::{Clock, GitHubPort, IdGenerator, IntakeStore, SearchOptions};
use security::repository_policy;
use worker::*;
use workflow::Workflow;

const OWNER_HEADER: &str = "x-agent-issue-owner";

struct RuntimeClock;

impl Clock for RuntimeClock {
    fn now(&self) -> String {
        Date::now().to_string()
    }
}

struct RuntimeIds;

impl IdGenerator for RuntimeIds {
    fn next(&self, owner_id: &str, request: &str) -> String {
        let stable = create_fingerprint(owner_id, request, &[]);
        format!("intake-{}-{}", Date::now().as_millis(), &stable[..12])
    }
}

struct DurableIntakeStore {
    storage: Storage,
    owner_id: String,
}

impl DurableIntakeStore {
    const INDEX: &'static str = "intake-index";

    fn key(id: &str) -> String {
        format!("intake:{id}")
    }
}

#[async_trait(?Send)]
impl IntakeStore for DurableIntakeStore {
    async fn get(&self, id: &str) -> std::result::Result<Option<IntakeSnapshot>, String> {
        let value = self
            .storage
            .get::<IntakeSnapshot>(&Self::key(id))
            .await
            .map_err(|error| error.to_string())?;
        Ok(value.filter(|intake| intake.owner_id == self.owner_id))
    }

    async fn put(&self, intake: &IntakeSnapshot) -> std::result::Result<(), String> {
        if intake.owner_id != self.owner_id {
            return Err("別ユーザーのIntakeを書き込めません。".into());
        }
        let mut index = self
            .storage
            .get::<Vec<String>>(Self::INDEX)
            .await
            .map_err(|error| error.to_string())?
            .unwrap_or_default();
        if !index.contains(&intake.id) {
            index.push(intake.id.clone());
            self.storage
                .put(Self::INDEX, &index)
                .await
                .map_err(|error| error.to_string())?;
        }
        self.storage
            .put(&Self::key(&intake.id), intake)
            .await
            .map_err(|error| error.to_string())
    }

    async fn list(&self) -> std::result::Result<Vec<IntakeSnapshot>, String> {
        let index = self
            .storage
            .get::<Vec<String>>(Self::INDEX)
            .await
            .map_err(|error| error.to_string())?
            .unwrap_or_default();
        let mut values = Vec::new();
        for id in index.into_iter().rev() {
            if let Some(value) = self.get(&id).await? {
                values.push(value);
            }
        }
        Ok(values)
    }
}

struct Runtime {
    github: GitHubClient,
    llm: OpenCodeGoClient,
    browser: BrowserRenderingClient,
    store: DurableIntakeStore,
    policies: Vec<RepositoryPolicy>,
    default_repository: String,
    max_context_characters: usize,
    max_output_characters: usize,
}

impl Runtime {
    fn from_env(
        env: &Env,
        storage: Storage,
        owner_id: String,
    ) -> std::result::Result<Self, String> {
        if env_value(env, "AIC_LLM_PROVIDER", "opencode-go") != "opencode-go" {
            return Err("未対応のLLM providerです。".into());
        }
        let dry_run = env_value(env, "AIC_DRY_RUN", "true") != "false";
        let mut policies: Vec<RepositoryPolicy> =
            serde_json::from_str(&env_value(env, "AIC_REPOSITORY_POLICIES", "[]"))
                .map_err(|_| "AIC_REPOSITORY_POLICIESが不正です。".to_string())?;
        for policy in &mut policies {
            policy.dry_run = dry_run;
        }
        let allowed_repositories = policies
            .iter()
            .map(|policy| policy.repository.clone())
            .collect::<Vec<_>>();
        let allowed_labels = policies
            .iter()
            .flat_map(|policy| {
                [
                    policy.validation_label.clone(),
                    policy.queue_label.clone(),
                    policy.status_labels.ready.clone(),
                    policy.status_labels.running.clone(),
                    policy.status_labels.needs_input.clone(),
                    policy.status_labels.failed.clone(),
                    policy.status_labels.done.clone(),
                ]
            })
            .collect::<Vec<_>>();
        let github = GitHubClient::new(
            env_secret(env, "GITHUB_TOKEN"),
            allowed_repositories,
            allowed_labels,
            20_000,
            2,
        );
        Ok(Self {
            github,
            llm: OpenCodeGoClient {
                base_url: env_value(env, "AIC_LLM_BASE_URL", "https://opencode.ai/zen/go/v1"),
                model: env_value(env, "AIC_LLM_MODEL", "gpt-5.6-luna"),
                api_key: env_secret(env, "OPENCODE_GO_API_KEY"),
                retries: env_number(env, "AIC_LLM_RETRIES", 2) as u8,
                max_output_tokens: env_number(env, "AIC_MAX_OUTPUT_TOKENS", 4_000),
                timeout_ms: env_number(env, "AIC_LLM_TIMEOUT_MS", 45_000) as u64,
            },
            browser: BrowserRenderingClient {
                account_id: env_secret(env, "CLOUDFLARE_ACCOUNT_ID"),
                api_token: env_secret(env, "CLOUDFLARE_BROWSER_TOKEN"),
                timeout_ms: env_number(env, "AIC_BROWSER_TIMEOUT_MS", 30_000) as u64,
            },
            store: DurableIntakeStore { storage, owner_id },
            policies,
            default_repository: env_value(env, "AIC_DEFAULT_REPOSITORY", ""),
            max_context_characters: env_number(env, "AIC_MAX_CONTEXT_CHARACTERS", 60_000),
            max_output_characters: env_number(env, "AIC_MAX_OUTPUT_CHARACTERS", 8_000),
        })
    }

    fn workflow<'a>(&'a self, clock: &'a RuntimeClock, ids: &'a RuntimeIds) -> Workflow<'a> {
        Workflow {
            github: &self.github,
            llm: &self.llm,
            browser: &self.browser,
            store: &self.store,
            policies: &self.policies,
            clock,
            ids,
            max_context_characters: self.max_context_characters,
            max_output_characters: self.max_output_characters,
        }
    }
}

fn env_value(env: &Env, name: &str, fallback: &str) -> String {
    env.var(name)
        .map(|value| value.to_string())
        .unwrap_or_else(|_| fallback.into())
}

fn env_secret(env: &Env, name: &str) -> String {
    env.secret(name)
        .map(|value| value.to_string())
        .unwrap_or_default()
}

fn env_number(env: &Env, name: &str, fallback: usize) -> usize {
    env_value(env, name, &fallback.to_string())
        .parse()
        .unwrap_or(fallback)
}

fn json_error(message: &str, status: u16) -> Result<Response> {
    Ok(
        Response::from_json(&serde_json::json!({ "error": security::redact_secrets(message) }))?
            .with_status(status),
    )
}

fn count(snapshot: &MonitorSnapshot, key: &str) -> u64 {
    snapshot.counts.get(key).copied().unwrap_or(0)
}

#[durable_object]
pub struct AgentIssueState {
    state: State,
    env: Env,
}

impl DurableObject for AgentIssueState {
    fn new(state: State, env: Env) -> Self {
        Self { state, env }
    }

    async fn fetch(&self, mut request: Request) -> Result<Response> {
        let owner_id = request
            .headers()
            .get(OWNER_HEADER)?
            .filter(|value| !value.is_empty() && value.len() <= 256)
            .ok_or_else(|| Error::RustError("owner capabilityがありません。".into()))?;
        let runtime = Runtime::from_env(&self.env, self.state.storage(), owner_id.clone())
            .map_err(Error::RustError)?;
        let clock = RuntimeClock;
        let ids = RuntimeIds;
        let path = request.path();
        let method = request.method();

        if method == Method::Post && path == "/v1/intakes" {
            let input: SubmitIntakeRequest = request.json().await?;
            let result = runtime
                .workflow(&clock, &ids)
                .submit(
                    &owner_id,
                    input
                        .repository
                        .as_deref()
                        .unwrap_or(&runtime.default_repository),
                    &input.request,
                    input.ui_related,
                )
                .await
                .map_err(Error::RustError)?;
            return Response::from_json(&IntakeResult::from(&result));
        }
        if method == Method::Get && path == "/v1/intakes" {
            let values = runtime
                .store
                .list()
                .await
                .map_err(Error::RustError)?
                .iter()
                .map(IntakeResult::from)
                .collect::<Vec<_>>();
            return Response::from_json(&values);
        }
        if let Some(id) = path
            .strip_prefix("/v1/intakes/")
            .and_then(|value| value.strip_suffix("/answer"))
        {
            if method != Method::Post || id.contains('/') {
                return json_error("Method Not Allowed", 405);
            }
            let input: AnswerIntakeRequest = request.json().await?;
            let result = runtime
                .workflow(&clock, &ids)
                .answer(id, &owner_id, &input.answer, input.ui_related)
                .await
                .map_err(Error::RustError)?;
            return Response::from_json(&IntakeResult::from(&result));
        }
        if let Some(id) = path.strip_prefix("/v1/intakes/") {
            if method != Method::Get || id.contains('/') {
                return json_error("Method Not Allowed", 405);
            }
            let value = runtime.store.get(id).await.map_err(Error::RustError)?;
            return Response::from_json(&value.as_ref().map(IntakeResult::from));
        }
        if method == Method::Get && (path == "/v1/monitor" || path == "/v1/monitor/summary") {
            let url = request.url()?;
            let repository_name = url
                .query_pairs()
                .find(|(key, _)| key == "repository")
                .map(|(_, value)| value.into_owned())
                .unwrap_or_else(|| runtime.default_repository.clone());
            let repository = RepositoryRef::parse(&repository_name).map_err(Error::RustError)?;
            let policy =
                repository_policy(&repository, &runtime.policies).map_err(Error::RustError)?;
            let mut issues = runtime
                .github
                .search_issues(
                    &repository,
                    SearchOptions {
                        query: format!("label:{}", policy.validation_label),
                        limit: 100,
                    },
                )
                .await
                .map_err(Error::RustError)?;
            let pulls = runtime
                .github
                .search_pull_requests(
                    &repository,
                    SearchOptions {
                        query: "is:pr".into(),
                        limit: 100,
                    },
                )
                .await
                .map_err(Error::RustError)?;
            for issue in &mut issues {
                issue.comments = runtime
                    .github
                    .get_issue_comments(&repository, issue.number)
                    .await
                    .unwrap_or_default();
            }
            let snapshot =
                build_monitor_snapshot(&repository.full_name, policy, issues, pulls, clock.now());
            if path.ends_with("/summary") {
                return Response::from_json(&MonitorSummary {
                    ready: count(&snapshot, "ready"),
                    running: count(&snapshot, "running"),
                    needs_input: count(&snapshot, "needs_input"),
                    failed: count(&snapshot, "failed"),
                    done: count(&snapshot, "done"),
                    unqueued: count(&snapshot, "unqueued"),
                    refreshed_at: snapshot.refreshed_at,
                });
            }
            return Response::from_json(&snapshot);
        }
        json_error("Not Found", 404)
    }
}

#[event(fetch, respond_with_errors)]
pub async fn main(request: Request, env: Env, _context: Context) -> Result<Response> {
    let owner_id = request
        .headers()
        .get(OWNER_HEADER)?
        .filter(|value| !value.is_empty() && value.len() <= 256)
        .ok_or_else(|| Error::RustError("owner capabilityがありません。".into()))?;
    let namespace = env.durable_object("AIC_STATE")?;
    let stub = namespace.id_from_name(&owner_id)?.get_stub()?;
    stub.fetch_with_request(request).await
}
