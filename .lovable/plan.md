

# Advanced Stock Management UI - Search, Filter & Category Editing

## Overview

This plan upgrades the Quick Stock sidebar in the Staff Dashboard Operations tab to support high-volume inventory management with instant search, category filtering, and inline category editing.

---

## Current State

The current `OperationsContent.tsx` has a basic stock list that:
- Shows all products in a vertical list
- Displays name, category, price, and availability toggle
- Has an edit button that opens a full dialog
- Uses `lg:w-80 xl:w-96` for the sidebar width

**Limitations:**
- No search functionality - staff must scroll through all items
- No category filter - cannot quickly narrow to specific product types
- Category changes require opening the full edit dialog
- Not optimized for fast-paced, high-density operations

---

## Solution Architecture

### New Component Structure

```text
OperationsContent.tsx
  |
  +-- Card (Stock Manager)
       |
       +-- CardHeader
       |     +-- Title + Add Item button
       |
       +-- Search & Filter Bar (NEW)
       |     +-- Search Input (with icon)
       |     +-- Category Filter Select
       |
       +-- Product List
             +-- ProductStockRow (NEW component)
                   +-- Name + Price
                   +-- Category Dropdown (inline edit)
                   +-- Availability Switch
```

---

## Implementation Details

### File 1: `src/components/staff/OperationsContent.tsx`

**Changes:**

1. **Add state for search and filter:**
```tsx
const [searchQuery, setSearchQuery] = useState('');
const [categoryFilter, setCategoryFilter] = useState<ProductCategory | 'All'>('All');
```

2. **Add filtered products logic:**
```tsx
const filteredProducts = useMemo(() => {
  if (!products) return [];
  
  return products.filter(product => {
    // Search filter
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Category filter
    const matchesCategory = categoryFilter === 'All' || product.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });
}, [products, searchQuery, categoryFilter]);
```

3. **Add Search & Filter Bar UI** below `CardHeader`:
```tsx
<div className="px-4 pb-3 space-y-2 flex-shrink-0">
  {/* Search Input */}
  <div className="relative">
    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
    <Input
      placeholder="Search items..."
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      className="pl-8 h-9 bg-black/40 border-border/50 text-sm"
    />
    {searchQuery && (
      <button 
        onClick={() => setSearchQuery('')}
        className="absolute right-2 top-1/2 -translate-y-1/2"
      >
        <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
      </button>
    )}
  </div>
  
  {/* Category Filter */}
  <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as ProductCategory | 'All')}>
    <SelectTrigger className="h-9 bg-black/40 border-border/50 text-sm">
      <SelectValue placeholder="All Categories" />
    </SelectTrigger>
    <SelectContent className="bg-card border-border">
      <SelectItem value="All">All Categories</SelectItem>
      <SelectItem value="Burgers">Burgers</SelectItem>
      <SelectItem value="Flatbreads">Flatbreads</SelectItem>
      <SelectItem value="Fries">Fries</SelectItem>
      <SelectItem value="Drinks">Drinks</SelectItem>
      <SelectItem value="Specials">Specials</SelectItem>
      <SelectItem value="Sauces">Sauces</SelectItem>
    </SelectContent>
  </Select>
</div>
```

4. **Add inline category change handler:**
```tsx
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
```

5. **Update product row with inline category dropdown:**

Replace the simple category text display with an interactive dropdown:

```tsx
<div
  key={product.id}
  className={cn(
    'p-2 rounded-lg border transition-colors',
    product.is_available
      ? 'bg-secondary/20 border-border hover:border-primary/30'
      : 'bg-red-500/10 border-red-500/30'
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
        <SelectTrigger className="h-6 w-auto text-[11px] px-2 bg-black/30 border-none">
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
```

6. **Add results count indicator:**
```tsx
<div className="px-4 pb-2 flex items-center justify-between text-xs text-muted-foreground">
  <span>{filteredProducts.length} items</span>
  {(searchQuery || categoryFilter !== 'All') && (
    <button 
      onClick={() => { setSearchQuery(''); setCategoryFilter('All'); }}
      className="text-primary hover:underline"
    >
      Clear filters
    </button>
  )}
</div>
```

---

### New Imports Required

```tsx
import { useState, useMemo } from 'react';
import { Package, Pencil, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProductCategory } from '@/types/database';
import { cn } from '@/lib/utils';
```

---

### Category Constants

Add a constant array for all categories including Sauces:

```tsx
const allCategories: ProductCategory[] = [
  'Burgers', 'Flatbreads', 'Fries', 'Drinks', 'Specials', 'Sauces'
];
```

---

## Design Considerations

### High-Density Layout

| Element | Current | New |
|---------|---------|-----|
| Row padding | `p-2.5` | `p-2` (tighter) |
| Row gap | `space-y-1.5` | `space-y-1` (denser) |
| Font sizes | `text-sm` | `text-sm` name, `text-xs` price/category |
| Button sizes | `h-7 w-7` | `h-6 w-6` (smaller) |

### Brand Colors

- Search/filter background: `bg-black/40` (dark charcoal)
- Borders: `border-border/50` (subtle)
- Active/focus: `border-primary` (orange)
- Category dropdown: Small, inline, dark background

---

## Summary of Changes

| File | Changes |
|------|---------|
| `src/components/staff/OperationsContent.tsx` | Add search state, category filter state, filtered products memo, search bar UI, category filter UI, inline category dropdown in rows, results count, clear filters button |

---

## Expected Result

```text
┌─────────────────────────────────────┐
│ 📦 Quick Stock           [+ Add]   │
├─────────────────────────────────────┤
│ 🔍 Search items...              [x] │
│ [▼ All Categories              ]    │
├─────────────────────────────────────┤
│ 12 items                Clear filters│
├─────────────────────────────────────┤
│ Classic Smash           €12.50 ✏️ ◯ │
│ [▼ Burgers]                         │
├─────────────────────────────────────┤
│ Loaded Fries            €8.50  ✏️ ◯ │
│ [▼ Fries]                           │
├─────────────────────────────────────┤
│ Jerk Mayonnaise         €1.50  ✏️ ◯ │
│ [▼ Sauces]                          │
└─────────────────────────────────────┘
```

**Features:**
- Instant search filtering as you type
- Category dropdown to narrow list
- Inline category change without opening dialog
- Compact, high-density rows for fast scrolling
- Clear filters button when filters are active
- Item count shows filtered results

