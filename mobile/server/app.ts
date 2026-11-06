import express from "express";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { groupSchema } from "../src/domain";
import { z } from "zod";
export function createApp(dbPath: string) {
  const db = new DatabaseSync(dbPath);
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL)",
  );
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "2mb" }));
  // Basic per-address limiter. Configure a trusted reverse proxy before public deployment.
  const hits = new Map<string, { at: number; count: number }>();
  app.use("/api", (req, res, next) => {
    const key = req.socket.remoteAddress ?? "unknown",
      now = Date.now();
    if (hits.size > 10000)
      for (const [k, v] of hits) if (now - v.at > 60000) hits.delete(k);
    const h = hits.get(key);
    if (!h || now - h.at > 60000) hits.set(key, { at: now, count: 1 });
    else if (++h.count > 240) {
      res
        .status(429)
        .json({ error: "Demasiadas solicitudes. Intenta en un minuto." });
      return;
    }
    next();
  });
  const hash = (s: string) => createHash("sha256").update(s).digest("hex");
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.post("/api/groups", (req, res) => {
    const parsed = groupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "El grupo no es válido." });
      return;
    }
    const id = randomBytes(12).toString("hex"),
      token = randomBytes(32).toString("base64url");
    db.prepare("INSERT INTO groups VALUES (?,?,?,?)").run(
      id,
      hash(token),
      0,
      JSON.stringify(parsed.data),
    );
    res.status(201).json({ id, token, revision: 0, group: parsed.data });
  });
  app.use("/api/groups/:id", (req, res, next) => {
    const row = db
      .prepare("SELECT * FROM groups WHERE id=?")
      .get(req.params.id) as
      | { id: string; token_hash: string; revision: number; data: string }
      | undefined;
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    if (
      !row ||
      !token ||
      !timingSafeEqual(Buffer.from(hash(token)), Buffer.from(row.token_hash))
    ) {
      res
        .status(404)
        .json({ error: "El grupo no existe o el código no es válido." });
      return;
    }
    res.locals.row = row;
    next();
  });
  app.get("/api/groups/:id", (_req, res) =>
    res.json({
      revision: res.locals.row.revision,
      group: JSON.parse(res.locals.row.data),
    }),
  );
  app.put("/api/groups/:id", (req, res) => {
    const body = z
      .object({ revision: z.number().int().nonnegative(), group: groupSchema })
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Los datos no son válidos." });
      return;
    }
    const r = db
      .prepare(
        "UPDATE groups SET data=?,revision=revision+1 WHERE id=? AND revision=?",
      )
      .run(JSON.stringify(body.data.group), req.params.id, body.data.revision);
    if (!r.changes) {
      res
        .status(409)
        .json({
          error:
            "Otra persona actualizó el grupo. Recarga los datos y vuelve a aplicar tu cambio.",
        });
      return;
    }
    res.json({ revision: body.data.revision + 1, group: body.data.group });
  });
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status = (err as { status?: number }).status;
      res
        .status(status === 413 ? 413 : 400)
        .json({
          error:
            status === 413
              ? "El archivo es demasiado grande."
              : "No se pudo procesar la solicitud.",
        });
    },
  );
  return { app, close: () => db.close() };
}
