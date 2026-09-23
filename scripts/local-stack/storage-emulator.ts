/**
 * Minimal Supabase Storage API emulator for local development and e2e tests without Docker.
 * Implements the subset used by @supabase/storage-js in this app: upload, signed upload URLs,
 * signed download URLs (single and batch), authenticated download, info, remove and list.
 * Files live on disk under <root>/<bucket>/<path>; the content type is kept in a sidecar file.
 * Authorisation: the service role may do anything; other callers only through signed tokens.
 */
import {
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join, normalize } from "node:path";
import { signJwt, verifyJwt } from "./jwt";

type Options = { root: string; jwtSecret: string; port: number };

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "content-type": Buffer.isBuffer(body) ? "application/octet-stream" : "application/json",
    "access-control-allow-origin": "*",
    ...headers,
  });
  res.end(payload);
}

function error(res: ServerResponse, status: number, message: string) {
  send(res, status, { statusCode: String(status), error: message, message });
}

export function startStorageEmulator({ root, jwtSecret, port }: Options) {
  mkdirSync(root, { recursive: true });

  const filePath = (key: string) => {
    const p = normalize(join(root, key));
    if (!p.startsWith(normalize(root))) throw new Error("path traversal");
    return p;
  };

  const role = (req: IncomingMessage) => {
    const auth = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
    const claims = verifyJwt<{ role?: string }>(auth, jwtSecret);
    return claims?.role ?? null;
  };

  const store = async (req: IncomingMessage, key: string, upsert: boolean) => {
    const target = filePath(key);
    if (existsSync(target) && !upsert) return { conflict: true } as const;
    const raw = await readBody(req);
    let data = raw;
    let contentType =
      (req.headers["content-type"] as string | undefined) ?? "application/octet-stream";
    if (contentType.startsWith("multipart/form-data")) {
      const form = await new Request("http://local/upload", {
        method: "POST",
        headers: { "content-type": contentType },
        body: new Uint8Array(raw),
      }).formData();
      const file = [...form.values()].find((v): v is File => typeof v !== "string");
      if (!file) throw new Error("no file in form data");
      data = Buffer.from(await file.arrayBuffer());
      contentType = file.type || "application/octet-stream";
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
    writeFileSync(
      `${target}.__meta.json`,
      JSON.stringify({ contentType, size: data.length, updatedAt: new Date().toISOString() }),
    );
    return { conflict: false, size: data.length } as const;
  };

  const serveFile = (res: ServerResponse, key: string, download?: string | null) => {
    const target = filePath(key);
    if (!existsSync(target)) return error(res, 404, "Object not found");
    const meta = existsSync(`${target}.__meta.json`)
      ? (JSON.parse(readFileSync(`${target}.__meta.json`, "utf8")) as { contentType: string })
      : { contentType: "application/octet-stream" };
    const headers: Record<string, string> = {
      "content-type": meta.contentType,
      "cache-control": "no-store",
    };
    if (download !== null && download !== undefined) {
      const name = download || key.split("/").pop() || "file";
      headers["content-disposition"] = `attachment; filename="${encodeURIComponent(name)}"`;
    }
    send(res, 200, readFileSync(target), headers);
  };

  const server = createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,PUT,DELETE,HEAD,OPTIONS",
        });
        return res.end();
      }
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      const path = decodeURIComponent(url.pathname);
      const isService = role(req) === "service_role";

      // Signed download
      let m = path.match(/^\/object\/sign\/(.+)$/);
      if (m && req.method === "GET") {
        const claims = verifyJwt<{ url: string }>(url.searchParams.get("token") ?? "", jwtSecret);
        if (!claims || claims.url !== m[1]) return error(res, 400, "InvalidSignature");
        return serveFile(res, m[1], url.searchParams.get("download"));
      }
      // Create signed URL(s)
      if (m && req.method === "POST") {
        if (!isService) return error(res, 403, "Unauthorized");
        const body = JSON.parse((await readBody(req)).toString() || "{}") as {
          expiresIn: number;
          paths?: string[];
        };
        const exp = Math.floor(Date.now() / 1000) + Number(body.expiresIn ?? 60);
        if (body.paths) {
          const bucket = m[1];
          return send(
            res,
            200,
            body.paths.map((p) => {
              const key = `${bucket}/${p}`;
              const exists = existsSync(filePath(key));
              return {
                path: p,
                error: exists
                  ? null
                  : "Either the object does not exist or you do not have access to it",
                signedURL: exists
                  ? `/object/sign/${key}?token=${signJwt({ url: key, exp }, jwtSecret)}`
                  : null,
              };
            }),
          );
        }
        if (!existsSync(filePath(m[1]))) return error(res, 404, "Object not found");
        return send(res, 200, {
          signedURL: `/object/sign/${m[1]}?token=${signJwt({ url: m[1], exp }, jwtSecret)}`,
        });
      }

      // Signed upload URLs
      m = path.match(/^\/object\/upload\/sign\/(.+)$/);
      if (m && req.method === "POST") {
        if (!isService) return error(res, 403, "Unauthorized");
        const upsert = req.headers["x-upsert"] === "true";
        const exp = Math.floor(Date.now() / 1000) + 2 * 60 * 60;
        return send(res, 200, {
          url: `/object/upload/sign/${m[1]}?token=${signJwt({ url: m[1], upsert, exp }, jwtSecret)}`,
        });
      }
      if (m && req.method === "PUT") {
        const claims = verifyJwt<{ url: string; upsert?: boolean }>(
          url.searchParams.get("token") ?? "",
          jwtSecret,
        );
        if (!claims || claims.url !== m[1]) return error(res, 400, "InvalidSignature");
        const result = await store(req, m[1], Boolean(claims.upsert));
        if (result.conflict) return error(res, 409, "The resource already exists");
        return send(res, 200, { Key: m[1] });
      }

      m = path.match(/^\/object\/info\/(.+)$/);
      if (m && req.method === "GET") {
        if (!isService) return error(res, 403, "Unauthorized");
        const target = filePath(m[1]);
        if (!existsSync(target)) return error(res, 404, "Object not found");
        const st = statSync(target);
        return send(res, 200, {
          name: m[1],
          size: st.size,
          created_at: st.birthtime,
          updated_at: st.mtime,
        });
      }

      m = path.match(/^\/object\/list\/([^/]+)$/);
      if (m && req.method === "POST") {
        if (!isService) return error(res, 403, "Unauthorized");
        const body = JSON.parse((await readBody(req)).toString() || "{}") as { prefix?: string };
        const dir = filePath(`${m[1]}/${body.prefix ?? ""}`);
        const names = existsSync(dir)
          ? readdirSync(dir).filter((n) => !n.endsWith(".__meta.json"))
          : [];
        return send(
          res,
          200,
          names.map((name) => ({ name, id: name })),
        );
      }

      // Remove: DELETE /object/{bucket} {prefixes}
      m = path.match(/^\/object\/([^/]+)$/);
      if (m && req.method === "DELETE") {
        if (!isService) return error(res, 403, "Unauthorized");
        const body = JSON.parse((await readBody(req)).toString() || "{}") as { prefixes: string[] };
        const removed = body.prefixes.filter((p) => {
          const target = filePath(`${m![1]}/${p}`);
          if (!existsSync(target)) return false;
          rmSync(target, { force: true });
          rmSync(`${target}.__meta.json`, { force: true });
          return true;
        });
        return send(
          res,
          200,
          removed.map((name) => ({ name, bucket_id: m![1] })),
        );
      }

      // Upload (POST/PUT) and authenticated download (GET/HEAD)
      m = path.match(/^\/object\/(?:authenticated\/)?(.+)$/);
      if (m) {
        if (!isService) return error(res, 403, "Unauthorized");
        if (req.method === "POST" || req.method === "PUT") {
          const upsert = req.method === "PUT" || req.headers["x-upsert"] === "true";
          const result = await store(req, m[1], upsert);
          if (result.conflict) return error(res, 409, "The resource already exists");
          return send(res, 200, { Id: m[1], Key: m[1] });
        }
        if (req.method === "HEAD") {
          res.writeHead(existsSync(filePath(m[1])) ? 200 : 404);
          return res.end();
        }
        if (req.method === "GET") return serveFile(res, m[1], url.searchParams.get("download"));
      }

      if (path === "/bucket" && req.method === "GET") {
        return send(
          res,
          200,
          readdirSync(root).map((id) => ({ id, name: id, public: false })),
        );
      }
      return error(res, 404, `Not implemented in emulator: ${req.method} ${path}`);
    } catch (err) {
      console.error("[storage-emulator]", err);
      return error(res, 500, (err as Error).message);
    }
  });
  server.listen(port);
  return server;
}
