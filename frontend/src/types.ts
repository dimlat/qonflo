export type TaskStatus = "to_do" | "pending" | "in_progress" | "done";

export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
};

export type AuditLog = {
  id: string;
  taskId: string;
  taskTitle: string;
  actor: string;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  createdAt: string;
};
