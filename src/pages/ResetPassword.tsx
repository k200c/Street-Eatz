import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { Lock, Loader2, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import streetEatzLogo from '@/assets/street-eatz-logo-new.jpeg';

type Stage = 'verifying' | 'form' | 'invalid' | 'success';

const MIN_LENGTH = 8;

export default function ResetPassword() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('verifying');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [touched, setTouched] = useState({ password: false, confirm: false });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const resolved = useRef(false);

  // Wait for the recovery session delivered by the email link.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (resolved.current) return;
      if (event === 'PASSWORD_RECOVERY' || ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session)) {
        resolved.current = true;
        setStage('form');
      }
    });

    const timeout = setTimeout(() => {
      if (!resolved.current) {
        resolved.current = true;
        setStage('invalid');
      }
    }, 6000);

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const passwordError =
    password.length === 0
      ? 'Password is required'
      : password.length < MIN_LENGTH
        ? `Password must be at least ${MIN_LENGTH} characters`
        : null;

  const confirmError =
    confirmPassword.length === 0
      ? 'Please confirm your password'
      : confirmPassword !== password
        ? 'Passwords do not match'
        : null;

  const canSubmit = !passwordError && !confirmError && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ password: true, confirm: true });
    if (!canSubmit) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        const message = (error.message || '').toLowerCase();
        if (
          message.includes('expired') ||
          message.includes('invalid') ||
          message.includes('session') ||
          message.includes('jwt') ||
          message.includes('token')
        ) {
          setStage('invalid');
          return;
        }
        if (message.includes('should be different') || message.includes('same as')) {
          setSubmitError('Please choose a password different from your current one.');
          return;
        }
        setSubmitError(error.message || 'Could not update your password. Please try again.');
        return;
      }

      // Clear the recovery session so the user signs in with the new password.
      await supabase.auth.signOut().catch(() => undefined);
      setStage('success');
    } catch {
      setSubmitError('Could not update your password. Please try again.');
    } finally {
      setSubmitting(false);
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
            {stage === 'verifying' && (
              <div className="text-center py-6 space-y-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                <p className="text-muted-foreground text-sm">Verifying your reset link…</p>
              </div>
            )}

            {stage === 'invalid' && (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle className="w-8 h-8 text-destructive" />
                  </div>
                  <h1 className="font-heading text-2xl text-foreground">LINK NO LONGER VALID</h1>
                  <p className="text-muted-foreground text-sm mt-2">
                    This password reset link has expired or has already been used. Reset links are
                    single-use and time limited — request a new one to continue.
                  </p>
                </div>
                <Button
                  variant="glow"
                  size="lg"
                  className="w-full h-12"
                  onClick={() => navigate('/forgot-password', { replace: true })}
                >
                  Request a New Link
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <div className="text-center">
                  <Link to="/auth" className="text-primary text-sm hover:underline">
                    Back to sign in
                  </Link>
                </div>
              </div>
            )}

            {stage === 'success' && (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-primary" />
                  </div>
                  <h1 className="font-heading text-2xl text-foreground">PASSWORD UPDATED</h1>
                  <p className="text-muted-foreground text-sm mt-2">
                    Your password has been changed. Sign in with your new password to continue.
                  </p>
                </div>
                <Button
                  variant="glow"
                  size="lg"
                  className="w-full h-12"
                  onClick={() => navigate('/auth', { replace: true })}
                >
                  Go to Sign In
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            )}

            {stage === 'form' && (
              <>
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Lock className="w-8 h-8 text-primary" />
                  </div>
                  <h1 className="font-heading text-2xl text-foreground">SET NEW PASSWORD</h1>
                  <p className="text-muted-foreground text-sm mt-1">
                    Choose a new password of at least {MIN_LENGTH} characters.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="newPassword"
                        type="password"
                        autoComplete="new-password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setTouched((t) => ({ ...t, password: true }));
                          setSubmitError(null);
                        }}
                        required
                        autoFocus
                        className="h-12 pl-10 bg-secondary"
                      />
                    </div>
                    {touched.password && passwordError && (
                      <p className="text-sm text-destructive">{passwordError}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmNewPassword">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="confirmNewPassword"
                        type="password"
                        autoComplete="new-password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          setTouched((t) => ({ ...t, confirm: true }));
                          setSubmitError(null);
                        }}
                        required
                        className="h-12 pl-10 bg-secondary"
                      />
                    </div>
                    {touched.confirm && confirmError && (
                      <p className="text-sm text-destructive">{confirmError}</p>
                    )}
                  </div>

                  {submitError && <p className="text-sm text-destructive">{submitError}</p>}

                  <Button
                    type="submit"
                    variant="glow"
                    size="lg"
                    className="w-full h-12"
                    disabled={!canSubmit}
                  >
                    {submitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        Update Password
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </form>
              </>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
}