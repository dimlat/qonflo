import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuditLog, Task } from "../domain/types";

type Draft = {
  tasks: Task[];
  logs: AuditLog[];
};

/**
 * In-process JSON store.
 * Mutations run one at a time. A status change and its audit log are written
 * together; if the task file cannot be replaced, the previous log file is restored
 * and memory is left unchanged.
 */
export class JsonStore {
  private tasks: Task[] = [];
  private logs: AuditLog[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly tasksPath: string,
    private readonly logsPath: string,
  ) {}

  async load(): Promise<void> {
    await mkdir(path.dirname(this.tasksPath), { recursive: true });
    await mkdir(path.dirname(this.logsPath), { recursive: true });
    this.tasks = await readArray<Task>(this.tasksPath);
    this.logs = await readArray<AuditLog>(this.logsPath);
  }

  async snapshot(): Promise<Draft> {
    return this.enqueue(async () => structuredClone({ tasks: this.tasks, logs: this.logs }));
  }

  async mutate<T>(change: (draft: Draft) => T): Promise<T> {
    return this.enqueue(async () => {
      const draft: Draft = structuredClone({ tasks: this.tasks, logs: this.logs });
      const result = change(draft);
      const tasksChanged = JSON.stringify(draft.tasks) !== JSON.stringify(this.tasks);
      const logsChanged = JSON.stringify(draft.logs) !== JSON.stringify(this.logs);
      if (tasksChanged || logsChanged) {
        await this.persist(draft.tasks, draft.logs);
        this.tasks = draft.tasks;
        this.logs = draft.logs;
      }
      return structuredClone(result);
    });
  }

  private async persist(tasks: Task[], logs: AuditLog[]): Promise<void> {
    const tasksTemp = `${this.tasksPath}.tmp`;
    const logsTemp = `${this.logsPath}.tmp`;
    const tasksJson = `${JSON.stringify(tasks, null, 2)}\n`;
    const logsJson = `${JSON.stringify(logs, null, 2)}\n`;

    await writeFile(tasksTemp, tasksJson, "utf8");
    await writeFile(logsTemp, logsJson, "utf8");

    const previousLogs = await readFile(this.logsPath, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });

    await rename(logsTemp, this.logsPath);
    try {
      await rename(tasksTemp, this.tasksPath);
    } catch (error) {
      if (previousLogs === null) {
        await rm(this.logsPath, { force: true });
      } else {
        await writeFile(this.logsPath, previousLogs, "utf8");
      }
      await rm(tasksTemp, { force: true });
      throw error;
    }
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(job, job);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

async function readArray<T>(filePath: string): Promise<T[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`${filePath} must contain a JSON array`);
    }
    return parsed as T[];
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      await writeFile(filePath, "[]\n", "utf8");
      return [];
    }
    throw error;
  }
}
