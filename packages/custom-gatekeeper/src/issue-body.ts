import type { Evidence, RepositoryRef, ValidationDecision } from "./domain.js";
import { fingerprintMarker } from "./fingerprint.js";
import { redactSecrets } from "./security.js";

function bullets(values: string[] | undefined, fallback: string): string {
  return (values?.length ? values : [fallback]).map((value) => `- ${value}`).join("\n");
}

export function renderIssueBody(input: {
  repository: RepositoryRef;
  request: string;
  defaultBranchSha: string;
  decision: ValidationDecision;
  evidence: Evidence[];
  fingerprint: string;
}): string {
  const related = input.evidence.map((item) =>
    `- ${item.kind}: ${item.source} — ${item.summary}`,
  );
  const body = `## 問題

${input.decision.problem ?? input.request}

## 現在の動作

${input.decision.currentBehavior ?? "調査証拠から、期待する動作を満たしていないことを確認した。"}

## 調査結果

- 対象repository: ${input.repository.fullName}
- 確認したdefault branchのcommit SHA: \`${input.defaultBranchSha}\`
${related.length ? related.join("\n") : "- 関連証拠: 追加の参照なし"}

## 期待する動作

${input.decision.expectedBehavior ?? input.request}

## 完了条件

${bullets(input.decision.completionCriteria, "期待する外部動作を自動テストまたは再現可能な手順で確認できる。")}

## 非ゴール

${bullets(input.decision.nonGoals, "関連しない機能や内部構造の全面的な変更。")}

## Agent Issue Console metadata

- Agent Issue Consoleによる調査済み
- 調査commit: \`${input.defaultBranchSha}\`
- fingerprint: \`${input.fingerprint}\`

${fingerprintMarker(input.fingerprint)}`;
  return redactSecrets(body);
}

export function extractConsoleMetadata(body: string): { fingerprint?: string; defaultBranchSha?: string } | undefined {
  const fingerprint = /<!-- agent-issue-console:fingerprint=([a-f0-9]{64}) -->/i.exec(body)?.[1];
  const sha = /調査commit:\s*`([a-f0-9]{7,64})`/i.exec(body)?.[1];
  return fingerprint || sha ? { fingerprint, defaultBranchSha: sha } : undefined;
}

