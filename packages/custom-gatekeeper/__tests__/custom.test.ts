import { describe, expect, it } from "vitest";
import {
  CustomSessionImpl,
  describeCustomAccount,
  describeCustomVendor,
} from "../src/custom.js";

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
    );

    await expect(session.getDeploymentInfo()).resolves.toEqual({
      name: "Acme",
      message: "Use the internal handbook.",
    });
    expect(observation).toEqual({
      title: "Read Agent Issue Console policy information",
      description: "Read the non-secret deployment identity and product guidance.",
    });

    session[Symbol.dispose]();
    expect(disposed).toBe(true);
  });
});
