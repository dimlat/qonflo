import { HttpError } from "../errors";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 500;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function parseCreateTask(body: unknown): { title: string; description: string } {
  const record = asRecord(body);
  const title = record?.title;
  if (typeof title !== "string" || title.trim().length === 0) {
    throw new HttpError(400, "Title is required");
  }
  const trimmedTitle = title.trim();
  if (trimmedTitle.length > TITLE_MAX) {
    throw new HttpError(400, "Title must be at most 120 characters");
  }

  const description = record?.description;
  if (description === undefined || description === null) {
    return { title: trimmedTitle, description: "" };
  }
  if (typeof description !== "string") {
    throw new HttpError(400, "Description must be a string");
  }
  const trimmedDescription = description.trim();
  if (trimmedDescription.length > DESCRIPTION_MAX) {
    throw new HttpError(400, "Description must be at most 500 characters");
  }
  return { title: trimmedTitle, description: trimmedDescription };
}

export function readStatusRequest(body: unknown): { status: unknown; actor: unknown } {
  const record = asRecord(body);
  return { status: record?.status, actor: record?.actor };
}

function asRecord(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  return body as Record<string, unknown>;
}
