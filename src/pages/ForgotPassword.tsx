import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { Mail, ArrowRight, ArrowLeft, Loader2, MailCheck, KeyRound } from 'lucide-react';
import { z } from 'zod';
import streetEatzLogo from '@/assets/street-eatz-logo-new.jpeg';

const emailSchema = z.string().trim().email('Please enter a valid email').max(255, 'Email too long');

const CONFIRMATION =
  "If an account exists for that email, we've sent a reset link. Please check your inbox and spam folder.";

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || sent) return;

    const validation = emailSchema.safeParse(email);
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      return;
    }

    setError(null);
    setSubmitting(true);

    // Uniform timing floor so existing vs unknown emails are indistinguishable.
    const floor = new Promise((resolve) => setTimeout(resolve, 600));

    try {
      await Promise.all([
        supabase.auth.resetPasswordForEmail(validation.data, {
          redirectTo: `${window.location.origin}/reset-password`,
        }),
        floor,
      ]);
    } catch {
      // Intentionally ignored — never reveal whether the account exists.
      await floor;
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="p-4 flex justify-center">
        <img src={streetEatzLogo} alt="Street Eatz" className="h-12 w-auto" />
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="glass-card p-6 space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                {sent ? (
                  <MailCheck className="w-8 h-8 text-primary" />
                ) : (
                  <KeyRound className="w-8 h-8 text-primary" />
                )}
              </div>
              <h1 className="font-heading text-2xl text-foreground">
                {sent ? 'CHECK YOUR EMAIL' : 'FORGOT PASSWORD'}
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                {sent
                  ? CONFIRMATION
                  : "Enter your email and we'll send you a link to reset your password."}
              </p>
            </div>

            {!sent && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="resetEmail">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="resetEmail"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError(null);
                      }}
                      required
                      autoFocus
                      className="h-12 pl-10 bg-secondary"
                    />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <Button
                  type="submit"
                  variant="glow"
                  size="lg"
                  className="w-full h-12"
                  disabled={submitting || sent || !email.trim()}
                >
                  {submitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Send Reset Link
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </form>
            )}

            <div className="text-center">
              <Link to="/auth" className="text-primary text-sm hover:underline inline-flex items-center gap-1">
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to sign in
              </Link>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}