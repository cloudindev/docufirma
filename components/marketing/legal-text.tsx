import { Fragment, type ReactNode } from "react";

/**
 * Renders legal copy from messages/*.json with a tiny, safe subset of Markdown:
 * blank line = new paragraph, lines starting with "- " = bullet list, [label](href) = link.
 * Hrefs starting with "/" are internal and get the locale prefix. No HTML is interpreted.
 */
const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

function inline(text: string, locale: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const [whole, label, href] = match;
    const index = match.index ?? 0;
    if (index > last) out.push(text.slice(last, index));
    const internal = href!.startsWith("/");
    const external = /^https?:\/\//.test(href!);
    out.push(
      <a
        key={index}
        href={internal ? `/${locale}${href}` : href}
        className="font-medium text-primary underline-offset-4 hover:underline"
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {label}
      </a>,
    );
    last = index + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function LegalText({ text, locale }: { text: string; locale: string }) {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split("\n").map((l) => l.trim());
        if (lines.every((l) => l.startsWith("- "))) {
          return (
            <ul key={i} className="list-disc space-y-1.5 pl-5 leading-relaxed text-ink-muted">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.slice(2), locale)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="leading-relaxed text-ink-muted">
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l, locale)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}
