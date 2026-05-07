import { z } from "zod/v4";
import { PipelineNodeDataSchema } from "./PipelineNodeDataSchema";
import { PipelineGraphNodeSchema, PipelineGraphEdgeSchema } from "./PipelineGraphSnapshotSchema";

export const AddNodePipelineOperationSchema = z.object({
  type: z.literal("addNode"),
  node: PipelineGraphNodeSchema,
});

export const RemoveNodePipelineOperationSchema = z.object({
  type: z.literal("removeNode"),
  nodeId: z.string(),
});

export const AddEdgePipelineOperationSchema = z.object({
  type: z.literal("addEdge"),
  edge: PipelineGraphEdgeSchema,
});

export const RemoveEdgePipelineOperationSchema = z.object({
  type: z.literal("removeEdge"),
  edgeId: z.string(),
});

export const ReconnectEdgePipelineOperationSchema = z.object({
  type: z.literal("reconnectEdge"),
  edgeId: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
});

export const ReplaceNodeDataPipelineOperationSchema = z.object({
  type: z.literal("replaceNodeData"),
  nodeId: z.string(),
  data: PipelineNodeDataSchema,
});

export const PipelineOperationSchema = z.discriminatedUnion("type", [
  AddNodePipelineOperationSchema,
  RemoveNodePipelineOperationSchema,
  AddEdgePipelineOperationSchema,
  RemoveEdgePipelineOperationSchema,
  ReconnectEdgePipelineOperationSchema,
  ReplaceNodeDataPipelineOperationSchema,
]);
export type PipelineOperation = z.infer<typeof PipelineOperationSchema>;
