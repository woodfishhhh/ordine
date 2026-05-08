import { err, ok, Result } from "neverthrow";
import { z } from "zod/v4";
import { PipelineEdgeSchema, PipelineNodeSchema } from "@repo/pipeline-engine/schemas";
import type { PipelineEdge, PipelineNode } from "../_store/canvasSlice";

export const MAX_CANVAS_IMPORT_BYTES = 2_000_000;
export const MAX_CANVAS_IMPORT_NODES = 500;
export const MAX_CANVAS_IMPORT_EDGES = 1000;

const CanvasNodeDimensionSchema = z.union([z.number(), z.string()]);
const CanvasNodeStyleSchema = z.object({
  width: CanvasNodeDimensionSchema.optional(),
  height: CanvasNodeDimensionSchema.optional(),
});
const CanvasNodeMeasuredSchema = z.object({
  width: z.number().optional(),
  height: z.number().optional(),
});
const CanvasImportNodeSchema = PipelineNodeSchema.extend({
  parentId: z.string().optional(),
  extent: z.literal("parent").optional(),
  expandParent: z.boolean().optional(),
  origin: z.tuple([z.number(), z.number()]).optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  initialWidth: z.number().optional(),
  initialHeight: z.number().optional(),
  measured: CanvasNodeMeasuredSchema.optional(),
  zIndex: z.number().optional(),
  ariaLabel: z.string().max(200).optional(),
  style: CanvasNodeStyleSchema.optional(),
});
const CanvasImportEdgeSchema = PipelineEdgeSchema.extend({
  type: z.string().optional(),
  animated: z.boolean().optional(),
  label: z.string().max(200).optional(),
});

const CanvasImportJsonSchema = z.object({
  name: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  nodes: z.array(CanvasImportNodeSchema).max(MAX_CANVAS_IMPORT_NODES),
  edges: z.array(CanvasImportEdgeSchema).max(MAX_CANVAS_IMPORT_EDGES),
});

type CanvasImportJson = z.infer<typeof CanvasImportJsonSchema>;

export type CanvasImportError = "invalid-json" | "invalid-pipeline-json" | "file-too-large";

export type CanvasImportPayload = Omit<CanvasImportJson, "nodes" | "edges"> & {
  nodes: PipelineNode[];
  edges: PipelineEdge[];
};

const parseJson = Result.fromThrowable(
  (text: string) => JSON.parse(text) as unknown,
  () => "invalid-json" as const
);

export const isCanvasImportFileTooLarge = (file: Pick<File, "size">): boolean =>
  file.size > MAX_CANVAS_IMPORT_BYTES;

const toCanvasImportPayload = (payload: CanvasImportJson): CanvasImportPayload => ({
  name: payload.name,
  title: payload.title,
  nodes: payload.nodes as PipelineNode[],
  edges: payload.edges as PipelineEdge[],
});

export const parseCanvasImportJson = (
  text: string
): Result<CanvasImportPayload, CanvasImportError> =>
  parseJson(text).andThen((parsed) => {
    const result = CanvasImportJsonSchema.safeParse(parsed);
    if (!result.success) {
      return err("invalid-pipeline-json");
    }

    return ok(toCanvasImportPayload(result.data));
  });
