import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app";
import { emptyGroup } from "../src/domain";
test("grupo compartido: autorización, dos clientes, conflicto y persistencia tras reinicio", async () => {
  const dir = mkdtempSync(join(tmpdir(), "buruburu-"));
  const path = join(dir, "test.sqlite");
  let instance = createApp(path);
  let server = instance.app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  let base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const send = (route: string, method = "GET", body?: unknown, token = "") =>
    fetch(base + route, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  try {
    const response = await send("/api/groups", "POST", emptyGroup());
    assert.equal(response.status, 201);
    const { id, token } = (await response.json()) as any;
    assert.equal((await send(`/api/groups/${id}`)).status, 404);
    assert.equal(
      (await send(`/api/groups/${id}`, "GET", undefined, "wrong")).status,
      404,
    );
    const group = { ...emptyGroup(), name: "Compartido" };
    const update = await send(
      `/api/groups/${id}`,
      "PUT",
      { revision: 0, group },
      token,
    );
    assert.equal(update.status, 200);
    const other = await send(`/api/groups/${id}`, "GET", undefined, token);
    assert.equal(((await other.json()) as any).group.name, "Compartido");
    assert.equal(
      (
        await send(
          `/api/groups/${id}`,
          "PUT",
          { revision: 0, group: { ...group, name: "Perdido" } },
          token,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await send(
          `/api/groups/${id}`,
          "PUT",
          { revision: 1, group: { ...group, currency: "INVALID" } },
          token,
        )
      ).status,
      400,
    );
    await new Promise<void>((r) => server.close(() => r()));
    instance.close();
    instance = createApp(path);
    server = instance.app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", () => r()));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const saved = await send(`/api/groups/${id}`, "GET", undefined, token);
    const data = (await saved.json()) as any;
    assert.equal(data.revision, 1);
    assert.equal(data.group.name, "Compartido");
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    instance.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
