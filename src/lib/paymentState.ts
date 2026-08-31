export type PaymentOutcome = 'settled' | 'failed' | 'pending';

const SETTLED_PAYMENT_STATUSES = new Set(['paid', 'completed']);
const FAILED_PAYMENT_STATUSES = new Set(['failed', 'declined', 'cancelled', 'canceled']);

const normalizePaymentStatus = (status: string | null | undefined): string =>
  status?.trim().toLowerCase() ?? '';

export const getPaymentOutcome = (status: string | null | undefined): PaymentOutcome => {
  const normalized = normalizePaymentStatus(status);
  if (SETTLED_PAYMENT_STATUSES.has(normalized)) return 'settled';
  if (FAILED_PAYMENT_STATUSES.has(normalized)) return 'failed';
  return 'pending';
};

export const isPaymentSettled = (status: string | null | undefined): boolean =>
  getPaymentOutcome(status) === 'settled';

export interface KitchenPaymentGate {
  payment_status: string | null;
  payment_method: string | null;
  order_channel: string | null;
}

export const isKitchenEligible = (order: KitchenPaymentGate): boolean =>
  isPaymentSettled(order.payment_status) ||
  order.payment_method !== 'card' ||
  order.order_channel === 'voice';
