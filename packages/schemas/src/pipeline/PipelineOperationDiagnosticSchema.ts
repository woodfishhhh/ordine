import { z } from "zod/v4";

export const PIPELINE_OPERATION_DIAGNOSTIC_CODES = {
  CHILD_NODE_NOT_SUPPORTED: "CHILD_NODE_NOT_SUPPORTED",
  COMPOUND_NODE_NOT_SUPPORTED: "COMPOUND_NODE_NOT_SUPPORTED",
  DUPLICATE_EDGE_ID: "DUPLICATE_EDGE_ID",
  DUPLICATE_NODE_ID: "DUPLICATE_NODE_ID",
  EDGE_NOT_FOUND: "EDGE_NOT_FOUND",
  INVALID_CONNECTION: "INVALID_CONNECTION",
  INVALID_NODE_DATA: "INVALID_NODE_DATA",
  NODE_NOT_FOUND: "NODE_NOT_FOUND",
} as const;

export const PipelineOperationDiagnosticCodeSchema = z.enum(
  PIPELINE_OPERATION_DIAGNOSTIC_CODES,
);
export type PipelineOperationDiagnosticCode = z.infer<
  typeof PipelineOperationDiagnosticCodeSchema
>;

export const PipelineOperationDiagnosticSeveritySchema = z.enum(["error", "warning"]);
export type PipelineOperationDiagnosticSeverity = z.infer<
  typeof PipelineOperationDiagnosticSeveritySchema
>;

export const PipelineOperationDiagnosticSchema = z.object({
  code: PipelineOperationDiagnosticCodeSchema,
  severity: PipelineOperationDiagnosticSeveritySchema.default("error"),
  message: z.string(),
  operationIndex: z.number().int().nonnegative().nullable().optional(),
});
export type PipelineOperationDiagnostic = z.infer<typeof PipelineOperationDiagnosticSchema>;
