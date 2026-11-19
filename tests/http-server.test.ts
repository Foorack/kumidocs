import { describe, expect, it } from "bun:test";
import { startServer } from "@/server/http-server";

const pendingRequest = async (): Promise<undefined> => undefined;

describe("startServer", () => {
  it("binds the configured host", async () => {
    const server = await startServer({
      host: "127.0.0.1",
      onRequest: pendingRequest,
      port: 0,
      routes: {},
    });
    try {
      expect(new URL(server.url).hostname).toBe("127.0.0.1");
      const res = await fetch(`${server.url}/missing`);
      expect(res.status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("reports a clickable localhost URL for a wildcard bind", async () => {
    const server = await startServer({
      host: "0.0.0.0",
      onRequest: pendingRequest,
      port: 0,
      routes: {},
    });
    try {
      expect(new URL(server.url).hostname).toBe("localhost");
      const res = await fetch(`${server.url}/missing`);
      expect(res.status).toBe(404);
    } finally {
      await server.close();
    }
  });
});
