import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Info } from 'lucide-react';
import { ALLERGEN_KEY } from '@/hooks/useProductAllergens';

interface AllergenModalProps {
  trigger?: React.ReactNode;
}

export function AllergenModal({ trigger }: AllergenModalProps) {
  const allergenEntries = Object.entries(ALLERGEN_KEY).map(([num, name]) => ({
    number: parseInt(num),
    name,
  }));

  // Split into two columns
  const midpoint = Math.ceil(allergenEntries.length / 2);
  const leftColumn = allergenEntries.slice(0, midpoint);
  const rightColumn = allergenEntries.slice(midpoint);

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary gap-1.5">
            <Info className="w-4 h-4" />
            Allergen Key
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl text-foreground">
            Allergen Key
          </DialogTitle>
        </DialogHeader>
        
        <div className="mt-4">
          <p className="text-sm text-muted-foreground mb-4">
            Each number on our menu corresponds to an allergen. Please check carefully if you have any food allergies.
          </p>
          
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {/* Left Column */}
            <div className="space-y-2">
              {leftColumn.map(({ number, name }) => (
                <div key={number} className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-sm border border-primary/20">
                    {number}
                  </span>
                  <span className="text-sm text-foreground">{name}</span>
                </div>
              ))}
            </div>
            
            {/* Right Column */}
            <div className="space-y-2">
              {rightColumn.map(({ number, name }) => (
                <div key={number} className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-sm border border-primary/20">
                    {number}
                  </span>
                  <span className="text-sm text-foreground">{name}</span>
                </div>
              ))}
            </div>
          </div>
          
          <p className="mt-6 text-xs text-muted-foreground italic">
            If you have any questions about allergens, please ask a member of staff before ordering.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
