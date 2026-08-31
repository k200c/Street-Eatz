import { useMemo } from 'react';
import { CheckCircle2, Eye, EyeOff, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useFoodOSModules, useSetFoodOSModuleEnabled, type FoodOSModuleDomain } from '@/hooks/useFoodOSModules';

const domainLabels: Record<FoodOSModuleDomain, string> = {
  marketing: 'Marketing',
  operations: 'Operations',
  intelligence: 'Insights & intelligence',
  customer: 'Customer experience',
  finance: 'Finance',
};

const lifecycleLabels: Record<string, string> = {
  live: 'Live',
  mvp: 'MVP',
  connection_required: 'Connection required',
  planned: 'Planned',
  paused: 'Paused',
};

export function ModuleSettingsPanel() {
  const { data: modules = [], isLoading, error } = useFoodOSModules();
  const setEnabled = useSetFoodOSModuleEnabled();
  const grouped = useMemo(() => {
    return modules.reduce<Partial<Record<FoodOSModuleDomain, typeof modules>>>((result, module) => {
      const domain = module.domain as FoodOSModuleDomain;
      result[domain] = [...(result[domain] ?? []), module];
      return result;
    }, {});
  }, [modules]);

  const toggleModule = async (moduleKey: string, enabled: boolean, label: string) => {
    try {
      await setEnabled.mutateAsync({ moduleKey, enabled });
      toast.success(`${label} ${enabled ? 'shown' : 'hidden'}`);
    } catch (toggleError) {
      console.error(toggleError);
      toast.error(`Could not update ${label}`);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-primary" />FoodOS module visibility</CardTitle>
          <CardDescription>
            Choose what Danny sees in the operating system. Hiding a module removes it from its workspace without deleting its records.
          </CardDescription>
        </CardHeader>
      </Card>

      {isLoading && <div className="h-48 animate-pulse rounded-xl bg-secondary/30" />}
      {error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">Module settings could not be loaded.</p>}

      {(Object.keys(domainLabels) as FoodOSModuleDomain[]).map((domain) => {
        const domainModules = grouped[domain] ?? [];
        if (domainModules.length === 0) return null;
        return (
          <Card key={domain}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{domainLabels[domain]}</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border p-0">
              {domainModules.map((module) => (
                <div key={module.module_key} className="flex items-start justify-between gap-4 px-6 py-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{module.label}</p>
                      <Badge variant={module.lifecycle_status === 'live' ? 'default' : 'secondary'}>
                        {lifecycleLabels[module.lifecycle_status] ?? module.lifecycle_status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{module.description}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      {module.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      {module.enabled ? 'Visible in FoodOS' : 'Hidden from FoodOS'}
                    </p>
                  </div>
                  <Switch
                    checked={module.enabled}
                    disabled={setEnabled.isPending}
                    aria-label={`${module.enabled ? 'Hide' : 'Show'} ${module.label}`}
                    onCheckedChange={(enabled) => void toggleModule(module.module_key, enabled, module.label)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      <div className="flex items-start gap-2 rounded-lg border border-green-500/30 bg-green-500/5 p-4 text-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
        <p>Module status and visibility are stored centrally, ready to be reused for future FoodOS clients.</p>
      </div>
    </div>
  );
}
