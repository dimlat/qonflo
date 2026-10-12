import { useState, type FormEvent } from "react";
import { createTask } from "../api";

type Props = {
  onCreated: () => Promise<void>;
};

export function CreateTaskForm({ onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await createTask(title, description);
      setTitle("");
      setDescription("");
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create task");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>New task</h2>
      <label>
        <span>Title</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          required
        />
      </label>
      <label>
        <span>
          Description <span className="optional">(optional)</span>
        </span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={500}
          rows={3}
        />
      </label>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create task"}
      </button>
    </form>
  );
}
