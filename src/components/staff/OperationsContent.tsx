import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Package, Pencil, Search, X } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { KitchenDisplaySystem } from '@/components/staff/KitchenDisplaySystem';
import { AddProductDialog } from '@/components/staff/AddProductDialog';
import { EditProductDialog } from '@/components/staff/EditProductDialog';
import { toast } from 'sonner';
import { Product, ProductCategory } from '@/types/database';
import { cn } from '@/lib/utils';

const allCategories: ProductCategory[] = [
  'Burgers', 'Flatbreads', 'Fries', 'Drinks', 'Specials', 'Sauces'
];

export function OperationsContent() {
  const { data: products, isLoading: productsLoading, refetch: refetchProducts } = useProducts();
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ProductCategory | 'All'>('All');

  // Filter products based on search and category
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    
    return products.filter(product => {
      const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === 'All' || product.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, categoryFilter]);

  const handleProductAvailability = async (productId: string, isAvailable: boolean) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_available: isAvailable })
        .eq('id', productId);

      if (error) throw error;
      refetchProducts();
      toast.success(isAvailable ? 'Item is now available' : 'Item marked as sold out');
    } catch (error) {
      toast.error('Failed to update product availability');
    }
  };

  const handleCategoryChange = async (productId: string, newCategory: ProductCategory) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ category: newCategory, updated_at: new Date().toISOString() })
        .eq('id', productId);

      if (error) throw error;
      refetchProducts();
      toast.success('Category updated');
    } catch (error) {
      toast.error('Failed to update category');
    }
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setShowEditDialog(true);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setCategoryFilter('All');
  };

  const hasActiveFilters = searchQuery || categoryFilter !== 'All';

  return (
    <div className="h-full flex flex-col lg:flex-row gap-4 p-4 overflow-hidden">
      {/* KDS Section - Takes up most space */}
      <div className="flex-1 min-h-0 overflow-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <KitchenDisplaySystem />
        </motion.div>
      </div>
      
      {/* Stock Manager Sidebar */}
      <div className="lg:w-80 xl:w-96 flex-shrink-0">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card className="bg-card border-border h-full max-h-[calc(100vh-200px)] flex flex-col">
            <CardHeader className="pb-3 flex-shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Package className="w-4 h-4 text-primary" />
                  Quick Stock
                </CardTitle>
                <AddProductDialog onProductAdded={refetchProducts} />
              </div>
            </CardHeader>

            {/* Search & Filter Bar */}
            <div className="px-4 pb-3 space-y-2 flex-shrink-0">
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 bg-secondary/30 border-border/50 text-sm"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                  >
                    <X className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
                  </button>
                )}
              </div>
              
              {/* Category Filter */}
              <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as ProductCategory | 'All')}>
                <SelectTrigger className="h-9 bg-secondary/30 border-border/50 text-sm">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="All">All Categories</SelectItem>
                  {allCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Results Count */}
            <div className="px-4 pb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{filteredProducts.length} items</span>
              {hasActiveFilters && (
                <button 
                  onClick={clearFilters}
                  className="text-primary hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>

            <CardContent className="flex-1 overflow-auto pb-4">
              {productsLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-12 bg-secondary/30 rounded animate-pulse" />
                  ))}
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {hasActiveFilters ? 'No items match your filters' : 'No products found'}
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredProducts.map((product) => (
                    <div
                      key={product.id}
                      className={cn(
                        'p-2 rounded-lg border transition-colors',
                        product.is_available
                          ? 'bg-secondary/20 border-border hover:border-primary/30'
                          : 'bg-destructive/10 border-destructive/30'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        {/* Left: Name + Category Dropdown */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <p className={cn(
                              'font-medium text-sm truncate flex-1',
                              !product.is_available && 'text-muted-foreground line-through'
                            )}>
                              {product.name}
                            </p>
                            <span className="text-primary font-bold text-xs">€{product.price.toFixed(2)}</span>
                          </div>
                          
                          {/* Inline Category Dropdown */}
                          <Select
                            value={product.category}
                            onValueChange={(value) => handleCategoryChange(product.id, value as ProductCategory)}
                          >
                            <SelectTrigger className="h-6 w-auto text-[11px] px-2 bg-secondary/40 border-none">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border">
                              {allCategories.map((cat) => (
                                <SelectItem key={cat} value={cat} className="text-xs">
                                  {cat}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {/* Right: Edit + Switch */}
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleEditProduct(product)}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Switch
                            checked={product.is_available ?? true}
                            onCheckedChange={(checked) => handleProductAvailability(product.id, checked)}
                            className="scale-90"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <EditProductDialog
          product={editingProduct}
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          onProductUpdated={refetchProducts}
        />
      </div>
    </div>
  );
}
