import express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../platform/db.js";
import { logger } from "../platform/logger.js";
import { statusSchema } from "../cases/domain.js";
import {
  createCase,
  getCase,
  listCases,
  listCasesCursor,
  summarizeCases,
  changeStatus,
  history,
  notifications,
  HttpError,
} from "../cases/cases.js";
import { operations, delivery } from "../operations/operations.js";
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const supplied = req.header("x-correlation-id");
    const parsed = z.uuid().safeParse(supplied);
    res.locals.correlationId = parsed.success ? parsed.data : randomUUID();
    res.setHeader("x-correlation-id", res.locals.correlationId);
    next();
  });
  app.use(express.json({ limit: "16kb" }));
  app.get("/health/live", (_req, res) => res.json({ status: "ok" }));
  app.get("/health/ready", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({
        error: {
          code: "NOT_READY",
          message: "Database unavailable",
          correlationId: res.locals.correlationId,
        },
      });
    }
  });
  app.post("/api/cases", async (req, res) => {
    const body = z
      .object({
        title: z.string().trim().min(1).max(120),
        description: z.string().trim().min(1).max(2000),
      })
      .strict()
      .parse(req.body);
    const result = await createCase(body, res.locals.correlationId);
    logger.info({
      step: "case_created",
      caseId: result.id,
      correlationId: res.locals.correlationId,
    });
    res
      .status(201)
      .location("/api/cases/" + result.id)
      .json({ data: result });
  });
  app.get("/api/cases", async (req, res) => {
    const query = z
      .object({
        status: statusSchema.optional(),
        page: z.coerce.number().int().min(1).max(100000).optional(),
        pagination: z.enum(["offset", "cursor"]).default("offset"),
        cursor: z
          .string()
          .regex(/^[A-Za-z0-9_-]+$/)
          .max(512)
          .optional(),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
      })
      .strict()
      .parse(req.query);
    if (
      (query.pagination === "cursor" && query.page !== undefined) ||
      (query.pagination === "offset" && query.cursor !== undefined)
    ) {
      throw new HttpError(
        400,
        "INVALID_PAGINATION",
        "Do not mix cursor and offset pagination",
      );
    }
    res.json(
      query.pagination === "cursor"
        ? await listCasesCursor(query.status, query.pageSize, query.cursor)
        : await listCases(query.status, query.page ?? 1, query.pageSize),
    );
  });
  // Registered before /api/cases/:id so "summary" is not parsed as a case ID.
  app.get("/api/cases/summary", async (_req, res) =>
    res.json({ data: await summarizeCases() }),
  );
  app.get("/api/operations", async (_req, res) =>
    res.json({ data: await operations() }),
  );
  const id = (value: unknown) => z.uuid().parse(value);
  app.get("/api/cases/:id/delivery", async (req, res) =>
    res.json({ data: await delivery(id(req.params.id)) }),
  );
  app.get("/api/cases/:id", async (req, res) =>
    res.json({ data: await getCase(id(req.params.id)) }),
  );
  app.patch("/api/cases/:id/status", async (req, res) => {
    const body = z.object({ status: statusSchema }).strict().parse(req.body);
    const result = await changeStatus(
      id(req.params.id),
      body.status,
      res.locals.correlationId,
    );
    logger.info({
      step: "case_status_changed",
      caseId: result.id,
      status: result.status,
      correlationId: res.locals.correlationId,
    });
    res.json({ data: result });
  });
  app.get("/api/cases/:id/history", async (req, res) =>
    res.json({ data: await history(id(req.params.id)) }),
  );
  app.get("/api/cases/:id/notifications", async (req, res) =>
    res.json({ data: await notifications(id(req.params.id)) }),
  );
  app.use((_req, res) =>
    res.status(404).json({
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "Route not found",
        correlationId: res.locals.correlationId,
      },
    }),
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      void _next; // Express identifies error middleware by its four parameters.
      let status = 500,
        code = "INTERNAL_ERROR",
        message = "Unexpected error";
      if (error instanceof z.ZodError) {
        status = 400;
        code = "VALIDATION_ERROR";
        message = "Invalid input";
      } else if (error instanceof HttpError) {
        status = error.status;
        code = error.code;
        message = error.message;
      } else if (error instanceof SyntaxError) {
        status = 400;
        code = "INVALID_JSON";
        message = "Invalid JSON";
      } else if (
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        error.status === 413
      ) {
        status = 413;
        code = "PAYLOAD_TOO_LARGE";
        message = "Body exceeds 16kb";
      }
      logger.warn({
        step: "http_failure",
        code,
        correlationId: res.locals.correlationId,
      });
      res.status(status).json({
        error: {
          code,
          message,
          correlationId: res.locals.correlationId,
          ...(error instanceof z.ZodError
            ? {
                details: error.issues.map((issue) => ({
                  path: issue.path.join("."),
                  code: issue.code,
                })),
              }
            : {}),
        },
      });
    },
  );
  return app;
}
