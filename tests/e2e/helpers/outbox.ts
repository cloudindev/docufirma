import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = () => process.env.EMAIL_OUTBOX_DIR ?? join(process.cwd(), ".local-stack", "mail");

type OutboxEmail = { to: string; subject: string; tag: string; text: string; html: string };

/** Latest email sent to `to` (optionally with a given tag) from the local outbox. */
export async function waitForEmail(
  to: string,
  tag?: string,
  timeoutMs = 15_000,
): Promise<OutboxEmail> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const files = readdirSync(dir())
      .filter(
        (f) =>
          f.endsWith(".json") &&
          f.includes(`__${to.replace(/[^a-z0-9@._+-]/gi, "_")}`) &&
          (!tag || f.includes(`__${tag}__`)),
      )
      .sort();
    const last = files.at(-1);
    if (last) {
      const meta = JSON.parse(readFileSync(join(dir(), last), "utf8")) as Omit<OutboxEmail, "html">;
      return { ...meta, html: readFileSync(join(dir(), last.replace(/\.json$/, ".html")), "utf8") };
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No email for ${to} (${tag ?? "any"}) in outbox`);
}

export function extractSignLink(email: { html: string }): string {
  const match = email.html.match(/href="([^"]*\/sign\/[A-Za-z0-9_-]{43})"/);
  if (!match) throw new Error("sign link not found in email");
  return new URL(match[1].replace(/&amp;/g, "&")).pathname;
}
