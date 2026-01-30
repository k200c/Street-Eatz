import { cn } from '@/lib/utils';
import { ALLERGEN_KEY } from '@/hooks/useProductAllergens';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface AllergenBadgesProps {
  allergenNumbers: number[];
  size?: 'sm' | 'md';
  className?: string;
  showTooltip?: boolean;
}

export function AllergenBadges({ 
  allergenNumbers, 
  size = 'sm',
  className,
  showTooltip = true
}: AllergenBadgesProps) {
  if (!allergenNumbers || allergenNumbers.length === 0) {
    return null;
  }

  const sortedAllergens = [...allergenNumbers].sort((a, b) => a - b);

  const badgeSize = size === 'sm' 
    ? 'w-4 h-4 text-[9px]' 
    : 'w-5 h-5 text-[10px]';

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn('flex flex-wrap gap-0.5', className)}>
        {sortedAllergens.map((num) => (
          showTooltip ? (
            <Tooltip key={num}>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    'inline-flex items-center justify-center rounded-full',
                    'bg-muted/60 text-muted-foreground font-medium',
                    'border border-border/50',
                    badgeSize
                  )}
                >
                  {num}
                </span>
              </TooltipTrigger>
              <TooltipContent 
                side="top" 
                className="bg-card border-border text-foreground text-xs"
              >
                {ALLERGEN_KEY[num] || `Allergen ${num}`}
              </TooltipContent>
            </Tooltip>
          ) : (
            <span
              key={num}
              className={cn(
                'inline-flex items-center justify-center rounded-full',
                'bg-muted/60 text-muted-foreground font-medium',
                'border border-border/50',
                badgeSize
              )}
            >
              {num}
            </span>
          )
        ))}
      </div>
    </TooltipProvider>
  );
}
