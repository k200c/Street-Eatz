import { MapPin, Clock } from 'lucide-react';
import { useStoreStatus } from '@/hooks/useStoreStatus';
import { cn } from '@/lib/utils';
import { clientConfig } from '@/config/client';

export function FooterInfoBar() {
  const { isStoreOpen, devModeEnabled, isStatusAvailable } = useStoreStatus();

  return (
    <div className="w-full bg-black/95 backdrop-blur-sm border-t border-white/10" style={{ minHeight: 'var(--bottom-bar-height)' }}>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-1 sm:py-2">
        <div className="flex items-center justify-between text-[10px] sm:text-xs">
          {/* Location */}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span className="hidden sm:inline truncate">{clientConfig.venueName}</span>
            <span className="sm:hidden truncate">{clientConfig.venueShortName}</span>
          </div>

          {/* Hours */}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span className="hidden sm:inline">Thu-Fri: 12-7pm · Sat-Sun: 1-7pm</span>
            <span className="sm:hidden">Thu-Sun Open</span>
          </div>

          {/* Live Status - Dynamic based on store open/closed */}
          <div className="flex items-center gap-2 select-none">
            <div 
              className={cn(
                "w-2 h-2 rounded-full",
                isStatusAvailable && "animate-pulse",
                !isStatusAvailable
                  ? "bg-muted-foreground"
                  : isStoreOpen
                    ? "bg-success shadow-[0_0_8px_hsl(var(--success))]"
                    : "bg-destructive shadow-[0_0_8px_hsl(var(--destructive))]"
              )} 
            />
            <span 
              className={cn(
                "font-semibold tracking-wider text-xs uppercase",
                !isStatusAvailable ? "text-muted-foreground" : isStoreOpen ? "text-success" : "text-destructive"
              )}
            >
              {!isStatusAvailable ? "STATUS UNAVAILABLE" : devModeEnabled ? "DEV MODE" : (isStoreOpen ? "LIVE NOW" : "CLOSED")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
