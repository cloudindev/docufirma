import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "center",
  id,
  as: Heading = "h2",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "center" | "left";
  id?: string;
  as?: "h1" | "h2";
}) {
  return (
    <div className={cn("max-w-2xl space-y-4", align === "center" && "mx-auto text-center")}>
      {eyebrow ? (
        <p className="text-sm font-semibold tracking-wide text-primary">{eyebrow}</p>
      ) : null}
      <Heading
        id={id}
        className="text-3xl text-balance sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]"
      >
        {title}
      </Heading>
      {subtitle ? (
        <p className="text-lg leading-relaxed text-balance text-ink-muted">{subtitle}</p>
      ) : null}
    </div>
  );
}
