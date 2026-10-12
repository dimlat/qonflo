import { useCallback, useEffect, useState } from "react";
import { getActors, getTasks } from "./api";
import { CreateTaskForm } from "./components/CreateTaskForm";
import { TaskCard } from "./components/TaskCard";
import type { Task } from "./types";

export function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [actors, setActors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [nextTasks, nextActors] = await Promise.all([getTasks(), getActors()]);
    setTasks(nextTasks);
    setActors(nextActors);
  }, []);

  useEffect(() => {
    let active = true;
    reload()
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load tasks");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);

  async function handleChanged() {
    setError(null);
    await reload();
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1>Mini Task Manager</h1>
        <p>Track tasks and who changed their status.</p>
      </header>
      <CreateTaskForm onCreated={handleChanged} />
      {loading ? <p>Loading tasks…</p> : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && tasks.length === 0 ? <p className="empty">No tasks yet. Create one above.</p> : null}
      <section className="task-list" aria-label="Tasks">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} actors={actors} onChanged={handleChanged} />
        ))}
      </section>
    </main>
  );
}
