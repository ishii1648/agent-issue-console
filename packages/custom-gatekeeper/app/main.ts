import { RpcTarget, newMessagePortRpcSession, type RpcStub } from "capnweb";
import "./styles.css";

type Evidence = { kind: string; source: string; summary: string; capturedAt: string; screenshotDataUrl?: string };
type Intake = {
  id: string; repository: string; request: string; state: string; updatedAt: string;
  disposition?: string; summary?: string; question?: string; issueUrl?: string;
  evidenceCount: number; evidence: Evidence[];
};
type Pull = { number: number; title: string; url: string; draft: boolean; checkState: string };
type MonitorItem = {
  repository: string; status: string; pendingQuestion?: string;
  issue: { number: number; title: string; url: string; labels: string[]; updatedAt: string };
  relatedPullRequests: Pull[];
};
type Monitor = {
  counts: Record<"ready" | "running" | "needs_input" | "failed" | "done" | "unqueued", number>;
  items: MonitorItem[];
  refreshedAt: string;
};
interface ConsoleApi {
  submitIntake(request: string, repository?: string, uiRelated?: boolean): Promise<Intake>;
  answerIntake(intakeId: string, answer: string, uiRelated?: boolean): Promise<Intake>;
  listIntakes(): Promise<Intake[]>;
  getMonitor(repository?: string): Promise<Monitor>;
}
interface HostCapability extends RpcTarget { readonly ui: RpcStub<ConsoleApi> }
class AppIframe extends RpcTarget {}

const root = document.querySelector<HTMLDivElement>("#root");
if (!root) throw new Error("Missing Agent Issue Console root.");

root.innerHTML = `
  <main class="shell">
    <header class="top"><div class="brand"><div class="mark" aria-hidden="true">AI</div><div><h1>Agent Issue Console</h1><p>調査済みIssueの作成とcodex-loop監視</p></div></div><div class="repo" aria-label="対象repository">ishii1648/agent-issue-console</div></header>
    <section class="summary" aria-label="状態サマリー">
      <article class="metric"><span>着手待ち</span><strong data-count="ready">0</strong></article>
      <article class="metric"><span>実行中</span><strong data-count="running">0</strong></article>
      <article class="metric"><span>回答待ち</span><strong data-count="needs_input">0</strong></article>
      <article class="metric"><span>失敗</span><strong data-count="failed">0</strong></article>
      <article class="metric"><span>完了</span><strong data-count="done">0</strong></article>
    </section>
    <section class="layout">
      <article class="panel"><header class="panel-head"><h2>Issueキュー</h2><button class="refresh" type="button">↻ 更新</button></header><div class="queue-host"><div class="empty">GitHubから監視状態を読み込んでいます。</div></div></article>
      <article class="panel chat-panel"><header class="panel-head"><h2>Create</h2><span class="pill">understanding</span></header><div class="chat"><div class="messages"><div class="assistant">改善したいことを入力してください。確認事項がなければ、調査後にIssueを自動作成します。</div></div><div class="state"><span class="dot"></span><span class="state-text">待機中</span></div><form class="composer"><label for="request" hidden>改善要望</label><input id="request" placeholder="改善したいことを入力…" autocomplete="off"><button class="send" type="submit">送信</button></form><div class="evidence"><details><summary>調査証拠を表示</summary><div class="evidence-list">調査後にsourceとdefault branch SHA付きで表示されます。</div></details></div></div></article>
    </section>
  </main>`;

const { port1, port2 } = new MessageChannel();
window.parent.postMessage({ type: "handshake" }, "*", [port2]);
const host = newMessagePortRpcSession<HostCapability>(port1, new AppIframe());
const api = host.ui;
const form = document.querySelector<HTMLFormElement>(".composer")!;
const input = document.querySelector<HTMLInputElement>("#request")!;
const send = document.querySelector<HTMLButtonElement>(".send")!;
const refresh = document.querySelector<HTMLButtonElement>(".refresh")!;
const messages = document.querySelector<HTMLDivElement>(".messages")!;
const stateText = document.querySelector<HTMLSpanElement>(".state-text")!;
const pill = document.querySelector<HTMLSpanElement>(".pill")!;
const evidenceHost = document.querySelector<HTMLDivElement>(".evidence-list")!;
const queueHost = document.querySelector<HTMLDivElement>(".queue-host")!;
let current: Intake | undefined;

function escape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function safeUrl(value: string): string {
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : "#"; } catch { return "#"; }
}
function uiRelated(value: string): boolean {
  return /(ui|ux|画面|表示|スマホ|モバイル|レスポンシブ|ボタン|フォーム|レイアウト)/i.test(value);
}
function renderIntake(intake: Intake): void {
  current = intake;
  pill.textContent = intake.state;
  stateText.textContent = intake.summary ?? intake.question ?? intake.state;
  const result = intake.issueUrl
    ? `<a href="${escape(safeUrl(intake.issueUrl))}" target="_blank" rel="noreferrer">作成したIssueを開く</a>`
    : escape(intake.summary ?? intake.question ?? "調査状態を保存しました。");
  messages.insertAdjacentHTML("beforeend", `<div class="assistant">${result}</div>`);
  evidenceHost.innerHTML = intake.evidence.length
    ? intake.evidence.map((item) => `<article class="evidence-item"><strong>${escape(item.kind)}</strong><p>${escape(item.summary)}</p><a href="${escape(safeUrl(item.source))}" target="_blank" rel="noreferrer">source</a>${item.screenshotDataUrl ? `<img alt="UI確認 screenshot" src="${escape(item.screenshotDataUrl)}">` : ""}</article>`).join("")
    : "調査証拠はまだありません。";
  input.placeholder = intake.state === "needs_input" ? "質問への回答を入力…" : "改善したいことを入力…";
}
function renderMonitor(monitor: Monitor): void {
  for (const status of ["ready", "running", "needs_input", "failed", "done"] as const) {
    document.querySelector<HTMLElement>(`[data-count="${status}"]`)!.textContent = String(monitor.counts[status] ?? 0);
  }
  queueHost.innerHTML = monitor.items.length ? `<ul class="queue">${monitor.items.map((item) => {
    const pulls = item.relatedPullRequests.map((pull) => `PR #${pull.number}${pull.draft ? " draft" : ""} / ${pull.checkState}`).join(" · ");
    return `<li class="queue-item"><div class="queue-title"><span class="pill">${escape(item.status)}</span><a href="${escape(safeUrl(item.issue.url))}" target="_blank" rel="noreferrer">#${item.issue.number} ${escape(item.issue.title)}</a></div><div class="queue-meta">${escape(item.repository)}${pulls ? ` · ${escape(pulls)}` : ""}${item.pendingQuestion ? `<br>${escape(item.pendingQuestion)}` : ""}</div></li>`;
  }).join("")}</ul>` : `<div class="empty">監視対象はまだありません。検証済みIssueが作成されると、labelと関連PRの状態が表示されます。</div>`;
}
async function refreshAll(): Promise<void> {
  refresh.disabled = true;
  try {
    const [intakes, monitor] = await Promise.all([api.listIntakes(), api.getMonitor()]);
    if (intakes[0]) renderIntake(intakes[0]);
    renderMonitor(monitor);
  } catch (error) {
    stateText.textContent = error instanceof Error ? error.message : String(error);
    stateText.classList.add("error");
  } finally { refresh.disabled = false; }
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = input.value.trim();
  if (!value || send.disabled) return;
  messages.insertAdjacentHTML("beforeend", `<div class="bubble">${escape(value)}</div>`);
  input.value = "";
  send.disabled = true;
  pill.textContent = current?.state === "needs_input" ? "validating" : "investigating";
  stateText.classList.remove("error");
  stateText.textContent = "repository、コード、Issue、PR、commitを調査しています";
  try {
    const result = current?.state === "needs_input"
      ? await api.answerIntake(current.id, value, uiRelated(current.request))
      : await api.submitIntake(value, undefined, uiRelated(value));
    renderIntake(result);
    await refreshAll();
  } catch (error) {
    stateText.textContent = error instanceof Error ? error.message : String(error);
    stateText.classList.add("error");
    pill.textContent = "failed";
  } finally { send.disabled = false; }
});
refresh.addEventListener("click", () => void refreshAll());
void refreshAll();
