import { err, ok, type Result } from "neverthrow";
import {
  BuiltinNodeTypeSchema,
  type PipelineGraphSnapshot,
  type PipelineOperation,
  type PipelineOperationDiagnostic,
} from "@repo/schemas";
import { isConnectionAllowed } from "../schemas/nodes/NodeConnectionRulesSchema";

type PipelineGraphNode = PipelineGraphSnapshot["nodes"][number];

const cloneSnapshot = (snapshot: PipelineGraphSnapshot): PipelineGraphSnapshot => ({
  nodes: structuredClone(snapshot.nodes),
  edges: structuredClone(snapshot.edges),
});

const makeDiagnostic = (
  code: PipelineOperationDiagnostic["code"],
  message: string,
  operationIndex: number,
): PipelineOperationDiagnostic => ({
  code,
  message,
  operationIndex,
  severity: "error",
});

const isCompoundNode = (node: PipelineGraphNode): boolean =>
  node.type === "compound" || node.data.nodeType === "compound";

const isChildNode = (node: PipelineGraphNode): boolean => typeof node.parentId === "string";

const validateSupportedNode = (
  node: PipelineGraphNode,
  operationIndex: number,
): PipelineOperationDiagnostic[] => {
  if (isCompoundNode(node)) {
    return [
      makeDiagnostic(
        "COMPOUND_NODE_NOT_SUPPORTED",
        `Compound node "${node.id}" is not supported by AI graph edits in v1.`,
        operationIndex,
      ),
    ];
  }

  if (isChildNode(node)) {
    return [
      makeDiagnostic(
        "CHILD_NODE_NOT_SUPPORTED",
        `Child node "${node.id}" is not supported by AI graph edits in v1.`,
        operationIndex,
      ),
    ];
  }

  return [];
};

const validateConnection = (
  sourceNode: PipelineGraphNode,
  targetNode: PipelineGraphNode,
  operationIndex: number,
): PipelineOperationDiagnostic[] => {
  const sourceType = BuiltinNodeTypeSchema.safeParse(sourceNode.type);
  const targetType = BuiltinNodeTypeSchema.safeParse(targetNode.type);

  if (!sourceType.success || !targetType.success) {
    return [
      makeDiagnostic(
        "INVALID_CONNECTION",
        `Connection ${sourceNode.id} -> ${targetNode.id} uses unsupported node types for AI graph edits.`,
        operationIndex,
      ),
    ];
  }

  if (!isConnectionAllowed(sourceType.data, targetType.data)) {
    return [
      makeDiagnostic(
        "INVALID_CONNECTION",
        `Connection ${sourceNode.id} -> ${targetNode.id} violates pipeline connection rules.`,
        operationIndex,
      ),
    ];
  }

  return [];
};

const validateNodeDataMatch = (
  node: PipelineGraphNode,
  operation: Extract<PipelineOperation, { type: "replaceNodeData" }>,
  operationIndex: number,
): PipelineOperationDiagnostic[] =>
  node.type === operation.data.nodeType
    ? []
    : [
        makeDiagnostic(
          "INVALID_NODE_DATA",
          `Replacement data for node "${node.id}" must keep nodeType "${node.type}".`,
          operationIndex,
        ),
      ];

const validateNodeTypeMatchesData = (
  node: PipelineGraphNode,
  operationIndex: number,
): PipelineOperationDiagnostic[] =>
  node.type === node.data.nodeType
    ? []
    : [
        makeDiagnostic(
          "INVALID_NODE_DATA",
          `Node "${node.id}" type "${node.type}" must match data.nodeType "${node.data.nodeType}".`,
          operationIndex,
        ),
      ];

const applyOperation = (
  draft: PipelineGraphSnapshot,
  operation: PipelineOperation,
  operationIndex: number,
): PipelineOperationDiagnostic[] => {
  switch (operation.type) {
    case "addNode": {
      const unsupported = validateSupportedNode(operation.node, operationIndex);
      if (unsupported.length > 0) {
        return unsupported;
      }

      const nodeDataDiagnostics = validateNodeTypeMatchesData(operation.node, operationIndex);
      if (nodeDataDiagnostics.length > 0) {
        return nodeDataDiagnostics;
      }

      if (draft.nodes.some((node) => node.id === operation.node.id)) {
        return [
          makeDiagnostic(
            "DUPLICATE_NODE_ID",
            `Node "${operation.node.id}" already exists.`,
            operationIndex,
          ),
        ];
      }

      draft.nodes.push(operation.node);

      return [];
    }

    case "removeNode": {
      const node = draft.nodes.find((entry) => entry.id === operation.nodeId);
      if (!node) {
        return [
          makeDiagnostic("NODE_NOT_FOUND", `Node "${operation.nodeId}" was not found.`, operationIndex),
        ];
      }

      const unsupported = validateSupportedNode(node, operationIndex);
      if (unsupported.length > 0) {
        return unsupported;
      }

      draft.nodes = draft.nodes.filter((entry) => entry.id !== operation.nodeId);
      draft.edges = draft.edges.filter(
        (edge) => edge.source !== operation.nodeId && edge.target !== operation.nodeId,
      );

      return [];
    }

    case "addEdge": {
      if (draft.edges.some((edge) => edge.id === operation.edge.id)) {
        return [
          makeDiagnostic(
            "DUPLICATE_EDGE_ID",
            `Edge "${operation.edge.id}" already exists.`,
            operationIndex,
          ),
        ];
      }

      const sourceNode = draft.nodes.find((entry) => entry.id === operation.edge.source);
      const targetNode = draft.nodes.find((entry) => entry.id === operation.edge.target);
      if (!sourceNode || !targetNode) {
        return [
          makeDiagnostic(
            "NODE_NOT_FOUND",
            `Edge "${operation.edge.id}" references a missing node.`,
            operationIndex,
          ),
        ];
      }

      const unsupported = [
        ...validateSupportedNode(sourceNode, operationIndex),
        ...validateSupportedNode(targetNode, operationIndex),
      ];
      if (unsupported.length > 0) {
        return unsupported;
      }

      const connectionDiagnostics = validateConnection(sourceNode, targetNode, operationIndex);
      if (connectionDiagnostics.length > 0) {
        return connectionDiagnostics;
      }

      draft.edges.push(operation.edge);

      return [];
    }

    case "removeEdge": {
      const edge = draft.edges.find((entry) => entry.id === operation.edgeId);
      if (!edge) {
        return [
          makeDiagnostic("EDGE_NOT_FOUND", `Edge "${operation.edgeId}" was not found.`, operationIndex),
        ];
      }

      const sourceNode = draft.nodes.find((entry) => entry.id === edge.source);
      const targetNode = draft.nodes.find((entry) => entry.id === edge.target);
      const unsupported = [
        ...(sourceNode ? validateSupportedNode(sourceNode, operationIndex) : []),
        ...(targetNode ? validateSupportedNode(targetNode, operationIndex) : []),
      ];
      if (unsupported.length > 0) {
        return unsupported;
      }

      draft.edges = draft.edges.filter((entry) => entry.id !== operation.edgeId);

      return [];
    }

    case "reconnectEdge": {
      const edge = draft.edges.find((entry) => entry.id === operation.edgeId);
      if (!edge) {
        return [
          makeDiagnostic("EDGE_NOT_FOUND", `Edge "${operation.edgeId}" was not found.`, operationIndex),
        ];
      }

      const sourceNode = draft.nodes.find((entry) => entry.id === operation.source);
      const targetNode = draft.nodes.find((entry) => entry.id === operation.target);
      if (!sourceNode || !targetNode) {
        return [
          makeDiagnostic(
            "NODE_NOT_FOUND",
            `Reconnected edge "${operation.edgeId}" references a missing node.`,
            operationIndex,
          ),
        ];
      }

      const unsupported = [
        ...validateSupportedNode(sourceNode, operationIndex),
        ...validateSupportedNode(targetNode, operationIndex),
      ];
      if (unsupported.length > 0) {
        return unsupported;
      }

      const connectionDiagnostics = validateConnection(sourceNode, targetNode, operationIndex);
      if (connectionDiagnostics.length > 0) {
        return connectionDiagnostics;
      }

      edge.source = operation.source;
      edge.target = operation.target;
      edge.sourceHandle = operation.sourceHandle ?? null;
      edge.targetHandle = operation.targetHandle ?? null;

      return [];
    }

    case "replaceNodeData": {
      const node = draft.nodes.find((entry) => entry.id === operation.nodeId);
      if (!node) {
        return [
          makeDiagnostic("NODE_NOT_FOUND", `Node "${operation.nodeId}" was not found.`, operationIndex),
        ];
      }

      const unsupported = validateSupportedNode(node, operationIndex);
      if (unsupported.length > 0) {
        return unsupported;
      }

      const nodeDataDiagnostics = validateNodeDataMatch(node, operation, operationIndex);
      if (nodeDataDiagnostics.length > 0) {
        return nodeDataDiagnostics;
      }

      node.data = operation.data;

      return [];
    }
  }
};

const runPipelineOperations = (
  snapshot: PipelineGraphSnapshot,
  operations: PipelineOperation[],
): Result<PipelineGraphSnapshot, PipelineOperationDiagnostic[]> => {
  const draft = cloneSnapshot(snapshot);

  for (const [operationIndex, operation] of operations.entries()) {
    const diagnostics = applyOperation(draft, operation, operationIndex);
    if (diagnostics.length > 0) {
      return err(diagnostics);
    }
  }

  return ok(draft);
};

export const validatePipelineOperations = (
  snapshot: PipelineGraphSnapshot,
  operations: PipelineOperation[],
): Result<void, PipelineOperationDiagnostic[]> =>
  runPipelineOperations(snapshot, operations).map(() => undefined);

export const applyPipelineOperations = (
  snapshot: PipelineGraphSnapshot,
  operations: PipelineOperation[],
): Result<PipelineGraphSnapshot, PipelineOperationDiagnostic[]> =>
  runPipelineOperations(snapshot, operations);
