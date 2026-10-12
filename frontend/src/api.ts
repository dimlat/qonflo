import type { AuditLog, Task, TaskStatus } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

async function readError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // The body was empty or not JSON.
  }
  return response.statusText || "Request failed";
}

export function getTasks(): Promise<Task[]> {
  return request<{ tasks: Task[] }>("/api/tasks").then((body) => body.tasks);
}

export function getActors(): Promise<string[]> {
  return request<{ actors: string[] }>("/api/actors").then((body) => body.actors);
}

export function createTask(title: string, description: string): Promise<Task> {
  return request<Task>("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ title, description }),
  });
}

export function updateTaskStatus(taskId: string, status: TaskStatus, actor: string): Promise<Task> {
  return request<Task>(`/api/tasks/${taskId}/status`, {
    method: "PUT",
    body: JSON.stringify({ status, actor }),
  });
}

export function deleteTask(taskId: string): Promise<void> {
  return request<void>(`/api/tasks/${taskId}`, { method: "DELETE" });
}

export function getAuditLogs(taskId: string): Promise<AuditLog[]> {
  return request<{ logs: AuditLog[] }>(`/api/tasks/${taskId}/audit-logs`).then((body) => body.logs);
}
