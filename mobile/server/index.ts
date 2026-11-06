import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import express from "express";
import { createApp } from "./app";
const dbPath = resolve(process.env.DB_PATH ?? ".data/buruburu.sqlite");
mkdirSync(dirname(dbPath), { recursive: true });
const { app, close } = createApp(dbPath);
if (process.env.NODE_ENV === "production") {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
}
const server = app.listen(
  Number(process.env.PORT ?? 3001),
  process.env.HOST ?? "127.0.0.1",
  () => console.log("Buruburu: servidor iniciado."),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      close();
      process.exit(0);
    }),
  );
