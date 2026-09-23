/** Tiny API gateway emulating Supabase's Kong routes: /auth/v1, /rest/v1, /storage/v1. */
import { createServer, request as httpRequest } from "node:http";

type Routes = Record<string, number>; // prefix -> upstream port

export function startGateway(port: number, routes: Routes) {
  const server = createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": req.headers.origin ?? "*",
        "access-control-allow-credentials": "true",
        "access-control-allow-headers":
          req.headers["access-control-request-headers"] ??
          "authorization,apikey,content-type,x-client-info",
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
        "access-control-max-age": "86400",
      });
      return res.end();
    }
    const url = req.url ?? "/";
    const prefix = Object.keys(routes).find(
      (p) => url === p || url.startsWith(`${p}/`) || url.startsWith(`${p}?`),
    );
    if (!prefix) {
      res.writeHead(404, { "content-type": "application/json" });
      return res.end(JSON.stringify({ message: "no route" }));
    }
    const upstream = httpRequest(
      {
        host: "127.0.0.1",
        port: routes[prefix],
        method: req.method,
        path: url.slice(prefix.length) || "/",
        headers: { ...req.headers, host: `127.0.0.1:${routes[prefix]}` },
      },
      (up) => {
        const headers = {
          ...up.headers,
          "access-control-allow-origin": req.headers.origin ?? "*",
          "access-control-allow-credentials": "true",
        };
        res.writeHead(up.statusCode ?? 502, headers);
        up.pipe(res);
      },
    );
    upstream.on("error", (err) => {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: `upstream error: ${err.message}` }));
    });
    req.pipe(upstream);
  });
  server.listen(port);
  return server;
}
