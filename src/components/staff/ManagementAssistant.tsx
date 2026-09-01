import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bot,
  Check,
  Clock3,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { callAssistant, isAssistantFailure } from '@/lib/assistantClient';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  formatAssistantValue,
  productChangeLabels,
  type AssistantMessage,
  type AssistantChangeProposal,
  type ManagementAssistantResponse,
} from '@/lib/managementAssistant';

interface ConversationEntry extends AssistantMessage {
  id: string;
  proposals?: AssistantChangeProposal[];
  error?: boolean;
}

const quickPrompts = [
  'Give me a 7-day business performance summary.',
  'What are my best-selling items and strongest ordering channel?',
  'Show me anything sold out, unavailable, or hidden on the menu.',
  'What is the live ordering status and quoted wait time?',
  'What scheduled pre-orders are coming up and which are awaiting kitchen release?',
  'Is loyalty enabled, and how many members are ready for a reward?',
  'Does the reporting data health show any problems?',
];

const welcomeMessage: ConversationEntry = {
  id: 'welcome',
  role: 'assistant',
  content: 'I can answer questions from your live menu, opening status, quoted wait time, scheduled orders, loyalty programme and verified paid-order reporting. I can also prepare price, product, visibility, sold-out, wait-time and ordering-status changes for you to review and confirm.',
};

function ProposalCard({
  proposal,
  onConfirmed,
}: {
  proposal: AssistantChangeProposal;
  onConfirmed: (proposal: AssistantChangeProposal, result: Record<string, unknown>) => void;
}) {
  const { session } = useAuth();
  const [status, setStatus] = useState(proposal.status);
  const [isConfirming, setIsConfirming] = useState(false);
  const changeRows = Object.entries(proposal.changes);

  const confirmChange = async () => {
    if (!session?.access_token || status !== 'pending') return;
    setIsConfirming(true);
    try {
      const outcome = await callAssistant<{
        result?: Record<string, unknown> & { ok?: boolean; error?: string };
      }>(
        {
          action: 'confirm',
          proposalId: proposal.id,
          proposalType: proposal.proposal_type,
        },
        session.access_token,
      );
      if (isAssistantFailure(outcome)) throw new Error(outcome.message);
      const payload = outcome.payload;
      if (!payload.result || payload.result.ok === false) {
        throw new Error(payload.result?.error || 'The change could not be confirmed.');
      }
      setStatus('applied');
      onConfirmed(proposal, payload.result);
      toast.success(`${proposal.target_name} updated`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The change could not be confirmed.');
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className={`mt-3 rounded-xl border p-4 ${status === 'applied' ? 'border-green-500/40 bg-green-500/10' : 'border-primary/40 bg-primary/5'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Change preview</p>
          <p className="font-bold mt-1">{proposal.target_name}</p>
        </div>
        <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${status === 'applied' ? 'bg-green-500/20 text-green-300' : 'bg-amber-500/15 text-amber-300'}`}>
          {status === 'applied' ? <Check className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
          {status === 'applied' ? 'Applied' : 'Awaiting confirmation'}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {changeRows.map(([field, nextValue]) => (
          <div key={field} className="grid grid-cols-[minmax(100px,0.8fr)_1fr_auto_1fr] items-center gap-2 rounded-lg bg-background/70 px-3 py-2 text-sm">
            <span className="text-muted-foreground">{productChangeLabels[field] || field}</span>
            <span className="truncate text-muted-foreground line-through">{formatAssistantValue(field, proposal.before[field])}</span>
            <span aria-hidden="true">→</span>
            <span className="font-semibold text-foreground">{formatAssistantValue(field, nextValue)}</span>
          </div>
        ))}
      </div>

      {status === 'pending' && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Expires at {new Date(proposal.expires_at).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })}</p>
          <Button onClick={confirmChange} disabled={isConfirming} className="gap-2">
            {isConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Confirm change
          </Button>
        </div>
      )}
    </div>
  );
}

export function ManagementAssistant() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<ConversationEntry[]>([welcomeMessage]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const apiHistory = useMemo<AssistantMessage[]>(() => entries
    .filter((entry) => !entry.error && entry.id !== 'welcome')
    .map(({ role, content }) => ({ role, content })), [entries]);

  const scrollToEnd = () => {
    window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30);
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending || !session?.access_token) return;

    const userEntry: ConversationEntry = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
    };
    const nextHistory = [...apiHistory, { role: 'user' as const, content: trimmed }];
    setEntries((current) => [...current, userEntry]);
    setInput('');
    setIsSending(true);
    scrollToEnd();

    try {
      const outcome = await callAssistant<ManagementAssistantResponse>(
        { action: 'chat', messages: nextHistory },
        session.access_token,
      );
      if (isAssistantFailure(outcome)) throw new Error(outcome.message);
      const payload = outcome.payload;

      setEntries((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: payload.message,
        proposals: payload.proposals,
      }]);
    } catch (error) {
      setEntries((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: error instanceof Error ? error.message : 'The assistant is unavailable right now.',
        error: true,
      }]);
    } finally {
      setIsSending(false);
      scrollToEnd();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  };

  const handleConfirmed = (proposal: AssistantChangeProposal) => {
    void queryClient.invalidateQueries({ queryKey: ['products'] });
    void queryClient.invalidateQueries({ queryKey: ['all-products'] });
    setEntries((current) => [...current, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `${proposal.target_name} has been updated successfully. Connected ordering channels will receive the refreshed live data.`,
    }]);
    scrollToEnd();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/15 p-2"><Bot className="h-6 w-6 text-primary" /></div>
            <div>
              <h2 className="text-2xl font-bold">FoodOS Owner Assistant</h2>
              <p className="text-sm text-muted-foreground">Live menu control, scheduled orders, loyalty, business intelligence and owner reporting</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-semibold text-green-300">
          <ShieldCheck className="h-4 w-4" /> Admin-only · Confirmed changes
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="overflow-hidden border-border bg-card">
          <CardHeader className="border-b border-border bg-secondary/20 py-4">
            <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" /> Ask FoodOS</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[560px] min-h-[390px] space-y-4 overflow-y-auto p-4 sm:p-6" aria-live="polite">
              {entries.map((entry) => (
                <div key={entry.id} className={`flex gap-3 ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {entry.role === 'assistant' && (
                    <div className={`mt-1 h-8 w-8 shrink-0 rounded-full p-1.5 ${entry.error ? 'bg-destructive/15 text-destructive' : 'bg-primary/15 text-primary'}`}>
                      {entry.error ? <AlertTriangle className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
                    </div>
                  )}
                  <div className={`max-w-[88%] rounded-2xl px-4 py-3 ${entry.role === 'user' ? 'bg-primary text-primary-foreground' : entry.error ? 'border border-destructive/30 bg-destructive/10' : 'border border-border bg-secondary/35'}`}>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{entry.content}</p>
                    {entry.proposals?.map((proposal) => (
                      <ProposalCard key={proposal.id} proposal={proposal} onConfirmed={handleConfirmed} />
                    ))}
                  </div>
                  {entry.role === 'user' && (
                    <div className="mt-1 h-8 w-8 shrink-0 rounded-full bg-primary p-1.5 text-primary-foreground"><UserRound className="h-5 w-5" /></div>
                  )}
                </div>
              ))}
              {isSending && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <div className="h-8 w-8 rounded-full bg-primary/15 p-1.5 text-primary"><Bot className="h-5 w-5" /></div>
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking live FoodOS data…
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="border-t border-border bg-background/40 p-4">
              <div className="flex items-end gap-2">
                <Textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about sales, menu, pre-orders, loyalty, stock, channels or prep time…"
                  className="min-h-[48px] max-h-36 resize-none"
                  maxLength={4_000}
                  disabled={isSending}
                  aria-label="Message the FoodOS owner assistant"
                />
                <Button
                  size="icon"
                  className="h-12 w-12 shrink-0"
                  onClick={() => void sendMessage(input)}
                  disabled={isSending || !input.trim()}
                  aria-label="Send message"
                >
                  {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Press Enter to send · Shift + Enter for a new line · AI answers should be checked before business decisions.</p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3"><CardTitle className="text-base">Try asking</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {quickPrompts.map((prompt) => (
                <button
                  type="button"
                  key={prompt}
                  onClick={() => void sendMessage(prompt)}
                  disabled={isSending}
                  className="w-full rounded-lg border border-border bg-secondary/25 p-3 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="border-primary/25 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-semibold">Safe change controls</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">The assistant can prepare a change, but it cannot publish one until you review and confirm the exact before-and-after values. Every applied change is recorded.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
