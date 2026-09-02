import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Inbox } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { VerdictLevel } from '@/lib/insights';

/**
 * Every analytics panel gets the same four states — loading, error, empty and
 * populated — plus a freshness stamp. An empty state is a correct answer; a
 * plausible placeholder number is a defect.
 */

interface InsightPanelProps {
  title: string;
  description?: string;
  icon?: typeof AlertTriangle;
  isLoading: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyText: string;
  onRetry?: () => void;
  /** ISO timestamp or Date of the data; rendered as "as of HH:mm". */
  asOf?: Date | string | null;
  /** Optional caveat shown above the content, e.g. a window that includes the closure. */
  caveat?: string | null;
  children: ReactNode;
  className?: string;
}

function formatAsOf(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Dublin' });
}

export function InsightPanel({
  title,
  description,
  icon: Icon,
  isLoading,
  error,
  isEmpty,
  emptyText,
  onRetry,
  asOf,
  caveat,
  children,
  className = '',
}: InsightPanelProps) {
  const stamp = formatAsOf(asOf);

  return (
    <Card className={`bg-card border-border ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-lg">
              {Icon && <Icon className="h-5 w-5 text-primary" />}
              {title}
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {stamp && !isLoading && !error && (
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">as of {stamp}</span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && <div className="h-40 animate-pulse rounded-lg bg-secondary/30" />}

        {!isLoading && Boolean(error) && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">This panel could not load.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {error instanceof Error ? error.message : 'The data source did not respond.'} Nothing is estimated in its place.
              </p>
              {onRetry && (
                <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />Try again
                </Button>
              )}
            </div>
          </div>
        )}

        {!isLoading && !error && isEmpty && (
          <div className="flex items-start gap-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            <Inbox className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{emptyText}</p>
          </div>
        )}

        {!isLoading && !error && !isEmpty && (
          <div className="space-y-4">
            {caveat && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span>{caveat}</span>
              </div>
            )}
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** A warning-styled verdict block. Warnings are operator decisions, not statistics. */
export function VerdictBanner({ level, headline, detail }: { level: VerdictLevel; headline: string; detail: string }) {
  const tone =
    level === 'critical'
      ? 'border-red-500/50 bg-red-500/10 text-red-200'
      : level === 'warning'
        ? 'border-amber-500/50 bg-amber-500/10 text-amber-200'
        : 'border-green-500/40 bg-green-500/10 text-green-200';
  const iconTone = level === 'critical' ? 'text-red-400' : level === 'warning' ? 'text-amber-400' : 'text-green-400';

  return (
    <div className={`flex items-start gap-3 rounded-lg border p-4 ${tone}`} role={level === 'ok' ? undefined : 'alert'}>
      <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${iconTone}`} />
      <div>
        <p className="font-semibold text-foreground">{headline}</p>
        <p className="mt-1 text-sm">{detail}</p>
      </div>
    </div>
  );
}

export function StatTile({ label, value, note, tone = 'normal' }: { label: string; value: string; note?: string; tone?: 'normal' | 'warning' | 'good' }) {
  const valueTone = tone === 'warning' ? 'text-amber-400' : tone === 'good' ? 'text-green-400' : 'text-foreground';
  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${valueTone}`}>{value}</p>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
