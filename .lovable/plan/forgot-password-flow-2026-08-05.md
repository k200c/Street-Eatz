# Forgot Password Flow

Add a self-service password reset for customers, matching the existing Street Eatz dark/orange styling and mobile-first layout. No existing auth logic, tables, policies, or edge functions change.

## What the user sees

1. **Sign-in screen** — a small "Forgot password?" link under the password field (only in sign-in mode, hidden while signing up).
2. **/forgot-password** — one email field, one submit button. After submit it always shows the same confirmation: "If an account exists for that email, we've sent a reset link. Please check your inbox and spam folder." The same message appears whether or not the email is registered, and even if the backend call errors, so nobody can use this page to discover which emails exist. The button is disabled while sending and stays disabled afterwards to stop double-sends.
3. **/reset-password** — reached from the email link. Shows a short "verifying link" state, then new password + confirm password fields with live inline validation (min 8 characters, both must match). On success: a confirmation screen with a button to sign in.
4. **Invalid / expired link** — a clear explanation plus a "Request a new link" button back to /forgot-password. Never a blank page or raw error text.

## Technical detail

New files:
- `src/pages/ForgotPassword.tsx` — email validated with the same zod pattern already used in Auth.tsx; calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' })`. Result ignored for display purposes; a fixed ~600ms floor before showing the confirmation keeps timing uniform for existing vs unknown emails.
- `src/pages/ResetPassword.tsx` — subscribes to `supabase.auth.onAuthStateChange`, accepts `PASSWORD_RECOVERY` or an `INITIAL_SESSION`/`SIGNED_IN` event carrying a session as proof of a valid recovery session; a ~6s timeout with no session switches to the expired-link state. Submit calls `supabase.auth.updateUser({ password })`; errors mentioning expired/invalid/same-password are mapped to friendly copy, expiry cases route to the expired-link state. On success it signs the recovery session out and navigates to `/auth`.

Edited files:
- `src/pages/Auth.tsx` — presentation only: add the "Forgot password?" link below the password field.
- `src/App.tsx` — register `/forgot-password` and `/reset-password` as public routes (no AuthGuard), placed with the other public routes so the recovery session is not redirected away.

Both pages reuse the existing card/logo/`variant="glow"` button treatment from Auth.tsx, `min-h-screen` with `h-12` inputs for touch targets, and `sonner` toasts only for non-sensitive feedback.
