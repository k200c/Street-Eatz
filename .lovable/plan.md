

# Create 'get-wait-time' Edge Function and Update Wait Time Options

## Overview

Create a new public Edge Function for n8n integration that returns the current wait time, and update the Command Center wait time options to match the requested values.

---

## Part 1: Create Edge Function

### File: `supabase/functions/get-wait-time/index.ts`

Create a new Edge Function that:
- Queries `app_settings` table for `current_wait_time`
- Returns JSON response: `{ "wait_time": "20 mins" }`
- Uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS
- Supports both GET and POST requests for flexibility
- Has CORS headers for external access

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    console.log('[get-wait-time] Fetching current wait time');

    const { data, error } = await supabase
      .from('app_settings')
      .select('current_wait_time')
      .eq('id', 1)
      .single();

    if (error) {
      console.error('[get-wait-time] Database error:', error);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch wait time' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const waitTime = data?.current_wait_time || '20 mins';
    console.log('[get-wait-time] Returning wait time:', waitTime);

    return new Response(
      JSON.stringify({
        success: true,
        wait_time: waitTime
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[get-wait-time] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
```

---

## Part 2: Configure Edge Function

### File: `supabase/config.toml`

Add configuration to disable JWT verification (allows n8n to call without auth):

```toml
[functions.get-wait-time]
verify_jwt = false
```

---

## Part 3: Update Wait Time Options

### File: `src/pages/CommandCenter.tsx`

Update line 25 to match the requested options:

**Current:**
```typescript
const waitTimeOptions = ['15 mins', '20 mins', '30 mins', '45 mins', '1 hour'];
```

**Updated:**
```typescript
const waitTimeOptions = ['10 mins', '20 mins', '30 mins', '45 mins', '60 mins'];
```

This changes:
- `'15 mins'` to `'10 mins'` 
- `'1 hour'` to `'60 mins'` (consistent format)

---

## Summary of Changes

| File | Change |
|------|--------|
| `supabase/functions/get-wait-time/index.ts` | **NEW** - Edge function to return current wait time |
| `supabase/config.toml` | Add `[functions.get-wait-time]` with `verify_jwt = false` |
| `src/pages/CommandCenter.tsx` | Update `waitTimeOptions` array to match requirements |

---

## API Response Format

### Endpoint
```
GET/POST https://ftzinsesuiuqcjfpbaur.supabase.co/functions/v1/get-wait-time
```

### Success Response
```json
{
  "success": true,
  "wait_time": "20 mins"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Failed to fetch wait time"
}
```

---

## n8n Integration Notes

To call this endpoint from n8n:

1. Use HTTP Request node
2. Method: GET
3. URL: `https://ftzinsesuiuqcjfpbaur.supabase.co/functions/v1/get-wait-time`
4. No authentication required (public endpoint)
5. Parse JSON response to get `wait_time` field

---

## Real-time Behavior

The existing Command Center UI already:
- Updates `current_wait_time` immediately when staff changes the dropdown
- Uses `useUpdateAppSettings` mutation which calls Supabase directly
- Has realtime subscription via `useAppSettings` hook

When a staff member changes the wait time:
1. Dropdown selection triggers `handleWaitTimeChange`
2. Database is updated immediately
3. Next n8n call to `get-wait-time` returns the fresh value

---

## Verification Steps

1. **Deploy Edge Function**: Function will auto-deploy on save
2. **Test Endpoint**:
   ```bash
   curl https://ftzinsesuiuqcjfpbaur.supabase.co/functions/v1/get-wait-time
   ```
3. **Verify UI**: Open Command Center and confirm dropdown shows new options: "10 mins", "20 mins", "30 mins", "45 mins", "60 mins"
4. **Test Update**: Change wait time in UI, then call endpoint again to confirm new value is returned

