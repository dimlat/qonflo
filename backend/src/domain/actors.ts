export const ACTORS = ["john.doe", "jane.doe", "alex.kim"] as const;

export type ActorId = (typeof ACTORS)[number];

export function isActor(value: unknown): value is ActorId {
  return typeof value === "string" && (ACTORS as readonly string[]).includes(value);
}
