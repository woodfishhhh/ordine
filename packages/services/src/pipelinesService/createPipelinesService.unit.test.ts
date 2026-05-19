import { beforeEach, describe, it, expect, vi } from "vitest";

const mockDao = {
  findMany: vi.fn().mockResolvedValue([{ id: "p1" }]),
  findById: vi.fn().mockResolvedValue({ id: "p1" }),
  create: vi.fn().mockResolvedValue({ id: "p1" }),
  update: vi.fn().mockResolvedValue({ id: "p1" }),
  delete: vi.fn().mockResolvedValue(undefined),
};
const mockSettingsDao = {
  get: vi.fn().mockResolvedValue({
    defaultAgentRuntime: "codex",
    defaultApiKey: "test-key",
    defaultModel: "gpt-5.4-mini",
  }),
};
const mockOperationsDao = {
  findMany: vi.fn().mockResolvedValue([
    {
      id: "op-known",
      name: "Known Operation",
      description: "Known operation description",
      acceptedObjectTypes: ["folder"],
    },
  ]),
};
const mockRunAgent = vi.fn();
const mockExtractJsonFromText = vi.fn((raw: string) => raw);

vi.mock("@repo/models", () => ({
  createPipelinesDao: () => mockDao,
  createDistillationsDao: () => ({}),
  createJobsDao: () => ({}),
  createPipelineRunsDao: () => ({ findByJobId: vi.fn(), deleteByPipelineId: vi.fn().mockResolvedValue(undefined) }),
  createJobTracesDao: () => ({}),
  createAgentRawExportsDao: () => ({}),
  createAgentSpansDao: () => ({}),
  createOperationsDao: () => mockOperationsDao,
  createSettingsDao: () => mockSettingsDao,
}));
vi.mock("@repo/agent", () => ({
  extractJsonFromText: (raw: string) => mockExtractJsonFromText(raw),
}));
vi.mock("../pipelineRunnerService/agentRunner/agentRunner", () => ({
  runAgent: (opts: unknown) => mockRunAgent(opts),
}));

import { createPipelinesService } from "./createPipelinesService";

describe("createPipelinesService", () => {
  const snapshot = {
    nodes: [
      {
        id: "folder-1",
        type: "folder",
        position: { x: 0, y: 0 },
        data: { nodeType: "folder", label: "Folder 1", folderPath: "/tmp/source" },
      },
    ],
    edges: [],
  } as never;

  const compoundSnapshot = {
    nodes: [
      {
        id: "compound-1",
        type: "compound",
        position: { x: 0, y: 0 },
        data: { nodeType: "compound", label: "Group 1", childNodeIds: [] },
      },
    ],
    edges: [],
  } as never;

  const resetCommonMocks = () => {
    mockDao.findMany.mockClear();
    mockDao.findById.mockClear();
    mockDao.create.mockClear();
    mockDao.update.mockClear();
    mockDao.delete.mockClear();
    mockSettingsDao.get.mockClear();
    mockOperationsDao.findMany.mockClear();
    mockRunAgent.mockReset();
    mockExtractJsonFromText.mockReset();
    mockExtractJsonFromText.mockImplementation((raw: string) => raw);
  };

  beforeEach(() => {
    resetCommonMocks();
  });

  it("getAll delegates to dao.findMany", async () => {
    const svc = createPipelinesService({} as never);
    const result = await svc.getAll();
    expect(mockDao.findMany).toHaveBeenCalled();
    expect(result).toEqual([{ id: "p1" }]);
  });

  it("getById delegates to dao.findById", async () => {
    const svc = createPipelinesService({} as never);
    await svc.getById("p1");
    expect(mockDao.findById).toHaveBeenCalledWith("p1");
  });

  it("create delegates to dao.create", async () => {
    const svc = createPipelinesService({} as never);
    const data = { name: "pipeline" } as never;
    await svc.create(data);
    expect(mockDao.create).toHaveBeenCalledWith(data);
  });

  it("update delegates to dao.update", async () => {
    const svc = createPipelinesService({} as never);
    await svc.update("p1", { name: "updated" } as never);
    expect(mockDao.update).toHaveBeenCalledWith("p1", { name: "updated" });
  });

  it("delete delegates to dao.delete", async () => {
    const svc = createPipelinesService({} as never);
    await svc.delete("p1");
    expect(mockDao.delete).toHaveBeenCalledWith("p1");
  });

  it("proposeOperations returns a parsed proposal and diagnostics", async () => {
    mockRunAgent.mockResolvedValue(
      JSON.stringify({
        summary: "remove stale node",
        operations: [{ type: "removeNode", nodeId: "folder-1" }],
      }),
    );
    const svc = createPipelinesService({} as never);

    const result = await svc.proposeOperations({
      snapshot,
      message: "remove folder-1",
      pipelineId: "p1",
      pipelineName: "Pipeline 1",
    });

    expect(mockRunAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedTools: [],
        agentId: "pipeline-propose-operations",
        userPrompt: expect.stringContaining("op-known"),
      }),
    );
    expect(mockOperationsDao.findMany).toHaveBeenCalled();
    expect(result.proposal).toEqual({
      summary: "remove stale node",
      operations: [{ type: "removeNode", nodeId: "folder-1" }],
    });
    expect(result.diagnostics).toEqual([]);
    expect(mockDao.create).not.toHaveBeenCalled();
    expect(mockDao.update).not.toHaveBeenCalled();
    expect(mockDao.delete).not.toHaveBeenCalled();
  });

  it("proposeOperations returns diagnostics for operation nodes with unknown operation IDs", async () => {
    mockRunAgent.mockResolvedValue(
      JSON.stringify({
        summary: "add unknown operation",
        operations: [
          {
            type: "addNode",
            node: {
              id: "operation-1",
              type: "operation",
              position: { x: 0, y: 100 },
              data: {
                nodeType: "operation",
                label: "Unknown Operation",
                operationId: "op-missing",
                operationName: "Missing Operation",
                status: "idle",
              },
            },
          },
        ],
      }),
    );
    const svc = createPipelinesService({} as never);

    const result = await svc.proposeOperations({
      snapshot,
      message: "add missing operation",
    });

    expect(result.proposal?.operations).toHaveLength(1);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "INVALID_NODE_DATA",
          operationIndex: 0,
        }),
      ]),
    );
  });

  it("proposeOperations returns null proposal when snapshot is invalid at runtime", async () => {
    const svc = createPipelinesService({} as never);

    const result = await svc.proposeOperations({
      snapshot: undefined as never,
      message: "invalid snapshot",
    });

    expect(result).toEqual({ proposal: null, diagnostics: [] });
    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it("proposeOperations returns null proposal when extracted JSON is invalid", async () => {
    mockRunAgent.mockResolvedValue("raw response");
    mockExtractJsonFromText.mockReturnValue("not-json");
    const svc = createPipelinesService({} as never);

    const result = await svc.proposeOperations({
      snapshot,
      message: "invalid",
    });

    expect(result).toEqual({ proposal: null, diagnostics: [] });
    expect(mockDao.create).not.toHaveBeenCalled();
    expect(mockDao.update).not.toHaveBeenCalled();
    expect(mockDao.delete).not.toHaveBeenCalled();
  });

  it("proposeOperations returns null proposal when schema validation fails", async () => {
    mockRunAgent.mockResolvedValue("raw response");
    mockExtractJsonFromText.mockReturnValue(
      JSON.stringify({
        summary: "",
        operations: [],
      }),
    );
    const svc = createPipelinesService({} as never);

    const result = await svc.proposeOperations({
      snapshot,
      message: "schema-invalid",
    });

    expect(result).toEqual({ proposal: null, diagnostics: [] });
    expect(mockDao.create).not.toHaveBeenCalled();
    expect(mockDao.update).not.toHaveBeenCalled();
    expect(mockDao.delete).not.toHaveBeenCalled();
  });

  it("proposeOperations returns diagnostics for disallowed compound-node operations", async () => {
    mockRunAgent.mockResolvedValue(
      JSON.stringify({
        summary: "remove grouped node",
        operations: [{ type: "removeNode", nodeId: "compound-1" }],
      }),
    );
    const svc = createPipelinesService({} as never);

    const result = await svc.proposeOperations({
      snapshot: compoundSnapshot,
      message: "remove group",
    });

    expect(result.proposal).toEqual({
      summary: "remove grouped node",
      operations: [{ type: "removeNode", nodeId: "compound-1" }],
    });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "COMPOUND_NODE_NOT_SUPPORTED" }),
      ]),
    );
    expect(mockDao.create).not.toHaveBeenCalled();
    expect(mockDao.update).not.toHaveBeenCalled();
    expect(mockDao.delete).not.toHaveBeenCalled();
  });
});
