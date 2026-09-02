import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { publicSupabase } from '@/integrations/supabase/client';

/**
 * The lead-generation form on /catering. Writes through the `enquiry` edge
 * function → public.submit_enquiry(), never to a table directly and never via
 * an anon INSERT policy. Admin reads the queue from v_enquiry_queue.
 *
 * No login. Works at 320px. States: idle, sending, sent, failed.
 */

type State = 'idle' | 'sending' | 'sent' | 'failed';

const inputClass =
  'w-full rounded-lg border border-input bg-card p-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

export function CateringEnquiryForm() {
  const [state, setState] = useState<State>('idle');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    event_date: '',
    guest_count: '',
    event_location: '',
    message: '',
    website: '', // honeypot — hidden from people, filled by bots
  });

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const canSend =
    form.name.trim().length > 1 &&
    form.message.trim().length > 5 &&
    (form.email.trim().length > 3 || form.phone.trim().length > 5) &&
    state !== 'sending';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSend) return;
    setState('sending');
    setErrorText(null);

    try {
      const { data, error } = await publicSupabase.functions.invoke('enquiry', {
        body: {
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          event_date: form.event_date || null,
          guest_count: form.guest_count ? Number(form.guest_count) : null,
          event_location: form.event_location || null,
          message: form.message,
          enquiry_type: 'catering',
          source_page: '/catering',
          website: form.website,
        },
      });

      if (error || !data || data.ok === false) {
        setErrorText(typeof data?.error === 'string' ? data.error : 'That did not send. Please try again, or use the contact details above.');
        setState('failed');
        return;
      }
      setState('sent');
    } catch {
      setErrorText('That did not send. Please try again, or use the contact details above.');
      setState('failed');
    }
  };

  if (state === 'sent') {
    return (
      <div className="street-card mt-8 flex flex-col items-center p-6 text-center">
        <Check className="h-8 w-8 text-success" />
        <h2 className="mt-3 font-heading text-lg font-bold uppercase tracking-wide">Enquiry received</h2>
        <p className="mt-2 text-sm text-muted-foreground">We will come back to you with a price and what is realistic for your date.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="street-card mt-8 space-y-4 p-5" noValidate>
      <h2 className="font-heading text-xl font-bold uppercase tracking-wide text-primary">Enquire about food truck hire</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Tell us the date, the location, roughly how many people, and the time you would like food served.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Your name</span>
          <input className={inputClass} value={form.name} onChange={update('name')} autoComplete="name" required maxLength={120} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Email</span>
          <input className={inputClass} type="email" value={form.email} onChange={update('email')} autoComplete="email" maxLength={200} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Phone</span>
          <input className={inputClass} type="tel" value={form.phone} onChange={update('phone')} autoComplete="tel" maxLength={40} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Event date</span>
          <input className={inputClass} type="date" value={form.event_date} onChange={update('event_date')} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Roughly how many people</span>
          <input className={inputClass} type="number" inputMode="numeric" min={1} value={form.guest_count} onChange={update('guest_count')} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Where</span>
          <input className={inputClass} value={form.event_location} onChange={update('event_location')} placeholder="Town or venue" maxLength={200} />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">What are you planning?</span>
        <textarea className={`${inputClass} resize-none`} rows={4} value={form.message} onChange={update('message')} required maxLength={2000} />
      </label>

      {/* Honeypot. Visually hidden and tab-skipped; a bot filling it is dropped silently. */}
      <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={form.website} onChange={update('website')} />
        </label>
      </div>

      <p className="text-xs text-muted-foreground">Email or phone is needed so we can reply. We use it for this enquiry only.</p>

      {errorText && <p className="text-sm text-destructive">{errorText}</p>}

      <button
        type="submit"
        disabled={!canSend}
        className="btn-glow flex h-12 w-full items-center justify-center rounded-lg bg-primary font-heading text-sm font-bold uppercase tracking-wider text-primary-foreground transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
      >
        {state === 'sending' ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Send enquiry'}
      </button>
    </form>
  );
}
