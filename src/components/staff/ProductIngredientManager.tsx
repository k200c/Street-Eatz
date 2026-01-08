import { useState } from 'react';
import { Plus, Trash2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAllIngredients,
  useProductIngredientsAdmin,
  useAddIngredient,
  useAddProductIngredient,
  useUpdateProductIngredient,
  useRemoveProductIngredient,
} from '@/hooks/useIngredients';
import { toast } from 'sonner';

interface ProductIngredientManagerProps {
  productId: string;
}

export function ProductIngredientManager({ productId }: ProductIngredientManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newIngredientName, setNewIngredientName] = useState('');
  const [selectedIngredientId, setSelectedIngredientId] = useState<string>('');

  const { data: allIngredients, isLoading: loadingAll } = useAllIngredients();
  const { data: productIngredients, isLoading: loadingProduct } = useProductIngredientsAdmin(productId);

  const addIngredient = useAddIngredient();
  const addProductIngredient = useAddProductIngredient();
  const updateProductIngredient = useUpdateProductIngredient();
  const removeProductIngredient = useRemoveProductIngredient();

  // Filter out ingredients already added to this product
  const availableIngredients = allIngredients?.filter(
    (ing) => !productIngredients?.some((pi) => pi.ingredient_id === ing.id)
  );

  const handleAddExistingIngredient = async () => {
    if (!selectedIngredientId) return;

    try {
      await addProductIngredient.mutateAsync({
        productId,
        ingredientId: selectedIngredientId,
        isDefault: true,
        isRemovable: true,
      });
      setSelectedIngredientId('');
      toast.success('Ingredient added');
    } catch (error) {
      toast.error('Failed to add ingredient');
    }
  };

  const handleCreateAndAddIngredient = async () => {
    if (!newIngredientName.trim()) return;

    try {
      const newIngredient = await addIngredient.mutateAsync(newIngredientName);
      await addProductIngredient.mutateAsync({
        productId,
        ingredientId: newIngredient.id,
        isDefault: true,
        isRemovable: true,
      });
      setNewIngredientName('');
      toast.success('New ingredient created and added');
    } catch (error) {
      toast.error('Failed to create ingredient');
    }
  };

  const handleToggleRemovable = async (id: string, currentValue: boolean) => {
    try {
      await updateProductIngredient.mutateAsync({
        id,
        productId,
        isRemovable: !currentValue,
      });
    } catch (error) {
      toast.error('Failed to update ingredient');
    }
  };

  const handleRemoveIngredient = async (id: string) => {
    try {
      await removeProductIngredient.mutateAsync({ id, productId });
      toast.success('Ingredient removed');
    } catch (error) {
      toast.error('Failed to remove ingredient');
    }
  };

  const isLoading = loadingAll || loadingProduct;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border border-border rounded-lg">
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-secondary/30 transition-colors rounded-t-lg">
          <div className="flex items-center gap-2">
            <Label className="cursor-pointer font-medium">Ingredients</Label>
            <Badge variant="secondary" className="text-xs">
              {productIngredients?.length || 0}
            </Badge>
          </div>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t border-border">
        <div className="p-3 space-y-4">
          {/* Current Ingredients List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : productIngredients && productIngredients.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Current Ingredients</p>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {productIngredients.map((pi) => (
                  <div
                    key={pi.id}
                    className="flex items-center justify-between p-2 bg-secondary/20 rounded-lg"
                  >
                    <span className="text-sm font-medium">{pi.ingredient.name}</span>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">
                          {pi.is_removable ? 'Removable' : 'Addable'}
                        </Label>
                        <Switch
                          checked={pi.is_removable}
                          onCheckedChange={() => handleToggleRemovable(pi.id, pi.is_removable)}
                          disabled={updateProductIngredient.isPending}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleRemoveIngredient(pi.id)}
                        disabled={removeProductIngredient.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-2">
              No ingredients added yet
            </p>
          )}

          {/* Add Existing Ingredient */}
          {availableIngredients && availableIngredients.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Add Existing Ingredient</p>
              <div className="flex gap-2">
                <Select value={selectedIngredientId} onValueChange={setSelectedIngredientId}>
                  <SelectTrigger className="flex-1 bg-background/50">
                    <SelectValue placeholder="Select ingredient..." />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {availableIngredients.map((ing) => (
                      <SelectItem key={ing.id} value={ing.id}>
                        {ing.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  onClick={handleAddExistingIngredient}
                  disabled={!selectedIngredientId || addProductIngredient.isPending}
                >
                  {addProductIngredient.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Create New Ingredient */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Create New Ingredient</p>
            <div className="flex gap-2">
              <Input
                placeholder="e.g., Jalapeños"
                value={newIngredientName}
                onChange={(e) => setNewIngredientName(e.target.value)}
                className="flex-1 bg-background/50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateAndAddIngredient();
                  }
                }}
              />
              <Button
                size="icon"
                onClick={handleCreateAndAddIngredient}
                disabled={!newIngredientName.trim() || addIngredient.isPending}
              >
                {addIngredient.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Legend */}
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">
              <strong>Removable:</strong> Customer can ask "No [ingredient]" • 
              <strong> Addable:</strong> Customer can ask "Extra [ingredient]"
            </p>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
