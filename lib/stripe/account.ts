import "server-only";
import { getStripe } from "./client";

/** Cancels every active subscription of a customer immediately (account deletion). */
export async function cancelSubscriptionsForDeletedAccount(customerId: string | null) {
  const stripe = getStripe();
  if (!stripe || !customerId) return;
  try {
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 20,
    });
    for (const sub of subs.data) {
      if (["active", "trialing", "past_due", "unpaid", "incomplete"].includes(sub.status)) {
        await stripe.subscriptions.cancel(sub.id, { invoice_now: false, prorate: false });
      }
    }
  } catch (error) {
    console.error("[stripe] could not cancel subscriptions on account deletion", error);
  }
}
