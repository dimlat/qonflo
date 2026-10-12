import { useState } from "react";
import { deleteTask, getAuditLogs, updateTaskStatus } from "../api";
import { formatAuditLine, formatTimestamp } from "../format";
import { nextStatus, STATUS_LABEL } from "../status";
import type { AuditLog, Task } from "../types";

type Props = {
  task: Task;
  actors: string[];
  onChanged: () => Promise<void>;
};

export function TaskCard({ task, actors, onChanged }: Props) {
  const upcoming = nextStatus(task.status);
  const [actor, setActor] = useState(actors[0] ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  async function loadHistory() {
    setLogsLoading(true);
    setLogsError(null);
    try {
      setLogs(await getAuditLogs(task.id));
    } catch (err) {
      setLogsError(err instanceof Error ? err.message : "Could not load history");
    } finally {
      setLogsLoading(false);
    }
  }

  async function handleMove() {
    if (!upcoming || !actor) return;
    setError(null);
    setBusy(true);
    try {
      await updateTaskStatus(task.id, upcoming, actor);
      await onChanged();
      if (historyOpen) {
        await loadHistory();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setBusy(true);
    try {
      await deleteTask(task.id);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete task");
      setBusy(false);
    }
  }

  async function toggleHistory() {
    const nextOpen = !historyOpen;
    setHistoryOpen(nextOpen);
    if (nextOpen) {
      await loadHistory();
    }
  }

  return (
    <article className="card task-card">
      <div className="task-heading">
        <h2>{task.title}</h2>
        <span className={`status status-${task.status}`}>{STATUS_LABEL[task.status]}</span>
      </div>
      {task.description ? <p className="description">{task.description}</p> : null}
      <p className="meta">Updated {formatTimestamp(task.updatedAt)}</p>

      {upcoming ? (
        <div className="task-actions">
          <label>
            Actor
            <select value={actor} onChange={(event) => setActor(event.target.value)} disabled={busy}>
              {actors.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={handleMove} disabled={busy || actors.length === 0}>
            Move to {STATUS_LABEL[upcoming]}
          </button>
        </div>
      ) : null}

      <div className="task-actions">
        {confirmingDelete ? (
          <>
            <span>Delete this task? Its history will be kept.</span>
            <button type="button" className="danger" onClick={handleDelete} disabled={busy}>
              Delete
            </button>
            <button type="button" className="ghost" onClick={() => setConfirmingDelete(false)} disabled={busy}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="ghost" onClick={() => setConfirmingDelete(true)} disabled={busy}>
            Delete
          </button>
        )}
        <button type="button" className="ghost" onClick={toggleHistory} aria-expanded={historyOpen}>
          {historyOpen ? "Hide history" : "History"}
        </button>
      </div>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {historyOpen ? (
        <div className="history">
          {logsLoading ? <p>Loading history…</p> : null}
          {logsError ? (
            <p className="error" role="alert">
              {logsError}
            </p>
          ) : null}
          {logs && logs.length === 0 ? <p>Status has not changed yet.</p> : null}
          {logs && logs.length > 0 ? (
            <ol>
              {logs.map((log) => (
                <li key={log.id}>{formatAuditLine(log)}</li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
