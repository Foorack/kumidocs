// oxlint-disable promise/avoid-new, promise/catch-or-return, promise/prefer-await-to-then, promise/always-return, eslint/id-length, unicorn/prefer-add-event-listener, typescript/explicit-function-return-type, typescript/no-unsafe-type-assertion, typescript/non-nullable-type-assertion-style, typescript/no-unnecessary-condition, typescript/no-unnecessary-type-assertion, typescript/no-floating-promises, typescript/promise-function-async, promise/no-floating-promises, no-await-in-loop, no-use-before-define, adjacent-overload-signatures
/**
 * http-server.ts -- Node/bun portable HTTP + WebSocket server.
 *
 * Built on node:http (supported by both runtimes) and the `ws` library for
 * WebSocket server support (also compatible with Bun).
 */

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { WebSocketServer } from "ws";

// ---------------------------------------------------------------------------
// Response helper (defined first so startServer can use it)
// ---------------------------------------------------------------------------

/** Write a Web API Response to a Node ServerResponse. */
function writeNodeResponse(nodeRes: ServerResponse, webRes: Response): void {
  nodeRes.statusCode = webRes.status;
  const headerKeys = webRes.headers.keys();
  for (const key of headerKeys) {
    const value = webRes.headers.get(key);
    if (value !== undefined && value !== null) {
      nodeRes.setHeader(key, value);
    }
  }
  void webRes.arrayBuffer().then((buf: ArrayBuffer) => {
    nodeRes.end(Buffer.from(buf));
  });
}

// ---------------------------------------------------------------------------
// Request bridge: IncomingMessage -> Web API Request
// ---------------------------------------------------------------------------

/** Read the full body from an IncomingMessage stream. */
function collectBody(msg: IncomingMessage): Promise<Buffer> {
  // oxlint-disable-next-line no-new-promise
  return new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    msg.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    msg.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
  });
}

/** Convert a Node IncomingMessage + body Buffer to a Web API Request. */
function toWebRequest(msg: IncomingMessage, body: Buffer): Request {
  const url = new URL(msg.url ?? "/", `http://${msg.headers.host ?? "localhost"}`);
  const headers = new Headers();

  for (const [key, value] of Object.entries(msg.headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const v of value) {
        headers.append(key, v);
      }
    } else {
      headers.set(key, value);
    }
  }

  const init: RequestInit & { duplex: "half" } = {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    body: body.length > 0 ? (body as unknown as BodyInit) : undefined,
    duplex: "half",
    headers,
    method: msg.method ?? "GET",
  };

  return new Request(url.toString(), init);
}

// ---------------------------------------------------------------------------
// URL pattern matching (simple :param support)
// ---------------------------------------------------------------------------

/** Match a route pattern like "/api/files/:path" against a pathname.
 *  Returns captured params or undefined if no match. */
function matchRoute(pattern: string, pathname: string): Record<string, string> | undefined {
  const patternParts = pattern.split("/");
  const pathParts = pathname.split("/");

  if (patternParts.length !== pathParts.length) {
    return undefined;
  }

  const params: Record<string, string> = {};
  for (let index = 0; index < patternParts.length; index++) {
    const part = patternParts[index] as string;
    if (part.startsWith(":")) {
      params[part.slice(1)] = decodeURIComponent(pathParts[index] as string);
    } else if (part !== pathParts[index]) {
      return undefined;
    }
  }

  return params;
}

// ---------------------------------------------------------------------------
// Server entry point
// ---------------------------------------------------------------------------

interface WebSocketHandlers {
  close: (ws: WebSocket) => void;
  message: (ws: WebSocket, data: string | Buffer) => void;
  open: (ws: WebSocket) => void;
  /** Called before WS upgrade. Return arbitrary data to attach to the
   *  connection, or undefined to reject the upgrade (sends 401). */
  authenticate?: (req: Request) => Record<string, unknown> | undefined;
}

interface HttpServerConfig {
  port: number;
  /** Called for every request that doesn't match a route. Return a Response to
   *  send it, or undefined for a 404. */
  onRequest: (req: Request) => Promise<Response | undefined>;
  /** Route map: path pattern -> { method: handler }. Handlers receive the web
   *  Request and return a Response. */
  routes: Record<string, Record<string, unknown>>;
  /** Optional WebSocket handlers. */
  websocket?: WebSocketHandlers;
}

interface AppServer {
  url: string;
}

/** Start the HTTP/WS server. Returns the server URL after it begins listening. */
async function startServer(config: HttpServerConfig): Promise<AppServer> {
  const { onRequest, port, routes, websocket } = config;

  const server = createServer(async (nodeReq, nodeRes) => {
    try {
      const body = await collectBody(nodeReq);
      const request = toWebRequest(nodeReq, body);
      const url = new URL(request.url);
      const pathname = url.pathname;

      // Try explicit routes first
      let responded = false;
      for (const [pattern, handlers] of Object.entries(routes)) {
        const params = matchRoute(pattern, pathname);
        if (params === undefined) {
          continue;
        }
        const method = request.method ?? "GET";
        const handler = (handlers as Record<string, unknown>)[method];
        if (typeof handler === "function") {
          // Attach route params to the request context so handlers can
          // access them via the URL (they use new URL(req.url).pathname).
          const response = await (handler as (req: Request) => Response | Promise<Response>)(
            request,
          );
          writeNodeResponse(nodeRes, response);
          responded = true;
          break;
        }
      }

      if (responded) {
        return;
      }

      // Fall through to the fetch handler (SPA, WS upgrade detection, etc.)
      const response = await onRequest(request);
      if (response) {
        writeNodeResponse(nodeRes, response);
      } else {
        nodeRes.statusCode = 404;
        nodeRes.end("Not found");
      }
    } catch (error: unknown) {
      console.error("Request error:", error);
      nodeRes.statusCode = 500;
      nodeRes.end("Internal server error");
    }
  });

  // WebSocket via `ws` library
  if (websocket) {
    const wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (nodeReq, socket, head) => {
      const url = new URL(nodeReq.url ?? "/", `http://${nodeReq.headers.host ?? "localhost"}`);

      // Only handle /ws path; everything else is rejected
      if (url.pathname !== "/ws") {
        socket.destroy();
        return;
      }

      // Build a Request for the authenticate callback
      const req = new Request(url.toString(), {
        headers: Object.fromEntries(
          Object.entries(nodeReq.headers).map(([k, v]) => [
            k,
            Array.isArray(v) ? v.join(", ") : (v ?? ""),
          ]),
        ),
      });

      const authData = websocket.authenticate?.(req);
      if (!authData) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(nodeReq, socket, head, (ws) => {
        // The underlying socket is kept alive, but we're now in WS mode.
        // Store the auth data for the open handler.
        // oxlint-disable-next-line no-unsafe-type-assertion
        (ws as unknown as Record<string, unknown>).wsAuthData = authData;

        // oxlint-disable-next-line no-unsafe-type-assertion
        const wssWs = ws as unknown as WebSocket;
        websocket.open(wssWs);

        wssWs.onmessage = (event: MessageEvent) => {
          const data =
            typeof event.data === "string" ? event.data : Buffer.from(event.data as ArrayBuffer);
          websocket.message(wssWs, data);
        };

        wssWs.onclose = () => {
          websocket.close(wssWs);
        };
      });
    });
  }

  return new Promise<AppServer>((resolve) => {
    server.listen(port, () => {
      const addr = server.address();
      const host =
        typeof addr === "object" && addr ? `http://localhost:${addr.port}` : "http://localhost";
      resolve({ url: host });
    });
  });
}

export { type AppServer, type HttpServerConfig, type WebSocketHandlers, startServer };
