import cors from "cors";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { HttpError } from "./errors";
import { TaskService } from "./services/task-service";
import type { JsonStore } from "./store/json-store";

export function createApp(store: JsonStore) {
  const tasks = new TaskService(store);
  const app = express();

  app.disable("x-powered-by");
  app.use(cors());
  app.use(express.json());

  app.get("/api/actors", (_req, res) => {
    res.json({ actors: tasks.listActors() });
  });

  app.get(
    "/api/tasks",
    asyncHandler(async (_req, res) => {
      res.json({ tasks: await tasks.listTasks() });
    }),
  );

  app.post(
    "/api/tasks",
    asyncHandler(async (req, res) => {
      const task = await tasks.createTask(req.body);
      res.status(201).json(task);
    }),
  );

  app.get(
    "/api/tasks/:id/audit-logs",
    asyncHandler(async (req, res) => {
      res.json({ logs: await tasks.listAuditLogs(req.params.id) });
    }),
  );

  app.put(
    "/api/tasks/:id/status",
    asyncHandler(async (req, res) => {
      const task = await tasks.updateStatus(req.params.id, req.body);
      res.json(task);
    }),
  );

  app.delete(
    "/api/tasks/:id",
    asyncHandler(async (req, res) => {
      await tasks.deleteTask(req.params.id);
      res.status(204).send();
    }),
  );

  app.use(errorHandler);
  return app;
}

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
