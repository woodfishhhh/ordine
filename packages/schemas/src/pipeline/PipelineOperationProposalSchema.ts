import { z } from "zod/v4";
import { PipelineOperationSchema } from "./PipelineOperationSchema";

export const PipelineOperationProposalSchema = z.object({
  summary: z.string().min(1),
  operations: z.array(PipelineOperationSchema).min(1),
});
export type PipelineOperationProposal = z.infer<typeof PipelineOperationProposalSchema>;
