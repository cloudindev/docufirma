import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { isLocale } from "@/lib/i18n/routing";

export const alt = "DocuFirma";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : "es";
  const t = await getTranslations({ locale, namespace: "marketing" });
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "linear-gradient(135deg, #F5F8FF 0%, #FFFFFF 60%, #DCE6FF 100%)",
        color: "#0B1B3F",
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 40, fontWeight: 700 }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            background: "#1F4FE0",
            display: "flex",
          }}
        />
        <span>
          Docu<span style={{ color: "#1F4FE0" }}>Firma</span>
        </span>
      </div>
      <div
        style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.1, maxWidth: 980 }}
      >
        {t("hero.title")}
      </div>
      <div style={{ display: "flex", gap: 20, fontSize: 26, color: "#5B6B8C" }}>
        <span>eIDAS</span>·<span>RFC 3161</span>·<span>RGPD</span>·<span>docufirma.es</span>
      </div>
    </div>,
    size,
  );
}
