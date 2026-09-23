import {
  ArrowRight,
  BadgeCheck,
  BellRing,
  Check,
  Clock,
  Files,
  Fingerprint,
  Globe2,
  Lock,
  type LucideIcon,
  ScrollText,
  SearchCheck,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { HeroIllustration, StepIllustration } from "@/components/brand/illustrations";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import { getPackOffers, planOffer, trialCredits } from "@/lib/pricing";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

type Props = { locale: Locale };

export async function Hero({ locale }: Props) {
  const t = await getTranslations({ locale, namespace: "marketing" });
  const badges: { key: "eidas" | "tsa" | "gdpr" | "eu"; icon: LucideIcon }[] = [
    { key: "eidas", icon: BadgeCheck },
    { key: "tsa", icon: Clock },
    { key: "gdpr", icon: Lock },
    { key: "eu", icon: Globe2 },
  ];
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-[640px] bg-gradient-to-b from-bg-soft to-bg"
      />
      <div className="container-page grid items-center gap-12 pt-12 pb-16 sm:pt-20 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pt-24 lg:pb-24">
        {/* Hero copy renders visible without JS: it is the LCP element (no fade-in gate). */}
        <div className="space-y-7">
          <Badge className="py-1">
            <ShieldCheck strokeWidth={1.75} /> {t("hero.eyebrow")}
          </Badge>
          <h1 className="text-4xl leading-[1.12] text-balance sm:text-5xl lg:text-[3.5rem] lg:leading-[1.1]">
            {t("hero.title")}
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-ink-muted sm:text-xl">
            {t("hero.subtitle")}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/register">
                {t("hero.ctaPrimary")} <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/how-it-works">{t("hero.ctaSecondary")}</Link>
            </Button>
          </div>
          <p className="text-sm text-ink-muted">{t("hero.note", { credits: trialCredits() })}</p>
        </div>
        <Reveal delay={0.1}>
          <HeroIllustration className="mx-auto max-w-[520px]" />
        </Reveal>
      </div>
      <div className="container-page pb-16">
        <ul
          aria-label={t("badges.label")}
          className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-bg p-4 shadow-card sm:grid-cols-4 sm:p-5"
        >
          {badges.map(({ key, icon: Icon }) => (
            <li key={key} className="flex items-center gap-3 text-sm font-medium">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-bg-tint text-primary">
                <Icon className="size-4.5" strokeWidth={1.75} aria-hidden />
              </span>
              {t(`badges.${key}`)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export async function HowItWorksSection({ locale }: Props) {
  const t = await getTranslations({ locale, namespace: "marketing.steps" });
  const steps = [
    { key: "one", n: 1 },
    { key: "two", n: 2 },
    { key: "three", n: 3 },
  ] as const;
  return (
    <section id="how" className="section-y" aria-labelledby="how-title">
      <div className="container-page space-y-14">
        <SectionHeading
          id="how-title"
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
        />
        <ol className="grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.key} delay={i * 0.08} as="li" className="h-full list-none">
              <Card className="h-full space-y-5 p-6">
                <StepIllustration step={s.n} className="w-28" />
                <h3 className="text-xl">{t(`${s.key}.title`)}</h3>
                <p className="leading-relaxed text-ink-muted">{t(`${s.key}.body`)}</p>
              </Card>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

export async function FeaturesSection({ locale }: Props) {
  const t = await getTranslations({ locale, namespace: "marketing.features" });
  const items: {
    key: "biometric" | "timestamp" | "evidence" | "verification" | "multidoc" | "reminders";
    icon: LucideIcon;
  }[] = [
    { key: "biometric", icon: Fingerprint },
    { key: "timestamp", icon: Clock },
    { key: "evidence", icon: ScrollText },
    { key: "verification", icon: SearchCheck },
    { key: "multidoc", icon: Files },
    { key: "reminders", icon: BellRing },
  ];
  return (
    <section id="product" className="section-y bg-bg-soft" aria-labelledby="features-title">
      <div className="container-page space-y-14">
        <SectionHeading
          id="features-title"
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
        />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ key, icon: Icon }, i) => (
            <Reveal key={key} delay={(i % 3) * 0.06}>
              <Card interactive className="h-full space-y-4 p-6">
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-bg-tint text-primary">
                  <Icon className="size-5.5" strokeWidth={1.75} aria-hidden />
                </span>
                <h3 className="text-lg">{t(`${key}.title`)}</h3>
                <p className="leading-relaxed text-ink-muted">{t(`${key}.body`)}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export async function LegalSection({ locale }: Props) {
  const t = await getTranslations({ locale, namespace: "marketing.legal" });
  const points: { key: "unique" | "identify" | "control" | "integrity"; icon: LucideIcon }[] = [
    { key: "unique", icon: UserCheck },
    { key: "identify", icon: Fingerprint },
    { key: "control", icon: Lock },
    { key: "integrity", icon: ShieldCheck },
  ];
  return (
    <section className="section-y" aria-labelledby="legal-title">
      <div className="container-page">
        <div className="grid gap-12 rounded-xl bg-bg-soft p-6 sm:p-10 lg:grid-cols-[1fr_1.2fr] lg:p-14">
          <div className="space-y-5">
            <SectionHeading
              id="legal-title"
              align="left"
              eyebrow={t("eyebrow")}
              title={t("title")}
            />
            <p className="text-lg leading-relaxed text-ink-muted">{t("body")}</p>
            <p className="text-sm text-ink-muted">{t("disclaimer")}</p>
            <Button asChild variant="tertiary">
              <Link href={{ pathname: "/legal/[slug]", params: { slug: "signature-policy" } }}>
                {t("link")} <ArrowRight />
              </Link>
            </Button>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {points.map(({ key, icon: Icon }) => (
              <li key={key}>
                <Card className="h-full space-y-3 p-5">
                  <Icon className="size-5 text-primary" strokeWidth={1.75} aria-hidden />
                  <h3 className="text-base">{t(`points.${key}.title`)}</h3>
                  <p className="text-sm leading-relaxed text-ink-muted">
                    {t(`points.${key}.body`)}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export async function PricingSection({
  locale,
  headingAs = "h2",
}: Props & { headingAs?: "h1" | "h2" }) {
  const t = await getTranslations({ locale, namespace: "marketing.pricing" });
  const format = await getFormatter({ locale });
  const packs = await getPackOffers();
  const eur = (cents: number) => format.number(cents / 100, "eur");
  const features = [
    "credits",
    "biometric",
    "timestamp",
    "evidence",
    "multi",
    "reminders",
    "verification",
    "support",
  ] as const;

  // Keep heading levels sequential whether the section title is an h1 (pricing page) or h2.
  const PacksHeading = headingAs === "h1" ? "h2" : "h3";
  return (
    <section id="pricing" className="section-y" aria-labelledby="pricing-title">
      <div className="container-page space-y-14">
        <SectionHeading
          id="pricing-title"
          as={headingAs}
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
        />
        <Reveal>
          <Card className="mx-auto max-w-3xl overflow-hidden border-primary/25 ring-4 ring-primary-soft/60">
            <div className="grid gap-8 p-6 sm:p-10 md:grid-cols-[1fr_1.2fr]">
              <div className="space-y-5">
                <Badge variant="solid">{t("planName")}</Badge>
                <p className="flex items-baseline gap-1">
                  <span className="text-5xl font-semibold tracking-tight">
                    {eur(planOffer.priceCents)}
                  </span>
                  <span className="text-lg text-ink-muted">{t("perMonth")}</span>
                </p>
                <p className="text-sm text-ink-muted">
                  {t("planSummary", { credits: planOffer.credits })}
                </p>
                <Button asChild size="lg" className="w-full">
                  <Link href="/register">{t("cta")}</Link>
                </Button>
                <p className="text-center text-xs text-ink-muted">
                  {t("trialNote", { credits: trialCredits() })}
                </p>
              </div>
              <div>
                <p className="mb-4 text-sm font-semibold">{t("includes")}</p>
                <ul className="space-y-3">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm">
                      <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-success/12 text-success">
                        <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                      </span>
                      {t(`features.${f}`, { credits: planOffer.credits })}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        </Reveal>
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="space-y-2 text-center">
            <PacksHeading className="text-xl">{t("packsTitle")}</PacksHeading>
            <p className="text-ink-muted">{t("packsSubtitle")}</p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-3">
            {packs.map((p) => (
              <li key={p.slug}>
                <Card interactive className="h-full space-y-1 p-5 text-center">
                  <p className="font-medium">{t("packCredits", { credits: p.credits })}</p>
                  <p className="text-2xl font-semibold tracking-tight">{eur(p.priceCents)}</p>
                  <p className="text-xs text-ink-muted">
                    {t("packUnit", { price: eur(Math.round(p.priceCents / p.credits)) })}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
          <p className="text-center text-sm text-ink-muted">{t("whatIsSignature")}</p>
        </div>
      </div>
    </section>
  );
}

export async function FaqSection({ locale }: Props) {
  const t = await getTranslations({ locale, namespace: "marketing.faq" });
  const keys = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"] as const;
  return (
    <section id="faq" className="section-y bg-bg-soft" aria-labelledby="faq-title">
      <div className="container-page grid gap-10 lg:grid-cols-[1fr_1.6fr]">
        <SectionHeading id="faq-title" align="left" eyebrow={t("eyebrow")} title={t("title")} />
        <Card className="px-6 py-2">
          <Accordion type="single" collapsible>
            {keys.map((k) => (
              <AccordionItem key={k} value={k}>
                <AccordionTrigger>{t(`items.${k}.q`)}</AccordionTrigger>
                <AccordionContent>{t(`items.${k}.a`)}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Card>
      </div>
    </section>
  );
}

export async function FinalCta({ locale }: Props) {
  const t = await getTranslations({ locale, namespace: "marketing.cta" });
  return (
    <section className="section-y">
      <div className="container-page">
        <div className="relative overflow-hidden rounded-xl bg-primary px-6 py-14 text-center sm:px-12 sm:py-20">
          <div
            aria-hidden
            className="absolute -top-20 -left-20 size-72 rounded-full bg-white/10 blur-2xl"
          />
          <div
            aria-hidden
            className="absolute -right-10 -bottom-24 size-80 rounded-full bg-[#4F7BFF]/50 blur-3xl"
          />
          <div className="relative mx-auto max-w-2xl space-y-6">
            <h2 className="text-3xl text-balance text-white sm:text-4xl">{t("title")}</h2>
            <p className="text-lg text-white/85">{t("subtitle", { credits: trialCredits() })}</p>
            <Button
              asChild
              size="lg"
              className="bg-white text-primary shadow-none hover:bg-white/90"
            >
              <Link href="/register">
                {t("button")} <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
