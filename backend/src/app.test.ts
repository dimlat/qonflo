import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { createApp } from "./app";
import { JsonStore } from "./store/json-store";

type Ctx = {
  base: string;
  dir: string;
  server: Server;
  tasksPath: string;
  logsPath: string;
};

describe("task API", () => {
  let ctx: Ctx;

  before(async () => {
    ctx = await start();
  });

  after(async () => {
    await close(ctx);
  });

  it("creates a to_do task and does not write an audit log", async () => {
    const created = await send(ctx, "/api/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "  Prepare Invoice  ", description: "  March  ", status: "done" }),
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.title, "Prepare Invoice");
    assert.equal(created.body.description, "March");
    assert.equal(created.body.status, "to_do");
    assert.equal(created.body.createdAt, created.body.updatedAt);

    const logs = await send(ctx, `/api/tasks/${created.body.id}/audit-logs`);
    assert.equal(logs.status, 200);
    assert.deepEqual(logs.body.logs, []);
  });

  it("rejects an empty title", async () => {
    const response = await send(ctx, "/api/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "   " }),
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Title is required");
  });

  it("lists tasks newest first", async () => {
    const first = await send(ctx, "/api/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "Older task" }),
    });
    await delay(5);
    const second = await send(ctx, "/api/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "Newer task" }),
    });
    const list = await send(ctx, "/api/tasks");
    const titles = list.body.tasks.map((task: { title: string }) => task.title);
    const newerIndex = titles.indexOf("Newer task");
    const olderIndex = titles.indexOf("Older task");
    assert.ok(newerIndex >= 0 && olderIndex >= 0);
    assert.ok(newerIndex < olderIndex);
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
  });

  it("advances status one step at a time and keeps every log", async () => {
    const created = await send(ctx, "/api/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "Ship report", description: "" }),
    });
    const id = created.body.id as string;
    const steps = ["pending", "in_progress", "done"] as const;
    const actors = ["john.doe", "jane.doe", "alex.kim"] as const;

    for (let index = 0; index < steps.length; index += 1) {
      const updated = await send(ctx, `/api/tasks/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: steps[index], actor: actors[index] }),
      });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.status, steps[index]);
    }

    const logs = await send(ctx, `/api/tasks/${id}/audit-logs`);
    assert.equal(logs.body.logs.length, 3);
    assert.deepEqual(
      logs.body.logs.map((log: { fromStatus: string; toStatus: string; actor: string; taskTitle: string }) => ({
        fromStatus: log.fromStatus,
        toStatus: log.toStatus,
        actor: log.actor,
        taskTitle: log.taskTitle,
      })),
      [
        { fromStatus: "to_do", toStatus: "pending", actor: "john.doe", taskTitle: "Ship report" },
        { fromStatus: "pending", toStatus: "in_progress", actor: "jane.doe", taskTitle: "Ship report" },
        { fromStatus: "in_progress", toStatus: "done", actor: "alex.kim", taskTitle: "Ship report" },
      ],
    );
    const times = logs.body.logs.map((log: { createdAt: string }) => log.createdAt);
    assert.deepEqual([...times].sort(), times);
  });

  it("does not write a log when the status is unchanged", async () => {
    const created = await send(ctx, "/api/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "Same status" }),
    });
    const id = created.body.id as string;
    const moved = await send(ctx, `/api/tasks/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "pending", actor: "john.doe" }),
    });
    const again = await send(ctx, `/api/tasks/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "pending", actor: "jane.doe" }),
    });
    assert.equal(again.status, 200);
    assert.equal(again.body.updatedAt, moved.body.updatedAt);
    assert.equal(again.body.status, "pending");

    const logs = await send(ctx, `/api/tasks/${id}/audit-logs`);
    assert.equal(logs.body.logs.length, 1);
    assert.equal(logs.body.logs[0].actor, "john.doe");
  });

  it("rejects skipped, backward, and unknown statuses without changing data", async () => {
    const created = await send(ctx, "/api/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "Guarded task" }),
    });
    const id = created.body.id as string;
    const beforeLogs = await send(ctx, `/api/tasks/${id}/audit-logs`);

    const skipped = await send(ctx, `/api/tasks/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "in_progress", actor: "john.doe" }),
    });
    assert.equal(skipped.status, 400);
    assert.equal(skipped.body.error, "Status can only move one step forward");

    const unknown = await send(ctx, `/api/tasks/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "archived", actor: "john.doe" }),
    });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error, "Unknown status");

    await send(ctx, `/api/tasks/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "pending", actor: "john.doe" }),
    });
    await send(ctx, `/api/tasks/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "in_progress", actor: "john.doe" }),
    });
    await send(ctx, `/api/tasks/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "done", actor: "john.doe" }),
    });
    const backward = await send(ctx, `/api/tasks/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "pending", actor: "john.doe" }),
    });
    assert.equal(backward.status, 400);
    assert.equal(backward.body.error, "Status can only move one step forward");

    const current = await send(ctx, "/api/tasks");
    const task = current.body.tasks.find((item: { id: string }) => item.id === id);
    assert.equal(task.status, "done");
    const logs = await send(ctx, `/api/tasks/${id}/audit-logs`);
    assert.equal(logs.body.logs.length, beforeLogs.body.logs.length + 3);
  });

  it("rejects an unknown actor and leaves the log untouched", async () => {
    const created = await send(ctx, "/api/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "Actor check" }),
    });
    const id = created.body.id as string;
    const response = await send(ctx, `/api/tasks/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "pending", actor: "someone.else" }),
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Unknown actor");
    const logs = await send(ctx, `/api/tasks/${id}/audit-logs`);
    assert.deepEqual(logs.body.logs, []);
    const list = await send(ctx, "/api/tasks");
    const task = list.body.tasks.find((item: { id: string }) => item.id === id);
    assert.equal(task.status, "to_do");
  });

  it("keeps audit logs after the task is deleted", async () => {
    const created = await send(ctx, "/api/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "Temporary" }),
    });
    const id = created.body.id as string;
    await send(ctx, `/api/tasks/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "pending", actor: "john.doe" }),
    });
    const removed = await send(ctx, `/api/tasks/${id}`, { method: "DELETE" });
    assert.equal(removed.status, 204);
    assert.equal(removed.body, null);

    const list = await send(ctx, "/api/tasks");
    assert.equal(
      list.body.tasks.some((task: { id: string }) => task.id === id),
      false,
    );
    const logs = await send(ctx, `/api/tasks/${id}/audit-logs`);
    assert.equal(logs.status, 200);
    assert.equal(logs.body.logs.length, 1);
    assert.equal(logs.body.logs[0].taskTitle, "Temporary");
  });

  it("returns 404 when updating or deleting a missing task", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const updated = await send(ctx, `/api/tasks/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "pending", actor: "john.doe" }),
    });
    const removed = await send(ctx, `/api/tasks/${id}`, { method: "DELETE" });
    assert.equal(updated.status, 404);
    assert.equal(removed.status, 404);
  });

  it("returns an empty log list for an unknown uuid and 400 for a bad id", async () => {
    const unknown = await send(ctx, "/api/tasks/11111111-1111-4111-8111-111111111111/audit-logs");
    const bad = await send(ctx, "/api/tasks/not-a-uuid/audit-logs");
    assert.equal(unknown.status, 200);
    assert.deepEqual(unknown.body.logs, []);
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, "Invalid task id");
  });

  it("serves the predefined actors", async () => {
    const response = await send(ctx, "/api/actors");
    assert.deepEqual(response.body.actors, ["john.doe", "jane.doe", "alex.kim"]);
  });

  it("reloads tasks and logs from disk", async () => {
    const created = await send(ctx, "/api/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "Persisted" }),
    });
    const id = created.body.id as string;
    await send(ctx, `/api/tasks/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "pending", actor: "alex.kim" }),
    });

    const reloaded = new JsonStore(ctx.tasksPath, ctx.logsPath);
    await reloaded.load();
    const snapshot = await reloaded.snapshot();
    assert.equal(
      snapshot.tasks.some((task) => task.id === id && task.status === "pending"),
      true,
    );
    assert.equal(
      snapshot.logs.some((log) => log.taskId === id && log.toStatus === "pending"),
      true,
    );

    const tasksOnDisk = JSON.parse(await readFile(ctx.tasksPath, "utf8")) as unknown[];
    const logsOnDisk = JSON.parse(await readFile(ctx.logsPath, "utf8")) as unknown[];
    assert.ok(tasksOnDisk.length > 0);
    assert.ok(logsOnDisk.length > 0);
  });
});

async function start(): Promise<Ctx> {
  const dir = await mkdtemp(path.join(tmpdir(), "qonflo-"));
  const tasksPath = path.join(dir, "tasks.json");
  const logsPath = path.join(dir, "audit-logs.json");
  const store = new JsonStore(tasksPath, logsPath);
  await store.load();
  const server = createServer(createApp(store));
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a port");
  }
  return { base: `http://127.0.0.1:${address.port}`, dir, server, tasksPath, logsPath };
}

async function close(ctx: Ctx): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    ctx.server.close((error) => (error ? reject(error) : resolve()));
  });
  await rm(ctx.dir, { recursive: true, force: true });
}

async function send(
  ctx: Ctx,
  pathname: string,
  init?: RequestInit,
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${ctx.base}${pathname}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
