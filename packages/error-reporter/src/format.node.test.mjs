import assert from "node:assert/strict";
import test from "node:test";
import { formatErrorLog } from "../dist/format.js";

test("adds trusted producer metadata to the bounded event", () => {
  const event = { schemaVersion: 1, occurrenceId: "occurrence-id", occurredAt: "2026-08-04T00:00:00.000Z", failureSite: "overseer.run-agent", severity: "error", handled: false, exception: { type: "Error", message: "boom" } };
  assert.deepEqual(formatErrorLog({ service: "cloudflare-os", environment: "production", release: "abc123" }, event), { ...event, event: "error_report", service: "cloudflare-os", environment: "production", release: "abc123" });
});

test("does not let RPC input replace trusted metadata", () => {
  const event = { schemaVersion: 1, occurrenceId: "occurrence-id", occurredAt: "2026-08-04T00:00:00.000Z", failureSite: "site", severity: "error", handled: false, event: "forged", service: "forged", environment: "forged", release: "forged" };
  const result = formatErrorLog({ service: "cloudflare-os", environment: "production", release: "abc123" }, event);
  assert.equal(result.event, "error_report"); assert.equal(result.service, "cloudflare-os"); assert.equal(result.environment, "production"); assert.equal(result.release, "abc123");
});
