import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { publicSupabase } from '@/integrations/supabase/client';
import { Loader2, Check, Star } from 'lucide-react';

/**
 * /rate/:token — post-order rating captured over HTTPS.
 *
 * Two-way SMS does not exist in Ireland (the outbound sender is a one-way
 * alphanumeric Sender ID), so the customer follows a tokenised link instead of
 * replying to a text.
 *
 * Opened on a phone, by someone who has just eaten, from an SMS. One thumb,
 * three seconds. No header, no nav, no footer, no login.
 *
 * The Google review link is shown on EVERY path. Withholding it from low raters
 * is review gating — it breaches Google Business Profile policy and is a
 * misleading commercial practice under the Irish regulations implementing the
 * Omnibus Directive. `show_review_link` comes back from the RPC; we read it, we
 * never add a condition of our own.
 */

const GOOGLE_REVIEW_URL = import.meta.env.VITE_GOOGLE_REVIEW_URL as string | undefined;

type Screen = 'loading' | 'invalid' | 'already_rated' | 'rate' | 'done';

interface SubmitResult {
  ok?: boolean;
  rating?: number;
  show_review_link?: boolean;
  needs_callback?: boolean;
}

/**
 * The token stays in the URL for the life of the page. Outbound links carry
 * rel="noreferrer", which closes the only meaningful leak; removing it from the
 * address bar as well would break a mid-rating refresh for no further gain.
 */

/**
 * The page URL carries the feedback token, so every outbound link uses
 * rel="noreferrer" — otherwise the token leaks to Google in the Referer header.
 */
function ReviewLink({ prominent }: { prominent: boolean }) {
  if (!GOOGLE_REVIEW_URL) return null;

  if (prominent) {
    return (
      <a
        href={GOOGLE_REVIEW_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-glow flex h-14 w-full items-center justify-center rounded-lg bg-primary px-4 font-heading text-base font-bold uppercase tracking-wider text-primary-foreground transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Leave a Google review
      </a>
    );
  }

  return (
    <a
      href={GOOGLE_REVIEW_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="block py-2 text-center text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      Leave a Google review
    </a>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="gradient-bg flex min-h-[100dvh] flex-col items-center justify-center px-5 py-8">
      <main
        className="w-full max-w-sm"
        style={{
          paddingTop: 'var(--safe-top)',
          paddingBottom: 'var(--safe-bottom)',
        }}
      >
        {children}
      </main>
    </div>
  );
}

export default function RateOrder() {
  const { token } = useParams<{ token: string }>();

  const [screen, setScreen] = useState<Screen>('loading');
  const [displayId, setDisplayId] = useState<number | null>(null);
  const [items, setItems] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [comment, setComment] = useState('');
  const [commentSending, setCommentSending] = useState(false);
  const [commentSent, setCommentSent] = useState(false);
  const [commentError, setCommentError] = useState(false);

  // ── Load context ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!token) {
        setScreen('invalid');
        return;
      }

      try {
        const { data, error } = await publicSupabase.functions.invoke('feedback/context', {
          body: { token },
        });

        if (cancelled) return;

        if (error || !data || data.valid !== true) {
          setScreen('invalid');
          return;
        }

        setDisplayId(typeof data.display_id === 'number' ? data.display_id : null);
        // items is a pre-joined display string, e.g. "1x Smash Burger, 1x Chips".
        setItems(typeof data.items === 'string' ? data.items : '');
        setScreen(data.already_rated === true ? 'already_rated' : 'rate');
      } catch {
        if (!cancelled) setScreen('invalid');
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // ── One tap submits ────────────────────────────────────────────────
  const submitRating = useCallback(
    async (value: number) => {
      if (submitting || !token) return;

      setSubmitting(true);
      setRating(value);

      try {
        const { data, error } = await publicSupabase.functions.invoke('feedback/submit', {
          body: { token, rating: value },
        });

        if (error || !data || data.ok !== true) {
          // Do not blame the customer or show a code. Let them try again.
          setSubmitting(false);
          setRating(null);
          return;
        }

        setResult(data as SubmitResult);
        setScreen('done');
      } catch {
        setSubmitting(false);
        setRating(null);
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, token],
  );

  // ── Optional comment: a second submit with the same token ──────────
  const sendComment = useCallback(async () => {
    if (commentSending || !token || !rating || !comment.trim()) return;

    setCommentSending(true);
    setCommentError(false);

    try {
      const { data, error } = await publicSupabase.functions.invoke('feedback/submit', {
        body: { token, rating, comment: comment.trim() },
      });

      if (error || !data || data.ok !== true) {
        setCommentError(true);
        return;
      }

      setCommentSent(true);
    } catch {
      setCommentError(true);
    } finally {
      setCommentSending(false);
    }
  }, [comment, commentSending, rating, token]);

  // ── Screens ────────────────────────────────────────────────────────

  if (screen === 'loading') {
    return (
      <Shell>
        <div className="flex justify-center py-16" aria-live="polite" aria-busy="true">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <span className="sr-only">Loading your order</span>
        </div>
      </Shell>
    );
  }

  // A bad token and an expired token look identical. The difference is an oracle.
  if (screen === 'invalid') {
    return (
      <Shell>
        <div className="street-card p-6 text-center">
          <h1 className="font-heading text-xl font-bold uppercase tracking-wide text-foreground">
            This link has expired
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Feedback links are only good for a short while after your order.
          </p>
          <Link
            to="/menu"
            className="mt-6 flex h-12 w-full items-center justify-center rounded-lg border border-border font-heading text-sm font-bold uppercase tracking-wider text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            View the menu
          </Link>
        </div>
      </Shell>
    );
  }

  if (screen === 'already_rated') {
    return (
      <Shell>
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/20">
            <Check className="h-8 w-8 text-success" />
          </div>
          <h1 className="mt-5 font-heading text-2xl font-bold uppercase tracking-wide text-foreground">
            Thanks — got it
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            You've already rated this order. We appreciate it.
          </p>
          <div className="mt-8">
            <ReviewLink prominent />
          </div>
        </div>
      </Shell>
    );
  }

  // ── Rate ───────────────────────────────────────────────────────────
  if (screen === 'rate') {
    return (
      <Shell>
        <div className="text-center">
          <h1 className="font-heading text-2xl font-bold uppercase leading-tight tracking-wide text-foreground">
            How was it?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">One tap. That's it.</p>
        </div>

        {(displayId || items) && (
          <div className="street-card mt-6 p-4">
            {displayId && (
              <p className="font-heading text-lg font-bold text-primary">
                #{String(displayId).padStart(4, '0')}
              </p>
            )}
            {items && (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{items}</p>
            )}
          </div>
        )}

        <div className="mt-6 grid grid-cols-5 gap-1.5" role="group" aria-label="Rate your order from 1 to 5">
          {[1, 2, 3, 4, 5].map((value) => {
            const isChosen = rating === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => submitRating(value)}
                disabled={submitting}
                aria-label={`${value} out of 5`}
                className={`touch-manipulation flex h-16 items-center justify-center rounded-lg border font-heading text-xl font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60 ${
                  isChosen
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground active:bg-secondary'
                }`}
              >
                {submitting && isChosen ? <Loader2 className="h-5 w-5 animate-spin" /> : value}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex justify-between px-1 text-xs text-muted-foreground">
          <span>Not great</span>
          <span>Loved it</span>
        </div>
      </Shell>
    );
  }

  // ── Done ───────────────────────────────────────────────────────────
  const score = result?.rating ?? rating ?? 0;
  const isHappy = score >= 4;
  // Read the RPC's decision. Never gate this on the score ourselves.
  const showReviewLink = result?.show_review_link === true;

  return (
    <Shell>
      <div className="text-center">
        <div
          className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
            isHappy ? 'bg-success/20' : 'bg-primary/20'
          }`}
        >
          {isHappy ? (
            <Star className="h-8 w-8 text-success" />
          ) : (
            <Check className="h-8 w-8 text-primary" />
          )}
        </div>

        <h1 className="mt-5 font-heading text-2xl font-bold uppercase leading-tight tracking-wide text-foreground">
          {isHappy ? 'Thanks a million' : 'Sorry about that'}
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {isHappy
            ? 'Glad you enjoyed it. See you again soon.'
            : 'That is not the standard we aim for, and we would like to know why.'}
        </p>
      </div>

      {isHappy ? (
        showReviewLink && (
          <div className="mt-8">
            <ReviewLink prominent />
          </div>
        )
      ) : (
        <>
          {/* Rendered as part of this screen from the outset — nothing toggles
              in, so there is no layout shift when the box appears. */}
          <div className="mt-6 min-h-[188px]">
            {commentSent ? (
              <div className="street-card flex min-h-[188px] flex-col items-center justify-center p-6 text-center">
                <Check className="h-6 w-6 text-success" />
                <p className="mt-3 font-heading text-sm font-bold uppercase tracking-wide text-foreground">
                  Sent to Danny
                </p>
                <p className="mt-2 text-sm text-muted-foreground">Thanks for telling us.</p>
              </div>
            ) : (
              <div>
                <label
                  htmlFor="feedback-comment"
                  className="block text-sm font-medium text-foreground"
                >
                  What went wrong?
                </label>
                <p className="mt-1 text-xs text-muted-foreground">Danny reads these himself.</p>
                <textarea
                  id="feedback-comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Tell us what happened"
                  className="mt-2 w-full resize-none rounded-lg border border-input bg-card p-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                <button
                  type="button"
                  onClick={sendComment}
                  disabled={commentSending || !comment.trim()}
                  className="touch-manipulation mt-2 flex h-12 w-full items-center justify-center rounded-lg bg-primary font-heading text-sm font-bold uppercase tracking-wider text-primary-foreground transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
                >
                  {commentSending ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Send'}
                </button>
                {commentError && (
                  <p className="mt-2 text-center text-xs text-destructive">
                    That didn't send. Tap Send to try again.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Present on every path — less prominent here, never withheld. */}
          {showReviewLink && (
            <div className="mt-6 border-t border-border pt-4">
              <ReviewLink prominent={false} />
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
