import { Cpu, Fingerprint, FileCheck2, Hash, Send, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignatureIllustration } from "@/components/brand/illustrations";
import { Reveal } from "@/components/marketing/reveal";
import { SectionHeading } from "@/components/marketing/section-heading";
import { FinalCta, HowItWorksSection } from "@/components/marketing/sections";
import { Card } from "@/components/ui/card";
import { resolveLocale } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/how-it-works">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "marketing.howItWorksPage" });
  return pageMetadata({
    href: "/how-it-works",
    locale,
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function HowItWorksPage({ params }: PageProps<"/[locale]/how-it-works">) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "marketing.howItWorksPage" });
  const columns = [
    { key: "sender", icon: Send, steps: "senderSteps" },
    { key: "signer", icon: UserRound, steps: "signerSteps" },
  ] as const;
  const behind = [
    { key: "hash", icon: Hash },
    { key: "biometric", icon: Fingerprint },
    { key: "pdf", icon: FileCheck2 },
    { key: "tsa", icon: Cpu },
  ] as const;

  return (
    <>
      <section className="bg-gradient-to-b from-bg-soft to-bg">
        <div className="container-page grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[1.2fr_1fr]">
          <SectionHeading as="h1" align="left" title={t("title")} subtitle={t("subtitle")} />
          <SignatureIllustration className="mx-auto max-w-sm" />
        </div>
      </section>
      <section className="section-y pt-0">
        <div className="container-page grid gap-6 md:grid-cols-2">
          {columns.map(({ key, icon: Icon, steps }) => (
            <Reveal key={key}>
              <Card className="h-full p-6 sm:p-8">
                <div className="mb-6 flex items-center gap-3">
                  <span className="inline-flex size-11 items-center justify-center rounded-xl bg-bg-tint text-primary">
                    <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                  </span>
                  <h2 className="text-2xl">{t(key)}</h2>
                </div>
                <ol className="space-y-5">
                  {(["s1", "s2", "s3"] as const).map((s, i) => (
                    <li key={s} className="flex gap-4">
                      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
                        {i + 1}
                      </span>
                      <p className="pt-1 leading-relaxed text-ink-muted">{t(`${steps}.${s}`)}</p>
                    </li>
                  ))}
                </ol>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>
      <section className="section-y bg-bg-soft" aria-labelledby="behind-title">
        <div className="container-page space-y-12">
          <SectionHeading id="behind-title" title={t("behindTitle")} />
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {behind.map(({ key, icon: Icon }) => (
              <li key={key}>
                <Card className="h-full space-y-3 p-5">
                  <Icon className="size-5 text-primary" strokeWidth={1.75} aria-hidden />
                  <p className="text-sm leading-relaxed text-ink-muted">{t(`behind.${key}`)}</p>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <HowItWorksSection locale={locale} />
      <FinalCta locale={locale} />
    </>
  );
}
