import { useStore } from "zustand";
import { useShallow } from "zustand/shallow";
import { useHarnessCanvasStore } from "../_store";
import type { PipelineEdge, PipelineNode } from "../_store/canvasSlice";
import {
  decorateEdgesWithPortHandles,
  getNodePortVisualCounts,
  type PendingNodePortConnection,
} from "./nodePorts";

let cachedNodesRef: PipelineNode[] | null = null;
let cachedEdgesRef: PipelineEdge[] | null = null;
let cachedConnectStartRef: PendingNodePortConnection | null = null;
let cachedDecoratedEdges: PipelineEdge[] = [];

const getCachedDecoratedEdges = (
  nodes: PipelineNode[],
  edges: PipelineEdge[],
  connectStart: PendingNodePortConnection | null
) => {
  if (
    cachedNodesRef === nodes &&
    cachedEdgesRef === edges &&
    cachedConnectStartRef === connectStart
  ) {
    return cachedDecoratedEdges;
  }

  cachedNodesRef = nodes;
  cachedEdgesRef = edges;
  cachedConnectStartRef = connectStart;
  cachedDecoratedEdges = decorateEdgesWithPortHandles(nodes, edges, connectStart);

  return cachedDecoratedEdges;
};

export const useNodePortCounts = (nodeId: string) => {
  const store = useHarnessCanvasStore();

  return useStore(
    store,
    useShallow((state) => {
      const decoratedEdges = getCachedDecoratedEdges(state.nodes, state.edges, state.connectStart);

      return getNodePortVisualCounts(
        state.nodes,
        state.edges,
        nodeId,
        state.connectStart,
        decoratedEdges
      );
    })
  );
};
