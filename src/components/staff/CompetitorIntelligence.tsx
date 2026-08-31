import { useMemo, useState } from 'react';
import { ExternalLink, Loader2, Plus, Search, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCompetitorIntelligence, useCreateCompetitor } from '@/hooks/useFoodOSModules';

export function CompetitorIntelligence() {
  const { data, isLoading, error } = useCompetitorIntelligence();
  const createCompetitor = useCreateCompetitor();
  const [name, setName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');

  const latestByCompetitor = useMemo(() => {
    const latest = new Map<string, NonNullable<typeof data>['snapshots'][number]>();
    for (const snapshot of data?.snapshots ?? []) {
      if (!latest.has(snapshot.competitor_id)) latest.set(snapshot.competitor_id, snapshot);
    }
    return latest;
  }, [data]);

  const addCompetitor = async () => {
    try {
      await createCompetitor.mutateAsync({ name, website_url: websiteUrl, google_maps_url: mapsUrl });
      setName(''); setWebsiteUrl(''); setMapsUrl('');
      toast.success('Competitor added to the watchlist');
    } catch (creationError) {
      console.error(creationError);
      toast.error('Competitor could not be added');
    }
  };

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-secondary/30" />;
  if (error) return <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">Competitor intelligence could not be loaded.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />
        <div><p className="font-semibold">Evidence-backed competitor intelligence</p><p className="text-sm text-muted-foreground">Prices, ratings, review counts and offers appear only after a dated source snapshot is recorded. FoodOS will not invent market figures.</p></div>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Plus className="h-5 w-5 text-primary" />Add a competitor</CardTitle><CardDescription>Start the watchlist now; connected collection and scheduled comparisons come next.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
          <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Business name" /></div>
          <div className="space-y-2"><Label>Website (optional)</Label><Input type="url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://…" /></div>
          <div className="space-y-2"><Label>Google Maps (optional)</Label><Input type="url" value={mapsUrl} onChange={(event) => setMapsUrl(event.target.value)} placeholder="https://maps.google.com/…" /></div>
          <Button onClick={() => void addCompetitor()} disabled={createCompetitor.isPending || name.trim().length < 2}>{createCompetitor.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Add</Button>
        </CardContent>
      </Card>

      {(data?.profiles.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center"><Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-semibold">No competitors on the watchlist yet</p><p className="text-sm text-muted-foreground">Add Waterford competitors above. Analytics stays blank until there is verifiable evidence.</p></div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {data?.profiles.map((competitor) => {
            const snapshot = latestByCompetitor.get(competitor.id);
            return <Card key={competitor.id}><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-lg">{competitor.name}</CardTitle><CardDescription>{snapshot ? `Last checked ${new Date(snapshot.observed_at).toLocaleDateString('en-IE')}` : 'Awaiting first evidence snapshot'}</CardDescription></div><Badge variant={snapshot ? 'default' : 'secondary'}>{snapshot ? snapshot.source_type.replace('_', ' ') : 'No data'}</Badge></div></CardHeader><CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center"><Metric label="Rating" value={snapshot?.average_rating == null ? '—' : `${Number(snapshot.average_rating).toFixed(1)}★`} /><Metric label="Reviews" value={snapshot?.review_count == null ? '—' : String(snapshot.review_count)} /><Metric label="Main price" value={snapshot?.average_main_price == null ? '—' : `€${Number(snapshot.average_main_price).toFixed(2)}`} /></div>
              <div className="flex flex-wrap gap-2">{competitor.website_url && <SourceLink href={competitor.website_url} label="Website" />}{competitor.google_maps_url && <SourceLink href={competitor.google_maps_url} label="Google Maps" />}{snapshot?.evidence_url && <SourceLink href={snapshot.evidence_url} label="Snapshot evidence" />}</div>
            </CardContent></Card>;
          })}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-secondary/30 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-bold">{value}</p></div>;
}

function SourceLink({ href, label }: { href: string; label: string }) {
  return <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">{label}<ExternalLink className="h-3 w-3" /></a>;
}
