import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Boxes, CalendarDays, CheckCircle2, ClipboardCheck, Loader2, Plus, ReceiptText, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useFoodOSModules, useOperationsSnapshot } from '@/hooks/useFoodOSModules';

const operationsModuleKeys = [
  'operations_inventory',
  'operations_roster',
  'operations_haccp',
  'operations_food_safety',
  'operations_end_of_day',
] as const;

export function OperationsHub() {
  const { data: modules = [] } = useFoodOSModules();
  const { data, isLoading, error } = useOperationsSnapshot();
  const [itemName, setItemName] = useState('');
  const [itemUnit, setItemUnit] = useState('each');
  const [openingQuantity, setOpeningQuantity] = useState('0');
  const [reorderLevel, setReorderLevel] = useState('0');
  const [safetyType, setSafetyType] = useState('opening_check');
  const [checkpoint, setCheckpoint] = useState('');
  const [safetyStatus, setSafetyStatus] = useState('pass');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const queryClient = useQueryClient();

  const enabled = new Set(modules.filter((module) => module.enabled).map((module) => module.module_key));
  const show = (key: typeof operationsModuleKeys[number]) => modules.length === 0 || enabled.has(key);

  const createInventoryItem = useMutation({
    mutationFn: async () => {
      const { error: insertError } = await supabase.from('inventory_items').insert({
        name: itemName.trim(),
        unit: itemUnit,
        opening_quantity: Number(openingQuantity),
        reorder_level: Number(reorderLevel),
      });
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      setItemName(''); setOpeningQuantity('0'); setReorderLevel('0');
      queryClient.invalidateQueries({ queryKey: ['foodos-operations-snapshot'] });
      toast.success('Stock item added');
    },
    onError: (mutationError) => { console.error(mutationError); toast.error('Stock item could not be added'); },
  });

  const recordSafetyLog = useMutation({
    mutationFn: async () => {
      const { error: insertError } = await supabase.from('food_safety_logs').insert({
        log_type: safetyType,
        checkpoint: checkpoint.trim(),
        status: safetyStatus,
        corrective_action: safetyStatus === 'fail' ? correctiveAction.trim() : null,
      });
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      setCheckpoint(''); setCorrectiveAction(''); setSafetyStatus('pass');
      queryClient.invalidateQueries({ queryKey: ['foodos-operations-snapshot'] });
      toast.success('Food-safety record saved');
    },
    onError: (mutationError) => { console.error(mutationError); toast.error('Food-safety record could not be saved'); },
  });

  if (isLoading) return <div className="h-56 animate-pulse rounded-xl bg-secondary/30" />;
  if (error) return <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">Operations data could not be loaded.</p>;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-2xl font-bold">Operations</h2>
        <p className="text-sm text-muted-foreground">Practical MVP controls backed by auditable records. Expand each area only when you need it.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {show('operations_inventory') && <SummaryCard icon={Boxes} label="Stock items" value={String(data?.inventory.length ?? 0)} note={`${data?.lowStockCount ?? 0} at or below reorder level`} tone={(data?.lowStockCount ?? 0) > 0 ? 'warning' : 'normal'} />}
        {show('operations_inventory') && <SummaryCard icon={ReceiptText} label="Recorded stock value" value={`€${(data?.inventoryValue ?? 0).toFixed(2)}`} note="Based only on entered quantities and costs" />}
        {show('operations_roster') && <SummaryCard icon={CalendarDays} label="Next 7 days" value={String(data?.shifts.length ?? 0)} note="scheduled shifts" />}
        {(show('operations_haccp') || show('operations_food_safety')) && <SummaryCard icon={ShieldCheck} label="Checks today" value={String(data?.safetyLogs.length ?? 0)} note={`${data?.failedSafetyChecks ?? 0} failed checks`} tone={(data?.failedSafetyChecks ?? 0) > 0 ? 'warning' : 'normal'} />}
      </div>

      <Accordion type="multiple" defaultValue={[show('operations_inventory') ? 'inventory' : '', show('operations_food_safety') ? 'safety' : ''].filter(Boolean)} className="space-y-3">
        {show('operations_inventory') && (
          <AccordionItem value="inventory" className="rounded-xl border border-border bg-card px-4">
            <AccordionTrigger className="hover:no-underline"><span className="flex items-center gap-2"><Boxes className="h-5 w-5 text-primary" />Inventory & stock</span></AccordionTrigger>
            <AccordionContent className="space-y-5 pt-2">
              <div className="grid gap-3 md:grid-cols-4">
                <Field label="Item name"><Input value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="e.g. Burger buns" /></Field>
                <Field label="Unit"><Select value={itemUnit} onValueChange={setItemUnit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['each','g','kg','ml','l','pack','case'].map((unit) => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Opening quantity"><Input type="number" min="0" step="0.001" value={openingQuantity} onChange={(event) => setOpeningQuantity(event.target.value)} /></Field>
                <Field label="Reorder at"><Input type="number" min="0" step="0.001" value={reorderLevel} onChange={(event) => setReorderLevel(event.target.value)} /></Field>
              </div>
              <Button onClick={() => createInventoryItem.mutate()} disabled={createInventoryItem.isPending || itemName.trim().length < 2 || Number(openingQuantity) < 0 || Number(reorderLevel) < 0}>
                {createInventoryItem.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Add stock item
              </Button>
              {(data?.inventory.length ?? 0) === 0 ? (
                <EmptyState text="No stock items have been entered yet. Add the first item above; no sample quantities are shown." />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[560px] text-sm"><thead className="bg-secondary/30 text-muted-foreground"><tr><th className="p-3 text-left">Item</th><th className="p-3 text-right">On hand</th><th className="p-3 text-right">Reorder</th><th className="p-3 text-right">Status</th></tr></thead><tbody>
                    {data?.inventory.map((item) => <tr key={item.id} className="border-t border-border"><td className="p-3 font-medium">{item.name}</td><td className="p-3 text-right">{Number(item.quantity_on_hand ?? 0).toFixed(2)} {item.unit}</td><td className="p-3 text-right">{Number(item.reorder_level ?? 0).toFixed(2)}</td><td className="p-3 text-right"><Badge variant={item.low_stock ? 'destructive' : 'secondary'}>{item.low_stock ? 'Reorder' : 'OK'}</Badge></td></tr>)}
                  </tbody></table>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        )}

        {(show('operations_haccp') || show('operations_food_safety')) && (
          <AccordionItem value="safety" className="rounded-xl border border-border bg-card px-4">
            <AccordionTrigger className="hover:no-underline"><span className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-primary" />HACCP & food-safety log</span></AccordionTrigger>
            <AccordionContent className="space-y-5 pt-2">
              <div className="grid gap-3 lg:grid-cols-3">
                <Field label="Check type"><Select value={safetyType} onValueChange={setSafetyType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="opening_check">Opening check</SelectItem><SelectItem value="closing_check">Closing check</SelectItem><SelectItem value="fridge_temperature">Fridge temperature</SelectItem><SelectItem value="freezer_temperature">Freezer temperature</SelectItem><SelectItem value="cleaning">Cleaning</SelectItem><SelectItem value="allergen_check">Allergen check</SelectItem><SelectItem value="delivery_check">Delivery check</SelectItem><SelectItem value="incident">Incident</SelectItem></SelectContent></Select></Field>
                <Field label="Checkpoint"><Input value={checkpoint} onChange={(event) => setCheckpoint(event.target.value)} placeholder="What was checked?" /></Field>
                <Field label="Result"><Select value={safetyStatus} onValueChange={setSafetyStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pass">Pass</SelectItem><SelectItem value="fail">Fail</SelectItem><SelectItem value="not_applicable">Not applicable</SelectItem></SelectContent></Select></Field>
              </div>
              {safetyStatus === 'fail' && <Field label="Corrective action (required)"><Textarea value={correctiveAction} onChange={(event) => setCorrectiveAction(event.target.value)} placeholder="What was done immediately to make this safe?" /></Field>}
              <Button onClick={() => recordSafetyLog.mutate()} disabled={recordSafetyLog.isPending || checkpoint.trim().length < 2 || (safetyStatus === 'fail' && correctiveAction.trim().length < 3)}>
                {recordSafetyLog.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Save record
              </Button>
              <p className="text-xs text-muted-foreground">Saved records are time-stamped and append-only. Failed checks require a corrective action.</p>
            </AccordionContent>
          </AccordionItem>
        )}

        {show('operations_roster') && <RoadmapSection value="roster" icon={CalendarDays} title="Rostering & scheduling" status="MVP foundation" text="Shift records and secure staff visibility are active. Staff assignment, availability and publishing controls will be enabled after Danny confirms the operating process." />}
        {show('operations_end_of_day') && <RoadmapSection value="eod" icon={ReceiptText} title="End of day" status="Planned" text="Cash, card, tips, refunds and variance reconciliation will use payment and till evidence. It will not estimate missing figures." />}
      </Accordion>
    </section>
  );
}

function SummaryCard({ icon: Icon, label, value, note, tone = 'normal' }: { icon: typeof Boxes; label: string; value: string; note: string; tone?: 'normal' | 'warning' }) {
  return <Card className={tone === 'warning' ? 'border-amber-500/40' : ''}><CardContent className="flex items-start justify-between p-4"><div><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{note}</p></div><Icon className={`h-7 w-7 ${tone === 'warning' ? 'text-amber-400' : 'text-primary'} opacity-70`} /></CardContent></Card>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="flex items-start gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{text}</div>;
}

function RoadmapSection({ value, icon: Icon, title, status, text }: { value: string; icon: typeof CalendarDays; title: string; status: string; text: string }) {
  return <AccordionItem value={value} className="rounded-xl border border-border bg-card px-4"><AccordionTrigger className="hover:no-underline"><span className="flex items-center gap-2"><Icon className="h-5 w-5 text-primary" />{title}<Badge variant="secondary">{status}</Badge></span></AccordionTrigger><AccordionContent><Card className="border-dashed"><CardHeader><CardTitle className="text-base">Foundation ready</CardTitle><CardDescription>{text}</CardDescription></CardHeader></Card></AccordionContent></AccordionItem>;
}
