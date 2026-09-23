import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type * as React from "react";

export const colors = {
  primary: "#1F4FE0",
  ink: "#0B1B3F",
  muted: "#5B6B8C",
  border: "#E3E8F2",
  soft: "#F5F8FF",
  tint: "#EAF0FF",
  success: "#12B76A",
  danger: "#E5484D",
};

const font = "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function EmailLayout({
  lang,
  preview,
  logoUrl,
  appUrl,
  footer,
  footerNote,
  children,
}: {
  lang: string;
  preview: string;
  logoUrl?: string | null;
  appUrl: string;
  footer: string;
  footerNote?: string;
  children: React.ReactNode;
}) {
  return (
    <Html lang={lang}>
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: colors.soft,
          fontFamily: font,
          color: colors.ink,
          margin: 0,
          padding: "32px 12px",
        }}
      >
        <Container style={{ maxWidth: 560, margin: "0 auto" }}>
          <Section style={{ padding: "0 8px 20px" }}>
            {logoUrl ? (
              <Img
                src={logoUrl}
                alt=""
                height={40}
                style={{ maxHeight: 40, maxWidth: 200, objectFit: "contain" }}
              />
            ) : (
              <table role="presentation" cellPadding={0} cellSpacing={0}>
                <tbody>
                  <tr>
                    <td style={{ paddingRight: 10 }}>
                      <Img src={`${appUrl}/email-logo.png`} alt="" width={32} height={32} />
                    </td>
                    <td style={{ fontSize: 19, fontWeight: 600, color: colors.ink }}>
                      Docu<span style={{ color: colors.primary }}>Firma</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </Section>
          <Section
            style={{
              backgroundColor: "#ffffff",
              border: `1px solid ${colors.border}`,
              borderRadius: 16,
              padding: "36px 32px",
            }}
          >
            {children}
          </Section>
          {footerNote ? (
            <Text
              style={{
                fontSize: 12,
                lineHeight: "18px",
                color: colors.muted,
                padding: "16px 8px 0",
                margin: 0,
              }}
            >
              {footerNote}
            </Text>
          ) : null}
          <Hr style={{ borderColor: colors.border, margin: "20px 8px" }} />
          <Text style={{ fontSize: 12, color: colors.muted, padding: "0 8px", margin: 0 }}>
            {footer}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function EmailHeading({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontSize: 22,
        lineHeight: "30px",
        fontWeight: 600,
        margin: "0 0 12px",
        color: colors.ink,
      }}
    >
      {children}
    </Text>
  );
}

export function EmailText({
  children,
  muted = false,
  small = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
  small?: boolean;
}) {
  return (
    <Text
      style={{
        fontSize: small ? 13 : 16,
        lineHeight: small ? "20px" : "26px",
        color: muted ? colors.muted : colors.ink,
        margin: "0 0 16px",
      }}
    >
      {children}
    </Text>
  );
}

export function EmailButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Section style={{ margin: "24px 0" }}>
      <a
        href={href}
        style={{
          display: "inline-block",
          backgroundColor: colors.primary,
          color: "#ffffff",
          fontSize: 16,
          fontWeight: 600,
          textDecoration: "none",
          padding: "15px 28px",
          borderRadius: 999,
        }}
      >
        {children}
      </a>
    </Section>
  );
}

export function EmailBox({ children }: { children: React.ReactNode }) {
  return (
    <Section
      style={{
        backgroundColor: colors.soft,
        borderRadius: 12,
        padding: "16px 18px",
        margin: "0 0 20px",
      }}
    >
      {children}
    </Section>
  );
}
