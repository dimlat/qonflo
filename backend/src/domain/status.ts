import { STATUSES, type TaskStatus } from "./types";

const NEXT_STATUS: Record<TaskStatus, TaskStatus | null> = {
  to_do: "pending",
  pending: "in_progress",
  in_progress: "done",
  done: null,
};

export type Transition =
  | { kind: "noop" }
  | { kind: "advance"; to: TaskStatus }
  | { kind: "rejected"; reason: "unknown" | "illegal" };

export function isStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

export function evaluateTransition(from: TaskStatus, to: unknown): Transition {
  if (!isStatus(to)) {
    return { kind: "rejected", reason: "unknown" };
  }
  if (to === from) {
    return { kind: "noop" };
  }
  if (NEXT_STATUS[from] === to) {
    return { kind: "advance", to };
  }
  return { kind: "rejected", reason: "illegal" };
}
