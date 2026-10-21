import { CalendarClock } from 'lucide-react';
import type { KitchenOrder } from '@/hooks/useKitchenOrders';
import { formatCollectionTime, kitchenDueAt } from '@/lib/preorders';
import { PaymentStatusBadge } from './PaymentStatusBadge';

/** A pre-order that is not due yet: read-only, collection time first. */
export function PreorderCard({ order }: { order: KitchenOrder }) {
  const collect = formatCollectionTime(order.scheduled_for);
  const due = kitchenDueAt(order);
  const dueLabel = due ? formatCollectionTime(due.toISOString()) : '';
  const displayNumber = order.display_id ? String(order.display_id).padStart(4, '0') : order.id.slice(-4).toUpperCase();

  return (
    <div className="rounded-lg border-2 border-blue-500/60 bg-blue-500/5 p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-400">Collect at</p>
          <p className="text-2xl font-black tabular-nums">{collect}</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-lg">#{displayNumber}</p>
          <PaymentStatusBadge paymentStatus={order.payment_status} size="sm" />
        </div>
      </div>
      {dueLabel && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
          <CalendarClock className="w-3 h-3" /> Moves to Cooking at {dueLabel}
        </p>
      )}
      {order.customer_name && <p className="text-sm font-medium text-primary">{order.customer_name}</p>}
      <ul className="mt-2 space-y-1">
        {order.order_items.map((item) => (
          <li key={item.id} className="text-sm">
            <span className="font-bold">{item.quantity}x</span> {item.product_name || 'Unknown Item'}
          </li>
        ))}
      </ul>
      {order.special_notes && (
        <p className="mt-2 text-sm text-yellow-100 bg-yellow-500/10 rounded px-2 py-1">{order.special_notes}</p>
      )}
    </div>
  );
}
