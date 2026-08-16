import { describe, expect, it } from "vitest";
import {
  CustomSessionImpl,
  describeCustomAccount,
  describeCustomVendor,
} from "../src/custom.js";
import { RustCoreClient } from "../src/core-client.js";

describe("custom-gatekeeper", () => {
  it("describes an auto-provisioned singleton", () => {
    expect(describeCustomVendor()).toMatchObject({
      displayName: "Agent Issue Console",
      autoProvisionsAccount: true,
      providesAuth: false,
    });
    expect(describeCustomAccount()).toMatchObject({
      displayName: "Agent Issue Console",
      singleton: { tsType: "CustomSession" },
      providesUi: { title: "Agent Issue Console" },
    });
  });

  it("authorizes the observation before returning deployment information", async () => {
    let observation: unknown;
    let disposed = false;
    const session = new CustomSessionImpl(
      {
        authorizeObservation(value: unknown) {
          observation = value;
          return Promise.resolve();
        },
        [Symbol.dispose]() {
          disposed = true;
        },
      },
      { name: "Acme", message: "Use the internal handbook." },
      {
        getIntake: () => Promise.resolve(null),
        listIntakes: () => Promise.resolve([]),
        getMonitorSummary: () => Promise.resolve({
          ready: 0,
          running: 0,
          needsInput: 0,
          failed: 0,
          done: 0,
          unqueued: 0,
          refreshedAt: "2026-08-16T00:00:00Z",
        }),
      },
      "ishii1648/agent-issue-console",
    );

    await expect(session.getDeploymentInfo()).resolves.toEqual({
      name: "Acme",
      message: "Use the internal handbook.",
    });
    expect(observation).toEqual({
      title: "Read Agent Issue Console policy information",
      description: "secretを含まないdeployment identityとproduct guidanceを読み取りました。",
    });

    session[Symbol.dispose]();
    expect(disposed).toBe(true);
  });

  it("forwards only the owner-scoped HTTP capability to the Rust core", async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const core = {
      async fetch(input: RequestInfo | URL, init?: RequestInit) {
        captured = { url: String(input), init };
        return Response.json({ id: "intake-1", state: "completed" });
      },
    } as Fetcher;
    const client = new RustCoreClient(core, "owner-1", "acme/app");

    await client.submitIntake("Improve jobs", undefined, false);

    expect(captured?.url).toBe("https://agent-issue-core.internal/v1/intakes");
    expect(captured?.init?.method).toBe("POST");
    expect(captured?.init?.headers).toEqual({
      "content-type": "application/json",
      "x-agent-issue-owner": "owner-1",
    });
    expect(JSON.parse(String(captured?.init?.body))).toEqual({
      request: "Improve jobs",
      repository: "acme/app",
      uiRelated: false,
    });
  });
});
