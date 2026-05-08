import { describe, expect, it } from "vitest";
import type {
  PipelineGraphSnapshot,
  PipelineOperation,
} from "@repo/pipeline-engine/schemas";
import { applyPipelineOperations, validatePipelineOperations } from "./applyPipelineOperations";
import { makeEdge } from "../tests/helpers/makeEdge";
import { makeNode } from "../tests/helpers/makeNode";

const makeSnapshot = (
  nodes: PipelineGraphSnapshot["nodes"] = [],
  edges: PipelineGraphSnapshot["edges"] = [],
): PipelineGraphSnapshot => ({
  nodes,
  edges,
});

describe("validatePipelineOperations", () => {
  it("rejects operations that involve compound nodes", () => {
    const snapshot = makeSnapshot([makeNode("compound-1", "compound")]);
    const operations: PipelineOperation[] = [{ type: "removeNode", nodeId: "compound-1" }];

    const result = validatePipelineOperations(snapshot, operations);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "COMPOUND_NODE_NOT_SUPPORTED",
          operationIndex: 0,
        }),
      ]),
    );
  });

  it("rejects operations that involve child nodes", () => {
    const childNode = { ...makeNode("child-1", "operation"), parentId: "compound-1" };
    const snapshot = makeSnapshot([childNode]);
    const operations: PipelineOperation[] = [{ type: "replaceNodeData", nodeId: "child-1", data: childNode.data }];

    const result = validatePipelineOperations(snapshot, operations);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "CHILD_NODE_NOT_SUPPORTED",
          operationIndex: 0,
        }),
      ]),
    );
  });
});

describe("applyPipelineOperations", () => {
  it("applies sequential addNode then addEdge operations", () => {
    const folderNode = makeNode("folder-1", "folder");
    const operationNode = makeNode("operation-1", "operation", {
      operationId: "op-1",
      operationName: "Operation 1",
    });
    const operations: PipelineOperation[] = [
      { type: "addNode", node: operationNode },
      {
        type: "addEdge",
        edge: { ...makeEdge("folder-1", "operation-1"), sourceHandle: null, targetHandle: null },
      },
    ];

    const result = applyPipelineOperations(makeSnapshot([folderNode]), operations);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      nodes: [folderNode, operationNode],
      edges: [
        expect.objectContaining({
          source: "folder-1",
          target: "operation-1",
        }),
      ],
    });
  });

  it("rejects edges that reference missing nodes", () => {
    const snapshot = makeSnapshot([makeNode("folder-1", "folder")]);
    const operations: PipelineOperation[] = [{ type: "addEdge", edge: makeEdge("folder-1", "missing") }];

    const result = applyPipelineOperations(snapshot, operations);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "NODE_NOT_FOUND",
          operationIndex: 0,
        }),
      ]),
    );
    expect(snapshot).toEqual(makeSnapshot([makeNode("folder-1", "folder")]));
  });

  it("rejects invalid connection rules", () => {
    const snapshot = makeSnapshot([
      makeNode("output-1", "output-local-path"),
      makeNode("operation-1", "operation", { operationId: "op-1", operationName: "Operation 1" }),
    ]);
    const operations: PipelineOperation[] = [
      { type: "addEdge", edge: makeEdge("output-1", "operation-1") },
    ];

    const result = applyPipelineOperations(snapshot, operations);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "INVALID_CONNECTION",
          operationIndex: 0,
        }),
      ]),
    );
  });

  it("rejects duplicate node ids", () => {
    const existing = makeNode("operation-1", "operation", {
      operationId: "op-1",
      operationName: "Operation 1",
    });
    const operations: PipelineOperation[] = [{ type: "addNode", node: existing }];

    const result = applyPipelineOperations(makeSnapshot([existing]), operations);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "DUPLICATE_NODE_ID",
          operationIndex: 0,
        }),
      ]),
    );
  });

  it("rejects added nodes whose React Flow type does not match data.nodeType", () => {
    const mismatched = makeNode("operation-1", "operation", {
      nodeType: "folder",
      folderPath: "/tmp/source",
    });
    const operations: PipelineOperation[] = [{ type: "addNode", node: mismatched }];

    const result = applyPipelineOperations(makeSnapshot(), operations);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "INVALID_NODE_DATA",
          operationIndex: 0,
        }),
      ]),
    );
  });

  it("keeps the graph unchanged when a later operation in the batch fails", () => {
    const snapshot = makeSnapshot([makeNode("folder-1", "folder")]);
    const operationNode = makeNode("operation-1", "operation", {
      operationId: "op-1",
      operationName: "Operation 1",
    });
    const operations: PipelineOperation[] = [
      { type: "addNode", node: operationNode },
      { type: "addEdge", edge: makeEdge("operation-1", "missing") },
    ];

    const result = applyPipelineOperations(snapshot, operations);

    expect(result.isErr()).toBe(true);
    expect(snapshot).toEqual(makeSnapshot([makeNode("folder-1", "folder")]));
  });
});
