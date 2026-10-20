/**
 * Checkout failure alerts.
 *
 * When a customer's checkout breaks, Kyle hears about it within minutes
 * (SMS + Telegram) instead of from Danny the next day. The website calls the
 * report_checkout_failure RPC, which raises one `order.checkout_error`
 * incident per stage with a cooldown, so a burst of failures is one alert.
 *
 * Reporting must never get in the customer's way: it is fire-and-forget,
 * time-boxed, and swallows every error.
 */

export type CheckoutFailureStage =
  | 'guest_session'
  | 'order_create'
  | 'payment_session'
  | 'payment_return'
  | 'unexpected';

export interface CheckoutAlertClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ error: unknown }>;
}

/** ASCII only, short: the text ends up in an SMS (GSM-7) and a Telegram line. */
export function cleanFailureMessage(message: unknown): string {
  const raw = message instanceof Error ? message.message : typeof message === 'string' ? message : '';
  return raw.replace(/[^ -~]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

export async function reportCheckoutFailure(
  client: CheckoutAlertClient,
  stage: CheckoutFailureStage,
  message?: unknown,
  orderId?: string | null,
  timeoutMs = 4000,
): Promise<boolean> {
  try {
    const call = Promise.resolve(client.rpc('report_checkout_failure', {
      p_stage: stage,
      p_message: cleanFailureMessage(message),
      p_order_id: orderId ?? null,
    }));
    const timeout = new Promise<{ error: unknown }>((resolve) =>
      setTimeout(() => resolve({ error: 'timeout' }), timeoutMs));
    const { error } = await Promise.race([call, timeout]);
    return !error;
  } catch {
    return false;
  }
}
