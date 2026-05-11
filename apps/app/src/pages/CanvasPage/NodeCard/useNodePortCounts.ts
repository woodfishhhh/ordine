import { useStore } from "zustand";
import { useShallow } from "zustand/shallow";
import { useHarnessCanvasStore } from "../_store";
import type { PipelineEdge, PipelineNode } from "../_store/canvasSlice";
import {
  decorateEdgesWithPortHandles,
  getNodePortVisualCounts,
  type PendingNodePortConnection,
} from "./nodePorts";

const portRoutingCache: {
  connectStartRef: PendingNodePortConnection | null;
  decoratedEdges: PipelineEdge[];
  edgesRef: PipelineEdge[] | null;
  nodesRef: PipelineNode[] | null;
} = {
  connectStartRef: null,
  decoratedEdges: [],
  edgesRef: null,
  nodesRef: null,
};

const getCachedDecoratedEdges = (
  nodes: PipelineNode[],
  edges: PipelineEdge[],
  connectStart: PendingNodePortConnection | null
) => {
  if (
    portRoutingCache.nodesRef === nodes &&
    portRoutingCache.edgesRef === edges &&
    portRoutingCache.connectStartRef === connectStart
  ) {
    return portRoutingCache.decoratedEdges;
  }

  portRoutingCache.nodesRef = nodes;
  portRoutingCache.edgesRef = edges;
  portRoutingCache.connectStartRef = connectStart;
  portRoutingCache.decoratedEdges = decorateEdgesWithPortHandles(nodes, edges, connectStart);

  return portRoutingCache.decoratedEdges;
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
