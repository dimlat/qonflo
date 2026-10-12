import type { TaskStatus } from "./types";

/** Mirrors backend/src/domain/status.ts. The API still rejects anything else. */
const NEXT_STATUS: Record<TaskStatus, TaskStatus | null> = {
  to_do: "pending",
  pending: "in_progress",
  in_progress: "done",
  done: null,
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  to_do: "To do",
  pending: "Pending",
  in_progress: "In progress",
  done: "Done",
};

export function nextStatus(status: TaskStatus): TaskStatus | null {
  return NEXT_STATUS[status];
}
