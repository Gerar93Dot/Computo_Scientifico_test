import { groupSchema, emptyGroup, type Group } from "./domain";
export const LOCAL_KEY = "buruburu-local-v1";
export function readLocal(): Group {
  const raw = localStorage.getItem(LOCAL_KEY);
  return raw ? groupSchema.parse(JSON.parse(raw)) : emptyGroup();
}
export function writeLocal(group: Group) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(groupSchema.parse(group)));
}
export type Session = { id: string; token: string };
export type Snapshot = { revision: number; group: Group };
export async function request(
  path: string,
  session?: Session,
  body?: unknown,
  method?: string,
): Promise<any> {
  const r = await fetch(`/api${path}`, {
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  const data = await r
    .json()
    .catch(() => ({ error: "El servidor no está disponible." }));
  if (!r.ok) {
    const error = new Error(data.error ?? "No se pudo guardar.") as Error & {
      status: number;
    };
    error.status = r.status;
    throw error;
  }
  return data;
}
export function parseInvite(value: string): Session {
  const raw = value.includes("#") ? value.split("#")[1] : value;
  const parts = raw.replace(/^grupo=/, "").split(".");
  if (
    parts.length !== 2 ||
    !/^[a-f0-9]{24}$/.test(parts[0]) ||
    !/^[A-Za-z0-9_-]{43}$/.test(parts[1])
  )
    throw Error("El código de invitación no es válido.");
  return { id: parts[0], token: parts[1] };
}
