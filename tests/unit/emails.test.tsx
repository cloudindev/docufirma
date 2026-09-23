import { render } from "@react-email/render";
import AccountNotice, { accountNoticeSubject } from "@/emails/account-notice";
import EnvelopeCompleted, { envelopeCompletedSubject } from "@/emails/envelope-completed";
import EnvelopeNotice, { envelopeNoticeSubject } from "@/emails/envelope-notice";
import SignerInvitation, { signerInvitationSubject } from "@/emails/signer-invitation";

const base = { appUrl: "https://docufirma.es" };

describe.each(["es", "en"] as const)("email templates (%s)", (locale) => {
  it("signer invitation and reminder", async () => {
    const props = {
      ...base,
      locale,
      signerName: "Lucía",
      senderName: "Carlos Pérez",
      title: "Contrato 2026",
      message: "Hola <script>alert(1)</script>",
      documents: ["a.pdf", "b.pdf"],
      expiresAt: "2026-10-23T10:00:00Z",
      signUrl: "https://docufirma.es/es/sign/abc",
    };
    const html = await render(<SignerInvitation {...props} />);
    expect(html).toContain("https://docufirma.es/es/sign/abc");
    expect(html).toContain("a.pdf");
    expect(html).not.toContain("<script>alert(1)</script>"); // user text is escaped
    expect(html).toContain(locale === "es" ? "Revisar y firmar" : "Review and sign");
    expect(signerInvitationSubject(props)).toContain("Contrato 2026");
    const reminder = await render(<SignerInvitation {...props} reminder />);
    expect(reminder).toContain(
      locale === "es" ? "Tu firma sigue pendiente" : "Your signature is still pending",
    );
  });

  it("sender notices", async () => {
    for (const kind of ["viewed", "declined", "expired"] as const) {
      const props = {
        ...base,
        locale,
        kind,
        title: "Contrato",
        signerName: "Ana",
        signerEmail: "ana@x.com",
        reason: "No",
        envelopeUrl: "https://x",
      };
      const html = await render(<EnvelopeNotice {...props} />);
      expect(html).toContain("Contrato");
      expect(envelopeNoticeSubject(props).length).toBeGreaterThan(5);
    }
  });

  it("completed email with and without timestamp", async () => {
    const props = {
      ...base,
      locale,
      audience: "signer" as const,
      recipientName: "Ana",
      title: "Contrato",
      verificationCode: "DF-AAAA-BBBB",
      verifyUrl: "https://docufirma.es/es/verificar?code=DF-AAAA-BBBB",
      files: [{ label: "PDF", url: "https://files/1" }],
      tsa: { authority: "Mensatek", genTime: "2026-09-23T10:00:00Z", serial: "0x01" },
    };
    expect(await render(<EnvelopeCompleted {...props} />)).toContain("DF-AAAA-BBBB");
    expect(await render(<EnvelopeCompleted {...props} tsa={null} />)).toContain(
      locale === "es" ? "se está aplicando" : "being applied",
    );
    expect(envelopeCompletedSubject(props)).toContain("Contrato");
  });

  it("account notices", async () => {
    for (const kind of ["welcome", "paymentFailed", "creditsLow"] as const) {
      const props = { ...base, locale, kind, name: "Ana", count: 2, ctaUrl: "https://x" };
      expect(await render(<AccountNotice {...props} />)).toContain("https://x");
      expect(accountNoticeSubject(props).length).toBeGreaterThan(5);
    }
  });
});
