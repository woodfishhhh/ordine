import { Hono } from "hono";
import { ResultAsync } from "neverthrow";
import { z } from "zod/v4";
import { PipelineGraphSnapshotSchema } from "@repo/schemas";
import { pipelinesService, pipelineRunnerService } from "../services.js";

export const pipelinesRoutes = new Hono();

const ProposeOperationsBodySchema = z.object({
  snapshot: PipelineGraphSnapshotSchema,
  message: z.string().min(1),
  pipelineName: z.string().optional(),
});

pipelinesRoutes.get("/", async (c) => {
  const pipelines = await pipelinesService.getAll();

  return c.json(pipelines);
});

pipelinesRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const pipeline = await pipelinesService.create(body);

  return c.json(pipeline, 201);
});

pipelinesRoutes.put("/", async (c) => {
  const body = await c.req.json();
  const existing = await pipelinesService.getById(body.id);
  if (existing) {
    const { id: _, ...patch } = body;
    const updated = await pipelinesService.update(body.id, patch);

    return c.json(updated);
  }
  const pipeline = await pipelinesService.create(body);

  return c.json(pipeline, 201);
});

pipelinesRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const pipeline = await pipelinesService.getById(id);
  if (!pipeline) return c.json({ error: "Pipeline not found" }, 404);

  return c.json(pipeline);
});

pipelinesRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const pipeline = await pipelinesService.update(id, body);

  return c.json(pipeline);
});

pipelinesRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await pipelinesService.getById(id);
  if (!existing) return c.json({ error: "Pipeline not found" }, 404);
  await pipelinesService.delete(id);

  return c.body(null, 204);
});

pipelinesRoutes.post("/:id/propose-operations", async (c) => {
  const id = c.req.param("id");
  const bodyResult = await ResultAsync.fromPromise(
    c.req.json() as Promise<unknown>,
    () => undefined,
  );
  const body = bodyResult.unwrapOr(undefined);
  const parsed = ProposeOperationsBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const result = await pipelinesService.proposeOperations({
    pipelineId: id,
    snapshot: parsed.data.snapshot,
    message: parsed.data.message,
    pipelineName: parsed.data.pipelineName,
  });

  return c.json(result);
});

pipelinesRoutes.post("/:id/run", async (c) => {
  const id = c.req.param("id");
  const pipeline = await pipelinesService.getById(id);
  if (!pipeline) return c.json({ error: "Pipeline not found" }, 404);

  const bodyResult = await ResultAsync.fromPromise(
    c.req.json() as Promise<Record<string, unknown>>,
    () => undefined,
  );
  const body = bodyResult.unwrapOr({});
  const inputPath = (body as Record<string, unknown>).inputPath as string | undefined;
  const githubToken = (body as Record<string, unknown>).githubToken as string | undefined;

  const result = await pipelineRunnerService.startRun({
    pipelineId: id,
    inputPath,
    githubToken,
  });

  if (result.isErr()) {
    return c.json({ error: result.error.message }, 404);
  }

  return c.json({ jobId: result.value.jobId }, 202);
});
