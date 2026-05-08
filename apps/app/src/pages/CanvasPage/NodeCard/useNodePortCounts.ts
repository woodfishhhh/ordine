import { useStore } from "zustand";
import { useShallow } from "zustand/shallow";
import { useHarnessCanvasStore } from "../_store";
import { getNodePortVisualCounts } from "./nodePorts";

export const useNodePortCounts = (nodeId: string) => {
  const store = useHarnessCanvasStore();

  return useStore(
    store,
    useShallow((state) =>
      getNodePortVisualCounts(state.nodes, state.edges, nodeId, state.connectStart)
    )
  );
};
