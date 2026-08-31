import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { ArrowLeft, Copy, Download, ExternalLink, QrCode as QrCodeIcon, Save, Star } from 'lucide-react';
import { toast } from 'sonner';
import { useAppSettings, useUpdateAppSettings } from '@/hooks/useAppSettings';
import { normalizeGoogleReviewUrl } from '@/lib/googleReviewUrl';
import { buildQrOrderUrl } from '@/lib/orderSource';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { clientConfig } from '@/config/client';

type QrType = 'order' | 'review';

const publicSiteUrl = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/$/, '');
const googleReviewUrl = import.meta.env.VITE_GOOGLE_REVIEW_URL as string | undefined;

export default function QrHub() {
  const navigate = useNavigate();
  const { data: settings } = useAppSettings();
  const updateSettings = useUpdateAppSettings();
  const [type, setType] = useState<QrType>('order');
  const [campaign, setCampaign] = useState('counter');
  const [location, setLocation] = useState('waterford');
  const [table, setTable] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const configuredReviewUrl = settings?.google_review_url || googleReviewUrl || '';
  const [reviewUrl, setReviewUrl] = useState(configuredReviewUrl);

  useEffect(() => {
    setReviewUrl(configuredReviewUrl);
  }, [configuredReviewUrl]);

  const normalizedReviewUrl = useMemo(
    () => normalizeGoogleReviewUrl(reviewUrl),
    [reviewUrl],
  );
  const hasUnsavedReviewUrl = reviewUrl.trim() !== configuredReviewUrl.trim();

  const hostname = window.location.hostname;
  const isLocalOrDeployPreview = hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname.includes('--');
  const baseUrl = isLocalOrDeployPreview ? window.location.origin : (publicSiteUrl || window.location.origin);
  const targetUrl = useMemo(() => {
    if (type === 'review') return normalizedReviewUrl || '';
    return buildQrOrderUrl(baseUrl, { campaign, location, table });
  }, [baseUrl, campaign, location, normalizedReviewUrl, table, type]);

  useEffect(() => {
    let active = true;
    if (!targetUrl) {
      setQrDataUrl('');
      return;
    }

    QRCode.toDataURL(targetUrl, {
      errorCorrectionLevel: 'H',
      margin: 3,
      width: 960,
      color: { dark: '#0A0A0A', light: '#FFFFFF' },
    }).then((dataUrl) => {
      if (active) setQrDataUrl(dataUrl);
    }).catch(() => {
      if (active) setQrDataUrl('');
    });

    return () => {
      active = false;
    };
  }, [targetUrl]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(targetUrl);
    toast.success('QR destination copied');
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = type === 'review' ? 'street-eatz-google-review-qr.png' : `street-eatz-order-qr-${campaign || 'general'}.png`;
    link.click();
  };

  const saveReviewUrl = async () => {
    if (!normalizedReviewUrl) {
      toast.error('Enter a valid direct Google review link first');
      return;
    }

    try {
      await updateSettings.mutateAsync({ google_review_url: normalizedReviewUrl });
      setReviewUrl(normalizedReviewUrl);
      toast.success('Google review link saved');
    } catch (error) {
      console.error('Failed to save Google review link:', error);
      toast.error('The link could not be saved yet. The QR preview is still available.');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-black/95 backdrop-blur-sm">
        <div className="container mx-auto flex items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/dashboard')} aria-label="Back to command center">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-heading text-xl">QR HUB</h1>
            <p className="text-xs text-muted-foreground">Create tracked ordering and Google Review codes</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto grid max-w-5xl gap-6 px-4 py-6 md:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader><CardTitle>QR destination</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <Tabs value={type} onValueChange={(value) => setType(value as QrType)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="order" className="gap-2"><QrCodeIcon className="h-4 w-4" />Order</TabsTrigger>
                <TabsTrigger value="review" className="gap-2"><Star className="h-4 w-4" />Google Review</TabsTrigger>
              </TabsList>
            </Tabs>

            {type === 'order' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="qr-campaign">Campaign or placement</Label>
                  <Input id="qr-campaign" value={campaign} onChange={(event) => setCampaign(event.target.value)} placeholder="counter, flyer, table" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qr-location">Location</Label>
                  <Input id="qr-location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="waterford" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="qr-table">Table or collection point (optional)</Label>
                  <Input id="qr-table" value={table} onChange={(event) => setTable(event.target.value)} placeholder="Table 4" />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
                  This code opens the public Google review page directly for every customer. It is never filtered by rating.
                </div>
                <div className="space-y-2">
                  <Label htmlFor="google-review-url">Direct Google review link</Label>
                  <Input
                    id="google-review-url"
                    type="url"
                    value={reviewUrl}
                    onChange={(event) => setReviewUrl(event.target.value)}
                    placeholder="https://search.google.com/local/writereview?placeid=..."
                    aria-invalid={Boolean(reviewUrl.trim() && !normalizedReviewUrl)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste the official “Ask for reviews” link from Google Business Profile. Only direct Google review links are accepted.
                  </p>
                  {reviewUrl.trim() && !normalizedReviewUrl && (
                    <p className="text-xs text-destructive">Use a search.google.com direct review link or a g.page link ending in /review.</p>
                  )}
                  {hasUnsavedReviewUrl && normalizedReviewUrl && (
                    <p className="text-xs text-amber-500">Preview updated. Save the link before printing.</p>
                  )}
                </div>
              </div>
            )}

            {!targetUrl ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                The Google Review URL is not configured yet. Add it to the site environment before publishing this QR.
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-secondary/40 p-3">
                <p className="break-all text-xs text-muted-foreground">{targetUrl}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {type === 'review' && (
                <Button
                  variant="outline"
                  onClick={saveReviewUrl}
                  disabled={!normalizedReviewUrl || !hasUnsavedReviewUrl || updateSettings.isPending}
                  className="gap-2"
                >
                  <Save className="h-4 w-4" />{updateSettings.isPending ? 'Saving…' : 'Save link'}
                </Button>
              )}
              <Button onClick={downloadQr} disabled={!qrDataUrl} className="gap-2"><Download className="h-4 w-4" />Download PNG</Button>
              <Button variant="outline" onClick={copyLink} disabled={!targetUrl} className="gap-2"><Copy className="h-4 w-4" />Copy link</Button>
              {targetUrl && (
                <Button variant="ghost" asChild className="gap-2">
                  <a href={targetUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Test destination</a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Print preview</CardTitle></CardHeader>
          <CardContent>
            <div className="mx-auto max-w-sm rounded-2xl bg-white p-6 text-center text-black shadow-xl">
              <p className="font-heading text-2xl">{clientConfig.brandName.toUpperCase()}</p>
              <p className="mt-1 text-sm font-semibold">{type === 'review' ? 'Loved your food?' : 'Scan to order'}</p>
              {qrDataUrl ? <img src={qrDataUrl} alt={`${type} QR code`} className="mx-auto my-4 aspect-square w-full" /> : <div className="my-4 aspect-square w-full rounded-lg bg-zinc-100" />}
              <p className="text-sm">{type === 'review' ? 'Leave us a Google review' : 'Order from the live menu and collect when ready'}</p>
              {type === 'order' && campaign && <p className="mt-2 text-xs text-zinc-500">Source: {campaign}</p>}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
