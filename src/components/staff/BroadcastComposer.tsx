import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Calendar, Loader2, Mail, MessageSquare, Send, Users, Vote } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useSendBroadcast, useCreateVote, type BroadcastChannel, type BroadcastType } from '@/hooks/useBroadcasts';
import { useBroadcastReach } from '@/hooks/useInsightViews';
import { defaultChannels, recipientsFor } from '@/lib/insights';

/**
 * One composer for every outbound message: promotional, weekly, announcement
 * and community vote, over SMS, email or both.
 *
 * Reach is shown before sending from v_broadcast_reach. Today that is 185
 * customers, 185 reachable by SMS and ZERO by email — so the email option must
 * say "0 recipients", not look like it works. Default is the cheapest channel
 * that reaches anyone (email is free, SMS is metered), and both are never
 * pre-ticked: that is a cost decision the operator makes on purpose.
 */

const TYPE_LABELS: Record<BroadcastType, { label: string; hint: string }> = {
  promotional: { label: 'Promotion', hint: 'An offer or a push on a specific item' },
  weekly: { label: 'Weekly update', hint: 'Where the truck is and what is on this week' },
  announcement: { label: 'Announcement', hint: 'Hours, closures, news — no offer' },
  community_vote: { label: 'Community vote', hint: 'Let customers choose between two options' },
};

export function BroadcastComposer() {
  const { data: reach, isLoading: reachLoading, error: reachError } = useBroadcastReach();
  const sendBroadcast = useSendBroadcast();
  const createVote = useCreateVote();

  const [type, setType] = useState<BroadcastType>('weekly');
  const [channels, setChannels] = useState<BroadcastChannel[]>([]);
  const [channelsTouched, setChannelsTouched] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [voteOptions, setVoteOptions] = useState<string[]>(['', '']);
  const [closingDate, setClosingDate] = useState<Date | undefined>();

  // Default channel follows reach, but never overrides a choice the operator made.
  useEffect(() => {
    if (!channelsTouched && reach) setChannels(defaultChannels(reach));
  }, [reach, channelsTouched]);

  const recipients = useMemo(() => recipientsFor(reach ?? null, channels), [reach, channels]);
  const emailReach = reach?.reachable_email ?? 0;
  const smsReach = reach?.reachable_sms ?? 0;

  const toggleChannel = (channel: BroadcastChannel, checked: boolean) => {
    setChannelsTouched(true);
    setChannels((current) => (checked ? [...new Set([...current, channel])] : current.filter((c) => c !== channel)));
  };

  const isVote = type === 'community_vote';
  const cleanOptions = voteOptions.map((o) => o.trim()).filter(Boolean);
  const canSend =
    title.trim().length > 0 &&
    message.trim().length > 0 &&
    channels.length > 0 &&
    recipients > 0 &&
    (!channels.includes('email') || emailSubject.trim().length > 0) &&
    (!isVote || (cleanOptions.length >= 2 && Boolean(closingDate)));

  const handleSend = async () => {
    try {
      if (isVote) {
        await createVote.mutateAsync({
          title: title.trim(),
          option_a: cleanOptions[0],
          option_b: cleanOptions[1],
          closing_date: closingDate!.toISOString(),
        });
      }
      await sendBroadcast.mutateAsync({
        title: title.trim(),
        message: message.trim(),
        image_url: imageUrl.trim() || undefined,
        channels,
        broadcast_type: type,
        email_subject: emailSubject.trim() || undefined,
      });
      setTitle(''); setMessage(''); setEmailSubject(''); setImageUrl('');
      setVoteOptions(['', '']); setClosingDate(undefined);
    } catch (error) {
      console.error(error);
      toast.error('The broadcast could not be sent.');
    }
  };

  const busy = sendBroadcast.isPending || createVote.isPending;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="border-b border-border bg-gradient-to-r from-primary/10 to-transparent">
        <CardTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-primary" />Send a message</CardTitle>
        <CardDescription>One composer for every channel. Reach is shown before you send.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        {/* Reach — shown first, because it decides whether sending makes sense */}
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium"><Users className="h-4 w-4 text-primary" />Who this can reach</p>
          {reachLoading && <div className="h-10 animate-pulse rounded bg-secondary/40" />}
          {Boolean(reachError) && <p className="text-sm text-destructive">Reach could not be loaded. Sending is disabled until it can.</p>}
          {reach && (
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div><p className="text-xs text-muted-foreground">Customers</p><p className="font-bold tabular-nums">{reach.customers_total}</p></div>
              <div><p className="text-xs text-muted-foreground">By SMS</p><p className="font-bold tabular-nums">{smsReach}</p></div>
              <div><p className="text-xs text-muted-foreground">By email</p><p className={cn('font-bold tabular-nums', emailReach === 0 && 'text-amber-400')}>{emailReach}</p></div>
            </div>
          )}
          {reach && emailReach === 0 && (
            <p className="mt-2 text-xs text-amber-300">
              No customer has an email address on file. Checkout collects email as optional and it has never been stored — worth fixing separately.
            </p>
          )}
        </div>

        {/* Type */}
        <div className="space-y-2">
          <Label>Message type</Label>
          <Select value={type} onValueChange={(value) => setType(value as BroadcastType)}>
            <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(TYPE_LABELS) as BroadcastType[]).map((key) => (
                <SelectItem key={key} value={key}>{TYPE_LABELS[key].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{TYPE_LABELS[type].hint}</p>
        </div>

        {/* Channels */}
        <div className="space-y-2">
          <Label>Channels</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={cn('flex cursor-pointer items-center gap-3 rounded-lg border p-3', channels.includes('sms') ? 'border-primary bg-primary/5' : 'border-border')}>
              <Checkbox checked={channels.includes('sms')} onCheckedChange={(checked) => toggleChannel('sms', checked === true)} disabled={smsReach === 0} />
              <MessageSquare className="h-4 w-4 text-primary" />
              <span className="flex-1 text-sm">SMS</span>
              <span className="text-xs tabular-nums text-muted-foreground">{smsReach} recipients · metered</span>
            </label>
            <label className={cn('flex items-center gap-3 rounded-lg border p-3', emailReach === 0 ? 'cursor-not-allowed opacity-70' : 'cursor-pointer', channels.includes('email') ? 'border-primary bg-primary/5' : 'border-border')}>
              <Checkbox checked={channels.includes('email')} onCheckedChange={(checked) => toggleChannel('email', checked === true)} disabled={emailReach === 0} />
              <Mail className="h-4 w-4 text-primary" />
              <span className="flex-1 text-sm">Email</span>
              <span className={cn('text-xs tabular-nums', emailReach === 0 ? 'text-amber-400' : 'text-muted-foreground')}>{emailReach} recipients · free</span>
            </label>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-2">
          <Label htmlFor="composer-title">Title</Label>
          <Input id="composer-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isVote ? "e.g. Next week's special" : "e.g. This week at the truck"} className="bg-background/50" maxLength={160} />
        </div>
        {channels.includes('email') && (
          <div className="space-y-2">
            <Label htmlFor="composer-subject">Email subject</Label>
            <Input id="composer-subject" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="bg-background/50" maxLength={160} />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="composer-message">Message</Label>
          <Textarea id="composer-message" value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-[100px] bg-background/50" maxLength={1600} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{channels.includes('sms') ? 'A "Reply STOP to opt out" footer is added to SMS automatically.' : ' '}</span>
            <span className="tabular-nums">{message.length}/1600</span>
          </div>
        </div>

        {isVote && (
          <div className="space-y-3 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
            <p className="flex items-center gap-2 text-sm font-medium"><Vote className="h-4 w-4 text-violet-400" />Vote options</p>
            {voteOptions.map((option, index) => (
              <Input key={index} value={option} onChange={(e) => setVoteOptions((current) => current.map((o, i) => (i === index ? e.target.value : o)))} placeholder={`Option ${index + 1}`} className="bg-background/50" />
            ))}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('w-full justify-start bg-background/50 font-normal', !closingDate && 'text-muted-foreground')}>
                  <Calendar className="mr-2 h-4 w-4" />{closingDate ? format(closingDate, 'PPP') : 'Pick a closing date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <CalendarComponent mode="single" selected={closingDate} onSelect={setClosingDate} disabled={(date) => date < new Date()} initialFocus />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {!isVote && (
          <div className="space-y-2">
            <Label htmlFor="composer-image">Image URL (optional)</Label>
            <Input id="composer-image" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" className="bg-background/50" />
          </div>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={!canSend || busy} className="w-full">
              {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</> : <><Send className="mr-2 h-4 w-4" />Review and send to {recipients} {recipients === 1 ? 'person' : 'people'}</>}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Send to {recipients} {recipients === 1 ? 'person' : 'people'} by {channels.join(' and ')}?</AlertDialogTitle>
              <AlertDialogDescription>
                {channels.includes('sms') ? 'SMS is charged per segment and reaches real customers. ' : ''}
                This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-4">
              <p className="font-semibold">{title.trim()}</p>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{message.trim()}</p>
              {isVote && <p className="text-xs text-violet-300">Vote: {cleanOptions.join(' vs ')}{closingDate ? ` · closes ${format(closingDate, 'PP')}` : ''}</p>}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Go back</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleSend()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Confirm send</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
