

# Grant Admin Access to User

## User Details
- **User ID**: `e4eccd3f-dca4-4970-80a3-68f7d4f52a7f`
- **Email**: `kcodee20@gmail.com`
- **Current Roles**: None (verified via database query)

## Action Required

A single database migration will insert the admin role for this user:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('e4eccd3f-dca4-4970-80a3-68f7d4f52a7f', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
```

## Result

After this migration:
- The user will have full admin privileges
- They will see the "Admin Dashboard" link on their Profile page
- They can access Staff POS (`/admin/pos`), Kitchen Display, Stock Manager, and all staff features
- The `has_role()` function will return `true` for the `admin` role

## No Code Changes Required

This is purely a database data change - no TypeScript or component modifications needed.

