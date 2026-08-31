import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Download, ExternalLink, Home, Share2, Smartphone } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  type InstallExperienceState,
  requestAppInstall,
  subscribeInstallExperience,
} from '@/lib/installApp';
import { appStoreUrl, clientConfig } from '@/config/client';

const initialState: InstallExperienceState = {
  canPrompt: false,
  installed: false,
  isIosSafari: false,
};

export default function InstallApp() {
  const navigate = useNavigate();
  const [installState, setInstallState] = useState(initialState);

  useEffect(() => subscribeInstallExperience(setInstallState), []);

  const install = async () => {
    const outcome = await requestAppInstall();
    if (outcome === 'accepted') toast.success(`${clientConfig.brandName} was added to your device`);
    if (outcome === 'dismissed') toast('Installation cancelled');
    if (outcome === 'unavailable') toast('Use your browser menu and choose “Add to Home Screen”');
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-[calc(var(--safe-bottom)+2rem)]">
      <header className="sticky top-0 z-40 border-b border-border bg-black/95 backdrop-blur-sm">
        <div className="container mx-auto flex items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Go back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-heading text-xl">INSTALL {clientConfig.brandName.toUpperCase()}</h1>
            <p className="text-xs text-muted-foreground">Fast access from your phone’s Home Screen</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
        <section className="grid items-center gap-8 md:grid-cols-[0.8fr_1.2fr]">
          <div className="mx-auto w-full max-w-[260px] rounded-[3rem] border border-primary/30 bg-black p-6 shadow-2xl shadow-primary/10">
            <img src="/app-icon-1024-v2.png" alt={`${clientConfig.brandName} app icon`} className="aspect-square w-full rounded-[2rem]" />
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary">Your order, one tap away</p>
            <h2 className="mt-3 font-heading text-4xl sm:text-5xl">{clientConfig.brandName.toUpperCase()} ON YOUR PHONE</h2>
            <p className="mt-4 max-w-xl text-muted-foreground">
              Add {clientConfig.brandName} to your Home Screen for quicker ordering, saved sign-in and easy access to your orders.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              {installState.installed ? (
                <Button disabled className="gap-2"><Check className="h-4 w-4" />ALREADY INSTALLED</Button>
              ) : (
                <Button onClick={install} className="gap-2"><Download className="h-4 w-4" />INSTALL APP</Button>
              )}
              <Button asChild variant="outline" className="gap-2">
                <Link to="/menu"><ExternalLink className="h-4 w-4" />OPEN MENU</Link>
              </Button>
              {appStoreUrl ? (
                <Button asChild variant="outline" className="gap-2">
                  <a href={appStoreUrl} target="_blank" rel="noreferrer"><Smartphone className="h-4 w-4" />VIEW ON APP STORE</a>
                </Button>
              ) : (
                <Button disabled variant="outline" className="gap-2"><Smartphone className="h-4 w-4" />APP STORE · IN PREPARATION</Button>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Smartphone, title: 'Faster ordering', body: 'Open the menu directly without searching for the website.' },
            { icon: Home, title: 'Home Screen access', body: `${clientConfig.brandName} appears alongside your other apps.` },
            { icon: Check, title: 'Same secure checkout', body: 'The installed experience uses the same protected ordering and payment flow.' },
          ].map(({ icon: Icon, title, body }) => (
            <Card key={title}>
              <CardContent className="p-5">
                <Icon className="h-6 w-6 text-primary" />
                <h3 className="mt-4 font-heading text-xl">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card>
          <CardContent className="p-6">
            <h2 className="font-heading text-2xl">INSTALLATION HELP</h2>
            {installState.isIosSafari ? (
              <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-3"><span className="font-semibold text-primary">1.</span><span>Tap the <Share2 className="mx-1 inline h-4 w-4" /> Share button in Safari.</span></li>
                <li className="flex gap-3"><span className="font-semibold text-primary">2.</span><span>Scroll and choose <strong className="text-foreground">Add to Home Screen</strong>.</span></li>
                <li className="flex gap-3"><span className="font-semibold text-primary">3.</span><span>Tap <strong className="text-foreground">Add</strong> to finish.</span></li>
              </ol>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                If the Install button does not open a prompt, use your browser menu and choose <strong className="text-foreground">Install app</strong> or <strong className="text-foreground">Add to Home Screen</strong>.
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
