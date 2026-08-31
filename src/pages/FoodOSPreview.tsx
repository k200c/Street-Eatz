import { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bell,
  Bot,
  Boxes,
  CalendarClock,
  ChefHat,
  CircleDollarSign,
  ClipboardCheck,
  CreditCard,
  DatabaseBackup,
  FileOutput,
  FileText,
  Gauge,
  Globe2,
  HardDriveUpload,
  HeartHandshake,
  Mail,
  MapPin,
  Megaphone,
  MenuSquare,
  PackageOpen,
  PhoneCall,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Store,
  Tags,
  Truck,
  UserRoundCog,
  UsersRound,
  UtensilsCrossed,
  WalletCards,
  Wifi,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  foodOsDomains,
  foodOsModules,
  type FoodOSDomain,
  type FoodOSIconName,
  type FoodOSModule,
  type FoodOSStatus,
} from '@/config/foodOsModules';

const moduleWorkspace: Partial<Record<number, { path: string; label: string; protected?: boolean }>> = {
  1: { path: '/menu', label: 'Test web ordering' },
  3: { path: '/qr/order?location=crystal-centre&campaign=os-preview&table=demo', label: 'Test QR ordering' },
  4: { path: '/menu', label: 'Open installable app' },
  11: { path: '/admin', label: 'Open kitchen operations', protected: true },
  13: { path: '/admin/pos', label: 'Open staff POS', protected: true },
  15: { path: '/admin/dashboard?tab=operations', label: 'Open menu operations', protected: true },
  28: { path: '/admin/dashboard?tab=customers', label: 'Open customer CRM', protected: true },
  29: { path: '/admin/dashboard?tab=marketing', label: 'Open SMS marketing', protected: true },
  30: { path: '/admin/dashboard?tab=social', label: 'Open content workspace', protected: true },
  35: { path: '/admin/dashboard?tab=analytics', label: 'Open business insights', protected: true },
  36: { path: '/admin/dashboard?tab=analytics', label: 'Open owner reporting', protected: true },
  37: { path: '/admin/dashboard?tab=assistant', label: 'Open owner assistant', protected: true },
};

const iconMap: Record<FoodOSIconName, LucideIcon> = {
  orders: ShoppingBag,
  voice: PhoneCall,
  qr: QrCode,
  mobile: Smartphone,
  calendar: CalendarClock,
  reviews: HeartHandshake,
  loyalty: Sparkles,
  discounts: Tags,
  allergens: UtensilsCrossed,
  kitchen: ChefHat,
  printer: Printer,
  pos: CreditCard,
  menu: MenuSquare,
  clock: Gauge,
  inventory: Boxes,
  staff: UsersRound,
  safety: ClipboardCheck,
  suppliers: Truck,
  payments: WalletCards,
  refunds: RefreshCw,
  invoices: Receipt,
  cash: CircleDollarSign,
  tips: HeartHandshake,
  customers: UsersRound,
  broadcast: Megaphone,
  content: Sparkles,
  ads: BarChart3,
  phone: PhoneCall,
  location: MapPin,
  email: Mail,
  analytics: BarChart3,
  reports: FileText,
  assistant: Bot,
  settings: Settings2,
  tenants: Store,
  automation: Activity,
  security: ShieldCheck,
  monitoring: Wifi,
  billing: CreditCard,
  export: FileOutput,
  import: HardDriveUpload,
  devices: Smartphone,
  notifications: Bell,
  api: Globe2,
  docs: FileText,
  qa: ClipboardCheck,
  backup: DatabaseBackup,
};

const statusMeta: Record<FoodOSStatus, { label: string; className: string; dot: string }> = {
  live: {
    label: 'Live',
    className: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
    dot: 'bg-emerald-400',
  },
  hardening: {
    label: 'Needs hardening',
    className: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
    dot: 'bg-amber-400',
  },
  building: {
    label: 'In build',
    className: 'border-sky-400/25 bg-sky-400/10 text-sky-200',
    dot: 'bg-sky-400',
  },
  planned: {
    label: 'Planned',
    className: 'border-white/10 bg-white/5 text-zinc-300',
    dot: 'bg-zinc-500',
  },
  parked: {
    label: 'Optional / parked',
    className: 'border-violet-400/20 bg-violet-400/10 text-violet-200',
    dot: 'bg-violet-400',
  },
};

type DomainFilter = 'all' | FoodOSDomain;

function ModuleCard({
  module,
  selected,
  onSelect,
}: {
  module: FoodOSModule;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = iconMap[module.icon];
  const status = statusMeta[module.status];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group min-h-[196px] rounded-2xl border p-5 text-left transition-all duration-200',
        'bg-zinc-950/70 hover:-translate-y-0.5 hover:border-orange-500/45 hover:bg-zinc-900/90',
        selected
          ? 'border-orange-500/70 shadow-[0_0_28px_rgba(249,115,22,0.14)]'
          : 'border-white/10',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-orange-400">
          <Icon className="h-5 w-5" />
        </div>
        <span className={cn('rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]', status.className)}>
          {status.label}
        </span>
      </div>

      <div className="mt-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
          Module {String(module.id).padStart(2, '0')} · {module.priority}
        </p>
        <h3 className="mt-1 text-base font-extrabold normal-case tracking-normal text-white">
          {module.name}
        </h3>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-400">
          {module.description}
        </p>
      </div>
    </button>
  );
}

export default function FoodOSPreview() {
  const navigate = useNavigate();
  const [activeDomain, setActiveDomain] = useState<DomainFilter>('all');
  const [query, setQuery] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [selectedModuleId, setSelectedModuleId] = useState(35);
  const [visibility, setVisibility] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(foodOsModules.map((module) => [module.id, module.defaultVisible])),
  );

  const statusCounts = useMemo(
    () => ({
      live: foodOsModules.filter((module) => module.status === 'live').length,
      building: foodOsModules.filter((module) => module.status === 'building').length,
      hardening: foodOsModules.filter((module) => module.status === 'hardening').length,
      planned: foodOsModules.filter((module) => module.status === 'planned').length,
    }),
    [],
  );

  const filteredModules = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return foodOsModules.filter((module) => {
      const matchesDomain = activeDomain === 'all' || module.domain === activeDomain;
      const matchesQuery = !normalizedQuery
        || module.name.toLowerCase().includes(normalizedQuery)
        || module.description.toLowerCase().includes(normalizedQuery);
      const matchesVisibility = showHidden || visibility[module.id];
      return matchesDomain && matchesQuery && matchesVisibility;
    });
  }, [activeDomain, query, showHidden, visibility]);

  const selectedModule = foodOsModules.find((module) => module.id === selectedModuleId) ?? foodOsModules[0];
  const SelectedIcon = iconMap[selectedModule.icon];
  const selectedStatus = statusMeta[selectedModule.status];
  const workspace = moduleWorkspace[selectedModule.id];

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-zinc-300 hover:bg-white/10 hover:text-white"
              onClick={() => navigate('/')}
              aria-label="Return to customer site"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-black uppercase tracking-[0.18em] sm:text-base">
                Food <span className="text-orange-500">OS</span> · Operations
              </p>
              <p className="truncate text-xs text-zinc-500">Visual system preview</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1 text-xs font-bold text-sky-200 sm:inline-flex">
              No live actions
            </span>
            <Button type="button" className="bg-orange-500 text-black hover:bg-orange-400">
              <Sparkles className="mr-2 h-4 w-4" />
              Ask Food OS
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-3xl border border-orange-500/20 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.18),transparent_34%),linear-gradient(135deg,#17110d,#0b0b0b_55%)] p-6 sm:p-8">
          <div className="grid gap-8 xl:grid-cols-[1fr_520px] xl:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/25 bg-orange-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-orange-300">
                <Activity className="h-3.5 w-3.5" />
                Visual foundation · Phase 1
              </div>
              <h1 className="mt-5 max-w-4xl text-3xl font-black normal-case tracking-[-0.04em] sm:text-5xl">
                One operating view for every order, module and decision.
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-300 sm:text-base">
                This preview turns the Food OS register into a modular owner console. Honest status labels separate what is live, what needs hardening and what is only planned.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Live', value: statusCounts.live, tone: 'text-emerald-300' },
                { label: 'In build', value: statusCounts.building, tone: 'text-sky-300' },
                { label: 'Harden', value: statusCounts.hardening, tone: 'text-amber-300' },
                { label: 'Planned', value: statusCounts.planned, tone: 'text-zinc-200' },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <p className={cn('text-3xl font-black', item.tone)}>{item.value}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-4">
          {[
            { step: '01', title: 'Visual foundation', body: 'Approve information architecture, module visibility and interaction patterns.', active: true },
            { step: '02', title: 'Secure the core', body: 'Harden ordering, payment, access and webhook boundaries.', active: false },
            { step: '03', title: 'Connect modules', body: 'Wire each approved view to canonical data and tools-first actions.', active: false },
            { step: '04', title: 'Prove production', body: 'Automated journeys, manual service checks and signed release evidence.', active: false },
          ].map((lane) => (
            <div key={lane.step} className={cn('rounded-2xl border p-5', lane.active ? 'border-orange-500/40 bg-orange-500/10' : 'border-white/10 bg-zinc-950/70')}>
              <p className="text-xs font-black tracking-[0.18em] text-orange-400">{lane.step}</p>
              <h2 className="mt-3 text-base font-extrabold normal-case tracking-normal">{lane.title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{lane.body}</p>
            </div>
          ))}
        </section>

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-w-0">
            <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-3 sm:p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setActiveDomain('all')}
                    className={cn('whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold', activeDomain === 'all' ? 'bg-orange-500 text-black' : 'bg-white/5 text-zinc-300 hover:bg-white/10')}
                  >
                    All modules
                  </button>
                  {foodOsDomains.map((domain) => (
                    <button
                      key={domain.id}
                      type="button"
                      onClick={() => setActiveDomain(domain.id)}
                      className={cn('whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold', activeDomain === domain.id ? 'bg-orange-500 text-black' : 'bg-white/5 text-zinc-300 hover:bg-white/10')}
                    >
                      {domain.shortLabel}
                    </button>
                  ))}
                </div>

                <label className="relative block w-full lg:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <span className="sr-only">Search modules</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search modules"
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/40 pl-10 pr-4 text-sm outline-none transition focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/10"
                  />
                </label>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Owner workspace</p>
                <h2 className="mt-1 text-xl font-black normal-case tracking-normal">
                  {activeDomain === 'all'
                    ? 'Visible modules'
                    : foodOsDomains.find((domain) => domain.id === activeDomain)?.label}
                </h2>
              </div>
              <label className="flex items-center gap-3 text-sm text-zinc-400">
                Show hidden
                <Switch checked={showHidden} onCheckedChange={setShowHidden} />
              </label>
            </div>

            {filteredModules.length > 0 ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {filteredModules.map((module) => (
                  <ModuleCard
                    key={module.id}
                    module={module}
                    selected={module.id === selectedModule.id}
                    onSelect={() => setSelectedModuleId(module.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-12 text-center">
                <Search className="mx-auto h-6 w-6 text-zinc-600" />
                <p className="mt-3 font-bold">No visible modules match this view.</p>
                <p className="mt-1 text-sm text-zinc-500">Change the filter or enable hidden modules.</p>
              </div>
            )}
          </section>

          <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
            <div className="rounded-2xl border border-orange-500/25 bg-gradient-to-b from-orange-500/10 to-zinc-950 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500 text-black">
                  <SelectedIcon className="h-6 w-6" />
                </div>
                <span className={cn('rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]', selectedStatus.className)}>
                  {selectedStatus.label}
                </span>
              </div>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-orange-400">
                Module {String(selectedModule.id).padStart(2, '0')} · {selectedModule.priority}
              </p>
              <h2 className="mt-2 text-2xl font-black normal-case tracking-[-0.02em]">{selectedModule.name}</h2>
              <p className="mt-3 text-sm leading-7 text-zinc-300">{selectedModule.description}</p>
              <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Release rule</p>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  Visual approval → canonical data/tools → automated QA → manual proof → production verification.
                </p>
              </div>
              <Button
                type="button"
                disabled={!workspace}
                onClick={() => workspace && navigate(workspace.path)}
                className="mt-5 w-full bg-orange-500 text-black hover:bg-orange-400 disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                {workspace?.label ?? 'Workspace not connected yet'}
              </Button>
              {workspace?.protected && (
                <p className="mt-2 text-center text-xs text-zinc-500">Administrator sign-in required.</p>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Settings preview</p>
                  <h2 className="mt-1 text-lg font-black normal-case tracking-normal">Module visibility</h2>
                </div>
                <Settings2 className="h-5 w-5 text-orange-400" />
              </div>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Local visual state only. Nothing is saved or changed in production.
              </p>
              <div className="mt-4 max-h-[420px] space-y-1 overflow-y-auto pr-1 custom-scrollbar">
                {foodOsModules.map((module) => (
                  <label key={module.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-white/5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-zinc-200">{module.name}</span>
                      <span className="block text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                        {foodOsDomains.find((domain) => domain.id === module.domain)?.shortLabel}
                      </span>
                    </span>
                    <Switch
                      checked={visibility[module.id]}
                      onCheckedChange={(checked) => setVisibility((current) => ({ ...current, [module.id]: checked }))}
                    />
                  </label>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
