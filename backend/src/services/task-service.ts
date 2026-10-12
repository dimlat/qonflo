import { randomUUID } from "node:crypto";
import { ACTORS, isActor } from "../domain/actors";
import { evaluateTransition } from "../domain/status";
import type { AuditLog, Task, TaskStatus } from "../domain/types";
import { isUuid, parseCreateTask, readStatusRequest } from "../domain/validation";
import { HttpError } from "../errors";
import type { JsonStore } from "../store/json-store";

export class TaskService {
  constructor(private readonly store: JsonStore) {}

  listActors(): readonly string[] {
    return ACTORS;
  }

  async listTasks(): Promise<Task[]> {
    const { tasks } = await this.store.snapshot();
    return tasks.sort(byCreatedDesc);
  }

  async createTask(body: unknown): Promise<Task> {
    const { title, description } = parseCreateTask(body);
    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      title,
      description,
      status: "to_do",
      createdAt: now,
      updatedAt: now,
    };
    await this.store.mutate((draft) => {
      draft.tasks.push(task);
    });
    return structuredClone(task);
  }

  async updateStatus(taskId: string, body: unknown): Promise<Task> {
    const request = readStatusRequest(body);
    return this.store.mutate((draft) => {
      const task = draft.tasks.find((item) => item.id === taskId);
      if (!task) {
        throw new HttpError(404, "Task not found");
      }
      if (!isActor(request.actor)) {
        throw new HttpError(400, "Unknown actor");
      }
      const transition = evaluateTransition(task.status, request.status);
      if (transition.kind === "rejected") {
        const message =
          transition.reason === "unknown" ? "Unknown status" : "Status can only move one step forward";
        throw new HttpError(400, message);
      }
      if (transition.kind === "noop") {
        return task;
      }
      const now = new Date().toISOString();
      const fromStatus: TaskStatus = task.status;
      task.status = transition.to;
      task.updatedAt = now;
      const log: AuditLog = {
        id: randomUUID(),
        taskId: task.id,
        taskTitle: task.title,
        actor: request.actor,
        fromStatus,
        toStatus: transition.to,
        createdAt: now,
      };
      draft.logs.push(log);
      return task;
    });
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.store.mutate((draft) => {
      const index = draft.tasks.findIndex((item) => item.id === taskId);
      if (index === -1) {
        throw new HttpError(404, "Task not found");
      }
      draft.tasks.splice(index, 1);
    });
  }

  async listAuditLogs(taskId: string): Promise<AuditLog[]> {
    if (!isUuid(taskId)) {
      throw new HttpError(400, "Invalid task id");
    }
    const { logs } = await this.store.snapshot();
    return logs.filter((log) => log.taskId === taskId).sort(byCreatedAsc);
  }
}

function byCreatedDesc(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? 1 : -1;
  }
  return a.id < b.id ? 1 : -1;
}

function byCreatedAsc(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  return a.id < b.id ? -1 : 1;
}
