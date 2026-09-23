import { createClient } from "@supabase/supabase-js";
import { type APIRequestContext, expect, test } from "@playwright/test";
import Stripe from "stripe";
import { registerAndOnboard, uniqueEmail } from "./helpers/auth";

/**
 * Webhook integration: events are signed locally with STRIPE_WEBHOOK_SECRET (no network to Stripe).
 * Verifies idempotency, subscription mirroring, monthly grants and pack purchases.
 */
test.describe("stripe webhook", () => {
  test.skip(
    !process.env.E2E_WITH_BACKEND || !process.env.STRIPE_WEBHOOK_SECRET,
    "requires backend + STRIPE_WEBHOOK_SECRET",
  );
  test.skip(({ isMobile }) => isMobile, "desktop only");

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_dummy");
  const admin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });

  const post = async (
    request: APIRequestContext,
    event: Record<string, unknown>,
    badSig = false,
  ) => {
    const payload = JSON.stringify(event);
    const header = await stripe.webhooks.generateTestHeaderStringAsync({
      payload,
      secret: badSig ? "whsec_wrong" : process.env.STRIPE_WEBHOOK_SECRET!,
    });
    return request.post("/api/stripe/webhook", {
      data: payload,
      headers: { "stripe-signature": header, "content-type": "application/json" },
    });
  };

  const evt = (type: string, object: Record<string, unknown>) => ({
    id: `evt_${type.replace(/\W/g, "_")}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    object: "event",
    type,
    api_version: "2026-08-26.dahlia",
    created: Math.floor(Date.now() / 1000),
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
  });

  test("subscription, monthly grant, pack purchase and idempotency", async ({ page, request }) => {
    const { email } = await registerAndOnboard(page, { firstName: "Paula" });
    const { data: profile } = await admin()
      .from("profiles")
      .select("id")
      .eq("email", email)
      .single();
    const userId = profile!.id as string;
    const customer = `cus_test_${Date.now()}`;
    const now = Math.floor(Date.now() / 1000);
    const periodEnd = now + 30 * 86400;

    expect((await post(request, evt("invoice.paid", {}), true)).status()).toBe(400);

    // Subscription created (links the customer through metadata.user_id).
    const sub = {
      id: `sub_${Date.now()}`,
      object: "subscription",
      customer,
      status: "active",
      cancel_at_period_end: false,
      canceled_at: null,
      metadata: { user_id: userId },
      items: {
        object: "list",
        data: [
          {
            id: "si_1",
            price: { id: "price_pro_local" },
            current_period_start: now,
            current_period_end: periodEnd,
          },
        ],
      },
    };
    expect((await post(request, evt("customer.subscription.created", sub))).ok()).toBeTruthy();

    // First invoice paid → 10 monthly credits.
    const invoiceEvent = evt("invoice.paid", {
      id: `in_${Date.now()}`,
      object: "invoice",
      customer,
      period_end: now,
      parent: {
        type: "subscription_details",
        subscription_details: { subscription: sub.id, metadata: { user_id: userId } },
      },
      lines: {
        object: "list",
        data: [
          {
            period: { start: now, end: periodEnd },
            pricing: { price_details: { price: "price_pro_local" } },
          },
        ],
      },
    });
    expect((await post(request, invoiceEvent)).ok()).toBeTruthy();
    const dup = await post(request, invoiceEvent);
    expect((await dup.json()).duplicate).toBe(true);

    // Pack purchase → +25 non-expiring credits.
    const { data: pack } = await admin()
      .from("credit_packs")
      .select("id, credits")
      .eq("slug", "pack-25")
      .single();
    const checkout = evt("checkout.session.completed", {
      id: `cs_${Date.now()}`,
      object: "checkout.session",
      mode: "payment",
      payment_status: "paid",
      customer,
      payment_intent: `pi_${Date.now()}`,
      metadata: { user_id: userId, kind: "pack", pack_id: pack!.id, credits: "25" },
    });
    expect((await post(request, checkout)).ok()).toBeTruthy();
    // Same payment re-delivered with a different event id is still granted once.
    expect((await post(request, { ...checkout, id: `${checkout.id}_again` })).ok()).toBeTruthy();

    await page.goto("/es/app/billing");
    await expect(page.getByText("Plan Pro", { exact: true })).toBeVisible();
    await expect(page.getByText("Activa", { exact: true })).toBeVisible();
    await expect(page.getByText("0 de 10 usadas")).toBeVisible();
    // 3 trial + 25 pack = 28 non-expiring; 10 monthly → 38 total
    await expect(page.getByText("38", { exact: true })).toBeVisible();
    await expect(page.getByText("28", { exact: true })).toBeVisible();
    await expect(page.getByText("10/10 este mes").first()).toBeVisible();

    // Payment failure → past_due banner.
    await post(request, evt("customer.subscription.updated", { ...sub, status: "past_due" }));
    await page.goto("/es/app");
    await expect(page.getByText(/No hemos podido cobrar tu suscripción/)).toBeVisible();
  });

  test("without enough credits → no-credits dialog → pack purchase → send", async ({
    page,
    request,
  }) => {
    const { email } = await registerAndOnboard(page);
    const { data: profile } = await admin()
      .from("profiles")
      .select("id")
      .eq("email", email)
      .single();
    const userId = profile!.id as string;

    await page.goto("/es/app/send");
    await page.locator("#wizard-files").setInputFiles(["tests/fixtures/anexo.pdf"]);
    await expect(page.getByText("anexo.pdf", { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Continuar" }).click();
    for (let i = 0; i < 4; i++) {
      if (i > 0) await page.getByRole("button", { name: "Añadir firmante" }).click();
      await page.locator(`#s-${i}-first`).fill(`Firmante${i}`);
      await page.locator(`#s-${i}-last`).fill("Prueba");
      await page.locator(`#s-${i}-email`).fill(uniqueEmail(`multi${i}`));
    }
    await page.getByRole("button", { name: "Revisar envío" }).click();
    await expect(page.getByText("Necesitas 4 firmas y tienes 3.")).toBeVisible();
    await page.getByRole("button", { name: "Enviar para firmar" }).click();
    await expect(page.getByRole("heading", { name: "No tienes firmas suficientes" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Comprar un pack" })).toBeVisible();
    await page.getByRole("button", { name: "Ahora no" }).click();

    // Stripe confirms the pack purchase (webhook).
    const { data: pack } = await admin()
      .from("credit_packs")
      .select("id")
      .eq("slug", "pack-25")
      .single();
    const res = await post(
      request,
      evt("checkout.session.completed", {
        id: `cs_${Date.now()}`,
        object: "checkout.session",
        mode: "payment",
        payment_status: "paid",
        customer: `cus_${Date.now()}`,
        payment_intent: `pi_${Date.now()}`,
        metadata: { user_id: userId, kind: "pack", pack_id: pack!.id, credits: "25" },
      }),
    );
    expect(res.ok()).toBeTruthy();

    await page.getByRole("button", { name: "Enviar para firmar" }).click();
    await expect(page).toHaveURL(/\/es\/app\/envelopes\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByText("24 firmas disponibles").first()).toBeVisible();
  });
});
