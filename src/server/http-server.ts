// oxlint-disable unicorn/prefer-add-event-listener, promise/avoid-new, promise/prefer-await-to-then, promise/always-return, no-await-in-loop, typescript/explicit-function-return-type, typescript/promise-function-async, adjacent-overload-signatures
/**
 * http-server.ts -- Node/bun portable HTTP + WebSocket server.
 *
 * Built on node:http (supported by both runtimes) and the `ws` library for
 * WebSocket server support (also compatible with Bun).
 */

import { once } from "node:events";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { WebSocketServer } from "ws";

// ---------------------------------------------------------------------------
// Response helper (defined first so startServer can use it)
// ---------------------------------------------------------------------------

/** Write a Web API Response to a Node ServerResponse. */
/**
 * Copy a Web API Response onto a Node ServerResponse. The body is read before
 * anything is written, so a failure surfaces to the caller as a rejection
 * (and becomes a 500) instead of an unhandled error that kills the process.
 */
async function writeNodeResponse(nodeRes: ServerResponse, webRes: Response): Promise<void> {
  const buf = await webRes.arrayBuffer();
  nodeRes.statusCode = webRes.status;
  const headerKeys = webRes.headers.keys();
  for (const key of headerKeys) {
    const value = webRes.headers.get(key);
    // Headers.get() returns string | null, so undefined check is redundant.
    if (value !== null) {
      nodeRes.setHeader(key, value);
    }
  }
  nodeRes.end(Buffer.from(buf));
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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, typescript/non-nullable-type-assertion-style
    const part = patternParts[index] as string;
    if (part.startsWith(":")) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion, typescript/non-nullable-type-assertion-style
      params[part.slice(1)] = decodeURIComponent(pathParts[index] as string);
    } else if (part !== pathParts[index]) {
      return undefined;
    }
  }

  return params;
}

/** HTTP methods a route answers. GET handlers also answer HEAD. */
function methodsOf(handlers: Record<string, unknown>): string[] {
  const methods = Object.keys(handlers).filter((name) => typeof handlers[name] === "function");
  return methods.includes("GET") && !methods.includes("HEAD") ? [...methods, "HEAD"] : methods;
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
  /** Address to bind. "0.0.0.0" accepts connections on every interface. */
  host: string;
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
  /** Stop listening and drop open connections. */
  close: () => Promise<void>;
}

/** Address a person can click. A wildcard bind is only reachable by a concrete name. */
const displayHost = (host: string): string => {
  if (host === "" || host === "0.0.0.0" || host === "::") {
    return "localhost";
  }
  return host.includes(":") ? `[${host}]` : host;
};

/** Start the HTTP/WS server. Returns the server URL after it begins listening. */
async function startServer(config: HttpServerConfig): Promise<AppServer> {
  const { host, onRequest, port, routes, websocket } = config;

  const server = createServer(async (nodeReq, nodeRes) => {
    try {
      const body = await collectBody(nodeReq);
      const request = toWebRequest(nodeReq, body);
      const url = new URL(request.url);
      const pathname = url.pathname;

      // Try explicit routes first
      let responded = false;
      // Methods supported by routes whose pattern matched, for a 405 response
      const allowedMethods = new Set<string>();
      for (const [pattern, handlers] of Object.entries(routes)) {
        const params = matchRoute(pattern, pathname);
        if (params === undefined) {
          continue;
        }
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- IncomingMessage.method is typed as string, defensive fallback
        const method = request.method ?? "GET";
        // HEAD is answered by the GET handler. Node omits the body for HEAD.
        const handler = handlers[method] ?? (method === "HEAD" ? handlers.GET : undefined);
        if (typeof handler === "function") {
          // Attach route params to the request context so handlers can
          // access them via the URL (they use new URL(req.url).pathname).
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion, typescript/no-unnecessary-type-assertion
          const response = await (handler as (req: Request) => Response | Promise<Response>)(
            request,
          );
          await writeNodeResponse(nodeRes, response);
          responded = true;
          break;
        }
        for (const allowed of methodsOf(handlers)) {
          allowedMethods.add(allowed);
        }
      }

      if (responded) {
        return;
      }

      if (allowedMethods.size > 0) {
        await writeNodeResponse(
          nodeRes,
          Response.json(
            { error: "Method not allowed" },
            { headers: { Allow: [...allowedMethods].join(", ") }, status: 405 },
          ),
        );
        return;
      }

      // Fall through to the fetch handler (SPA, WS upgrade detection, etc.)
      const response = await onRequest(request);
      if (response) {
        await writeNodeResponse(nodeRes, response);
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
  const wss = websocket ? new WebSocketServer({ noServer: true }) : undefined;
  if (websocket && wss) {
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
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        (ws as unknown as Record<string, unknown>).wsAuthData = authData;

        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const wssWs = ws as unknown as WebSocket;
        websocket.open(wssWs);

        wssWs.onmessage = (event: MessageEvent) => {
          // oxlint-disable-next-line typescript/no-unsafe-assignment
          const raw: unknown = event.data;
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          const data = typeof raw === "string" ? raw : Buffer.from(raw as ArrayBuffer);
          websocket.message(wssWs, data);
        };

        wssWs.onclose = () => {
          websocket.close(wssWs);
        };
      });
    });
  }

  return new Promise<AppServer>((resolve) => {
    server.listen(port, host, () => {
      const addr = server.address();
      const display = displayHost(host);
      const url =
        typeof addr === "object" && addr
          ? `http://${display}:${String(addr.port)}`
          : `http://${display}`;
      const close = async (): Promise<void> => {
        for (const client of wss?.clients ?? []) {
          client.terminate();
        }
        wss?.close();
        // close() only reports back through its callback or the 'close' event;
        // wait for the event so callers know the port is free again.
        const closed = once(server, "close");
        server.close();
        await closed;
      };
      resolve({ close, url });
    });
  });
}

export { type AppServer, type HttpServerConfig, type WebSocketHandlers, startServer };
