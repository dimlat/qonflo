import type { AuditLog } from "./types";

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatAuditLine(log: AuditLog): string {
  return `User "${log.actor}" changed Task "${log.taskTitle}" status from "${log.fromStatus}" to "${log.toStatus}" at ${formatTimestamp(log.createdAt)}`;
}
