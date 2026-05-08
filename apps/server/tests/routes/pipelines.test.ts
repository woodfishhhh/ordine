import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  proposeOperations: vi.fn(),
  startRun: vi.fn(),
}));

vi.mock("../../src/services.js", () => ({
  pipelinesService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    proposeOperations: mocks.proposeOperations,
  },
  pipelineRunnerService: {
    startRun: mocks.startRun,
  },
}));

import { pipelinesRoutes } from "../../src/routes/pipelines";

const makeApp = () => {
  const app = new Hono();
  app.route("/pipelines", pipelinesRoutes);

  return app;
};

describe("pipelinesRoutes propose-operations", () => {
  beforeEach(() => {
    mocks.proposeOperations.mockReset();
    mocks.startRun.mockReset();
  });

  it("returns 400 when propose-operations receives invalid JSON", async () => {
    const response = await makeApp().request("/pipelines/p1/propose-operations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request body" });
    expect(mocks.proposeOperations).not.toHaveBeenCalled();
  });

  it("returns 400 when propose-operations receives an invalid snapshot", async () => {
    const response = await makeApp().request("/pipelines/p1/propose-operations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshot: null, message: "add node" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request body" });
    expect(mocks.proposeOperations).not.toHaveBeenCalled();
  });

  it("forwards valid propose-operations requests to the service", async () => {
    const responseBody = { proposal: null, diagnostics: [] };
    mocks.proposeOperations.mockResolvedValue(responseBody);

    const snapshot = { nodes: [], edges: [] };
    const response = await makeApp().request("/pipelines/p1/propose-operations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshot, message: "add node", pipelineName: "Pipeline 1" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(responseBody);
    expect(mocks.proposeOperations).toHaveBeenCalledWith({
      pipelineId: "p1",
      snapshot,
      message: "add node",
      pipelineName: "Pipeline 1",
    });
  });
});
