import { useState } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Image, Mail, DollarSign, Users, Calendar, Trophy, Tag, Percent, Trash2, Plus, ShieldCheck, BarChart3, Gift, Link2 } from 'lucide-react';
import { useBroadcasts, useCommunityVotes } from '@/hooks/useBroadcasts';
import { BroadcastComposer } from '@/components/staff/BroadcastComposer';
import { useModuleLayout } from '@/hooks/useModuleLayout';
import { usePromotions, useCreatePromotion, useUpdatePromotion, useDeletePromotion } from '@/hooks/usePromotions';
import { useAppSettings, useUpdateAppSettings } from '@/hooks/useAppSettings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { useMarketingMetrics } from '@/hooks/useFoodOSModules';

export function MarketingHub() {
  const [activeTab, setActiveTab] = useState('broadcasts');
  // Tab order follows foodos_module_settings.display_order. SMS, email and
  // community vote all share the one composer, so they map to a single tab.
  const layout = useModuleLayout('marketing');
  const modules = layout.modules;
  const enabled = new Set(layout.enabledModules.map((module) => module.module_key));
  const visible = (moduleKey: string) => modules.length === 0 || enabled.has(moduleKey);
  const TAB_FOR: Record<string, { value: string; label: string }> = {
    marketing_sms: { value: 'broadcasts', label: '📢 Messages' },
    marketing_email: { value: 'broadcasts', label: '📢 Messages' },
    marketing_community: { value: 'broadcasts', label: '📢 Messages' },
    marketing_ads: { value: 'ads', label: '📊 Ads' },
    marketing_loyalty: { value: 'loyalty', label: '🎁 Loyalty' },
    marketing_coupons: { value: 'coupons', label: '🏷️ Coupons' },
    marketing_banner: { value: 'banner', label: '🖼️ Banner' },
  };
  const orderedKeys = modules.length > 0 ? modules.map((module) => module.module_key) : Object.keys(TAB_FOR);
  const tabs: Array<{ value: string; label: string }> = [];
  for (const key of orderedKeys) {
    const tab = TAB_FOR[key];
    if (!tab || !visible(key) || tabs.some((existing) => existing.value === tab.value)) continue;
    tabs.push(tab);
  }
  const messagesVisible = visible('marketing_sms') || visible('marketing_email') || visible('marketing_community');

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto p-1">
          {tabs.map((tab) => <TabsTrigger key={tab.value} value={tab.value} className="shrink-0">{tab.label}</TabsTrigger>)}
        </TabsList>

        {messagesVisible && <TabsContent value="broadcasts" className="mt-4">
          <BroadcastsTab />
        </TabsContent>}
        {visible('marketing_ads') && <TabsContent value="ads" className="mt-4"><MarketingConnectionPanel channel="ads" /></TabsContent>}
        {visible('marketing_loyalty') && <TabsContent value="loyalty" className="mt-4"><LoyaltyMarketingPanel /></TabsContent>}
        {visible('marketing_coupons') && <TabsContent value="coupons" className="mt-4">
          <CouponsTab />
        </TabsContent>}
        {visible('marketing_banner') && <TabsContent value="banner" className="mt-4">
          <BannerTab />
        </TabsContent>}
      </Tabs>
    </div>
  );
}

function BroadcastsTab() {
  const { data: broadcasts, isLoading: broadcastsLoading } = useBroadcasts();
  const { data: votes, isLoading: votesLoading } = useCommunityVotes();

  const verifiedBroadcasts = broadcasts?.filter((broadcast) => broadcast.metrics_verified === true) ?? [];
  const confirmedAccepted = verifiedBroadcasts.reduce(
    (total, broadcast) => total + (broadcast.accepted_recipients ?? broadcast.recipients_count ?? 0),
    0,
  );
  const confirmedDelivered = verifiedBroadcasts.reduce(
    (total, broadcast) => total + (broadcast.delivered_recipients ?? 0),
    0,
  );
  const deliveryRate = confirmedAccepted > 0
    ? (confirmedDelivered / confirmedAccepted) * 100
    : null;

  return (
    <>
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold text-amber-200">Verified metrics only</p>
          <p className="text-sm text-muted-foreground">
            Legacy reach, open-rate and revenue values are hidden until Twilio delivery callbacks and paid-order attribution verify them. SMS does not provide an open-rate metric.
          </p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">History Records</p>
                <p className="text-2xl font-bold">{broadcasts?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">not a delivery count</p>
              </div>
              <Mail className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Confirmed Deliveries</p>
                <p className="text-2xl font-bold">{verifiedBroadcasts.length > 0 ? confirmedDelivered : '—'}</p>
                <p className="text-xs text-muted-foreground">Twilio-confirmed only</p>
              </div>
              <Users className="w-8 h-8 text-blue-400 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Delivery Rate</p>
                <p className="text-2xl font-bold text-green-400">{deliveryRate === null ? '—' : `${deliveryRate.toFixed(1)}%`}</p>
                <p className="text-xs text-muted-foreground">open rate is not available for SMS</p>
              </div>
              <Mail className="w-8 h-8 text-green-400 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <BroadcastComposer />

      {/* History Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Broadcast History */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg">Broadcast History</CardTitle>
          </CardHeader>
          <CardContent>
            {broadcastsLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-20 bg-secondary/30 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : broadcasts?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No broadcasts sent yet
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                {broadcasts?.map((broadcast) => (
                  <motion.div
                    key={broadcast.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-4 rounded-lg bg-secondary/20 border border-border"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-semibold">
                        {broadcast.title}
                        {broadcast.channels?.length ? <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">{broadcast.channels.join(' + ')}</span> : null}
                      </h4>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(broadcast.sent_at), 'MMM d, h:mm a')}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{broadcast.message}</p>
                    {broadcast.metrics_verified === true ? (
                      <div className="flex flex-wrap gap-4 text-xs">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {broadcast.delivered_recipients ?? 0} delivered
                        </span>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          {broadcast.failed_recipients ?? 0} failed
                        </span>
                        <Badge variant="outline" className="text-[10px]">{broadcast.metrics_source ?? 'verified'}</Badge>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-amber-300">
                        <ShieldCheck className="w-3 h-3" />
                        Unverified legacy record · provider metrics pending
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Votes */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg">Active Votes</CardTitle>
          </CardHeader>
          <CardContent>
            {votesLoading ? (
              <div className="space-y-3">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="h-24 bg-secondary/30 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : votes?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No votes created yet
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                {votes?.map((vote) => {
                  const totalVotes = vote.votes_a + vote.votes_b;
                  const percentA = totalVotes > 0 ? (vote.votes_a / totalVotes) * 100 : 50;
                  const isEnded = new Date(vote.closing_date) < new Date();

                  return (
                    <motion.div
                      key={vote.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`p-4 rounded-lg border ${
                        isEnded ? 'bg-muted/20 border-muted' : 'bg-secondary/20 border-border'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="font-semibold">{vote.title}</h4>
                        <Badge variant={isEnded ? 'secondary' : 'default'}>
                          {isEnded ? 'Ended' : 'Active'}
                        </Badge>
                      </div>

                      <div className="space-y-2 mb-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-red-400">🅰️ {vote.option_a}</span>
                          <span>{vote.votes_a} votes</span>
                        </div>
                        <Progress value={percentA} className="h-2 bg-blue-500/30" />
                        <div className="flex justify-between text-sm">
                          <span className="text-blue-400">🅱️ {vote.option_b}</span>
                          <span>{vote.votes_b} votes</span>
                        </div>
                      </div>

                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{totalVotes} total votes</span>
                        <span>Closes: {format(new Date(vote.closing_date), 'MMM d')}</span>
                      </div>

                      {isEnded && vote.winner && (
                        <div className="mt-3 flex items-center gap-2 text-sm text-yellow-400">
                          <Trophy className="w-4 h-4" />
                          Winner: {vote.winner}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function CouponsTab() {
  const { data: promotions, isLoading } = usePromotions();
  const createPromotion = useCreatePromotion();
  const updatePromotion = useUpdatePromotion();
  const deletePromotion = useDeletePromotion();
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'flat'>('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [expiryDate, setExpiryDate] = useState<Date>();

  const handleCreate = () => {
    if (!code || !discountValue) { toast.error('Fill in code and value'); return; }
    createPromotion.mutate({ code, discount_type: discountType, discount_value: parseFloat(discountValue), expiry_date: expiryDate?.toISOString() });
    setCode(''); setDiscountValue(''); setExpiryDate(undefined);
  };

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="w-5 h-5" />Create Coupon</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Code</Label>
              <Input placeholder="e.g., STREET10" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={discountType} onValueChange={(v) => setDiscountType(v as 'percentage' | 'flat')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage"><Percent className="w-4 h-4 inline mr-2" />Percentage</SelectItem>
                  <SelectItem value="flat"><DollarSign className="w-4 h-4 inline mr-2" />Flat Amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Value</Label>
              <Input type="number" placeholder={discountType === 'percentage' ? '10' : '5.00'} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Expiry (optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start"><Calendar className="mr-2 h-4 w-4" />{expiryDate ? format(expiryDate, 'PPP') : 'No expiry'}</Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><CalendarComponent mode="single" selected={expiryDate} onSelect={setExpiryDate} initialFocus /></PopoverContent>
              </Popover>
            </div>
          </div>
          <Button className="w-full" onClick={handleCreate} disabled={createPromotion.isPending}><Tag className="w-4 h-4 mr-2" />{createPromotion.isPending ? 'Creating...' : 'Create Coupon'}</Button>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader><CardTitle>Active Coupons</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-center text-muted-foreground py-4">Loading...</p> : promotions && promotions.length > 0 ? (
            <Table>
              <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Discount</TableHead><TableHead>Expiry</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {promotions.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono font-bold">{p.code}</TableCell>
                    <TableCell>{p.discount_type === 'percentage' ? `${p.discount_value}%` : `€${p.discount_value.toFixed(2)}`}</TableCell>
                    <TableCell>{p.expiry_date ? format(new Date(p.expiry_date), 'MMM d, yyyy') : 'Never'}</TableCell>
                    <TableCell><Switch checked={p.is_active} onCheckedChange={(c) => updatePromotion.mutate({ id: p.id, is_active: c })} /></TableCell>
                    <TableCell><Button variant="ghost" size="icon" onClick={() => deletePromotion.mutate(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <p className="text-center text-muted-foreground py-4">No coupons yet</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function MarketingConnectionPanel({ channel }: { channel: 'email' | 'ads' }) {
  const { data: metrics = [], isLoading, error } = useMarketingMetrics();
  const relevant = metrics.filter((metric) => channel === 'email'
    ? metric.provider === 'sendgrid_email'
    : metric.provider === 'google_ads' || metric.provider === 'meta_ads');

  const totals = relevant.reduce<Record<string, number>>((result, metric) => {
    result[metric.metric_name] = (result[metric.metric_name] ?? 0) + Number(metric.metric_value);
    return result;
  }, {});
  const hasVerifiedData = relevant.length > 0;

  const cards = channel === 'email'
    ? [
        ['Delivered', 'delivered'], ['Unique opens', 'unique_opens'], ['Clicks', 'clicks'],
        ['Bounces', 'bounces'], ['Unsubscribes', 'unsubscribes'], ['Spam reports', 'spam_reports'],
      ]
    : [
        ['Spend', 'spend'], ['Impressions', 'impressions'], ['Clicks', 'clicks'],
        ['Conversions', 'conversions'], ['Attributed revenue', 'attributed_revenue'],
      ];

  return <div className="space-y-4">
    <Card className="border-amber-500/30 bg-amber-500/5"><CardHeader><CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5 text-amber-400" />{channel === 'email' ? 'Email provider connection' : 'Google & Meta Ads connection'}</CardTitle><CardDescription>{hasVerifiedData ? 'Verified provider data is flowing into FoodOS.' : `${channel === 'email' ? 'SendGrid' : 'Google Ads and Meta Ads'} credentials and ingestion are still required. No placeholder metrics are displayed.`}</CardDescription></CardHeader></Card>
    {isLoading ? <div className="h-32 animate-pulse rounded-xl bg-secondary/30" /> : error ? <p className="rounded-lg border border-destructive/40 p-4">Marketing metrics could not be loaded.</p> : <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{cards.map(([label, metricName]) => <Card key={metricName}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{hasVerifiedData && totals[metricName] != null ? `${metricName === 'spend' || metricName === 'attributed_revenue' ? '€' : ''}${totals[metricName].toLocaleString('en-IE', { maximumFractionDigits: 2 })}` : '—'}</p></CardContent></Card>)}</div>}
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5 text-primary" />What FoodOS will report</CardTitle></CardHeader><CardContent><ul className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">{(channel === 'email' ? ['Delivery rate and bounce health', 'Unique open and click-through rate', 'Unsubscribes and spam complaints', 'Campaign-attributed paid orders and revenue'] : ['Spend, impressions, reach and frequency', 'Clicks, CPC, conversions and cost per order', 'Paid-order revenue attribution and ROAS', 'Campaign, ad-set and creative performance']).map((item) => <li key={item} className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{item}</li>)}</ul></CardContent></Card>
  </div>;
}

function LoyaltyMarketingPanel() {
  const { data: settings, isLoading } = useAppSettings();
  const rewardCost = settings?.loyalty_reward_cost ?? 7;
  const rewardLabel = settings?.loyalty_reward_label ?? 'Free Chips';
  return <div className="space-y-4">
    <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-transparent"><CardHeader><CardTitle className="flex items-center gap-2"><Gift className="h-5 w-5 text-primary" />Street Eatz loyalty</CardTitle><CardDescription>Simple, clear and tied only to paid customer orders.</CardDescription></CardHeader><CardContent><div className="grid gap-4 md:grid-cols-3"><div><p className="text-sm text-muted-foreground">Rule</p><p className="text-xl font-bold">Every {isLoading ? '—' : `${rewardCost}th`} paid order</p></div><div><p className="text-sm text-muted-foreground">Reward</p><p className="text-xl font-bold text-primary">{isLoading ? '—' : rewardLabel}</p></div><div><p className="text-sm text-muted-foreground">Status</p><Badge variant={settings?.loyalty_enabled ? 'default' : 'secondary'}>{settings?.loyalty_enabled ? 'Live' : 'Hidden'}</Badge></div></div></CardContent></Card>
    <Card><CardHeader><CardTitle className="text-lg">How it works</CardTitle></CardHeader><CardContent><ol className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3"><li><strong className="block text-foreground">1. Paid order</strong>One stamp is awarded only after payment is confirmed.</li><li><strong className="block text-foreground">2. Seventh stamp</strong>The seventh paid order unlocks a Free Chips reward.</li><li><strong className="block text-foreground">3. Controlled redemption</strong>Redemption is recorded in the immutable loyalty ledger so it cannot be reused.</li></ol><p className="mt-4 text-xs text-muted-foreground">Existing paid orders are not guessed or backfilled. The rule applies to verified loyalty activity from activation onward.</p></CardContent></Card>
  </div>;
}

function BannerTab() {
  const { data: settings } = useAppSettings();
  const updateSettings = useUpdateAppSettings();
  const [bannerText, setBannerText] = useState(settings?.marketing_banner_text || '');
  const [bannerEnabled, setBannerEnabled] = useState(settings?.marketing_banner_enabled || false);

  const handleSave = () => {
    updateSettings.mutate({ marketing_banner_text: bannerText, marketing_banner_enabled: bannerEnabled });
    toast.success('Banner settings saved');
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader><CardTitle className="flex items-center gap-2"><Image className="w-5 h-5" />Marketing Banner</CardTitle><CardDescription>Display a promo banner on the customer menu</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
          <div><Label>Enable Banner</Label><p className="text-sm text-muted-foreground">Show on customer menu</p></div>
          <Switch checked={bannerEnabled} onCheckedChange={setBannerEnabled} />
        </div>
        <div className="space-y-2"><Label>Banner Text</Label><Textarea placeholder="e.g., 10% off today with code BASH 🔥" value={bannerText} onChange={(e) => setBannerText(e.target.value)} rows={2} /></div>
        {bannerEnabled && bannerText && <div className="bg-primary text-primary-foreground py-2 px-4 rounded-lg text-center text-sm font-medium">{bannerText}</div>}
        <Button className="w-full" onClick={handleSave} disabled={updateSettings.isPending}>{updateSettings.isPending ? 'Saving...' : 'Save Banner Settings'}</Button>
      </CardContent>
    </Card>
  );
}
