import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { User, Mail, Phone, ArrowRight, ArrowLeft, Loader2, CheckCircle, Lock, Zap } from 'lucide-react';
import { z } from 'zod';
import streetEatzLogo from '@/assets/street-eatz-logo.png';

// Validation schemas
const emailSchema = z.string().trim().email('Please enter a valid email').max(255, 'Email too long');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters').max(100, 'Password too long');
const otpSchema = z.string().length(6, 'Please enter the 6-digit code');
const phoneSchema = z.string().trim().min(10, 'Please enter a valid phone number').max(20, 'Phone too long');
const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Name is required').max(100, 'Name too long'),
  phone: z.string().trim().min(10, 'Please enter a valid phone number').max(20, 'Phone too long'),
});

type AuthStep = 'credentials' | 'otp' | 'profile' | 'success';
type OtpType = 'email' | 'phone';

// Detect if input is a phone number
const isPhoneNumber = (value: string): boolean => {
  const cleaned = value.replace(/[\s\-\(\)]/g, '');
  // Matches: +353..., 08..., 353..., or just digits starting with common patterns
  return /^(\+)?[0-9]{10,15}$/.test(cleaned) || /^0[0-9]{9,10}$/.test(cleaned);
};

// Normalize phone number to E.164 format
const normalizePhone = (phone: string): string => {
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');
  // Irish number starting with 0, convert to +353
  if (cleaned.startsWith('0')) {
    cleaned = '+353' + cleaned.substring(1);
  }
  // Add + if missing for international numbers
  if (!cleaned.startsWith('+') && cleaned.length > 10) {
    cleaned = '+' + cleaned;
  }
  return cleaned;
};

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    user, role, loading, profileLoading, profile, 
    signIn, signUp, signInWithOtp, signInWithPhoneOtp, verifyOtp, verifyPhoneOtp, updateProfile 
  } = useAuth();
  
  const [step, setStep] = useState<AuthStep>('credentials');
  const [activeTab, setActiveTab] = useState<'signin' | 'quick'>('signin');
  
  // Sign In / Sign Up state
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Quick Access (OTP) state
  const [identifier, setIdentifier] = useState('');
  const [otpType, setOtpType] = useState<OtpType>('email');
  
  // OTP verification state
  const [otp, setOtp] = useState('');
  
  // Profile completion state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  
  const [submitting, setSubmitting] = useState(false);

  // Get the intended destination from location state
  const from = (location.state as { from?: Location })?.from?.pathname || '/menu';

  // Redirect based on role once authenticated and profile is loaded
  useEffect(() => {
    if (loading || profileLoading) return;
    
    if (user) {
      // Check if profile needs completion (new OTP user)
      if (!profile?.full_name || !profile?.phone) {
        setStep('profile');
        return;
      }
      
      // Redirect based on role
      if (role === 'admin') {
        navigate('/admin/pos', { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    }
  }, [user, role, loading, profileLoading, profile, navigate, from]);

  // Handle Email/Password Sign In
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const emailValidation = emailSchema.safeParse(email);
      if (!emailValidation.success) {
        toast.error(emailValidation.error.errors[0].message);
        setSubmitting(false);
        return;
      }

      const passwordValidation = passwordSchema.safeParse(password);
      if (!passwordValidation.success) {
        toast.error(passwordValidation.error.errors[0].message);
        setSubmitting(false);
        return;
      }

      const { error } = await signIn(email.trim(), password);
      if (error) throw error;

      toast.success('Signed in successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to sign in');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Email/Password Sign Up
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const emailValidation = emailSchema.safeParse(email);
      if (!emailValidation.success) {
        toast.error(emailValidation.error.errors[0].message);
        setSubmitting(false);
        return;
      }

      const passwordValidation = passwordSchema.safeParse(password);
      if (!passwordValidation.success) {
        toast.error(passwordValidation.error.errors[0].message);
        setSubmitting(false);
        return;
      }

      if (password !== confirmPassword) {
        toast.error('Passwords do not match');
        setSubmitting(false);
        return;
      }

      const { error } = await signUp(email.trim(), password, fullName.trim() || undefined, phone.trim() || undefined);
      if (error) throw error;

      toast.success('Account created! Check your email to confirm.');
      setIsSignUp(false);
      setPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      if (error.message?.includes('already registered')) {
        toast.error('An account with this email already exists. Please sign in.');
      } else {
        toast.error(error.message || 'Failed to create account');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Quick Access OTP Send
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const trimmedIdentifier = identifier.trim();
      
      if (isPhoneNumber(trimmedIdentifier)) {
        // Phone OTP
        const normalizedPhone = normalizePhone(trimmedIdentifier);
        const phoneValidation = phoneSchema.safeParse(normalizedPhone);
        if (!phoneValidation.success) {
          toast.error(phoneValidation.error.errors[0].message);
          setSubmitting(false);
          return;
        }

        const { error } = await signInWithPhoneOtp(normalizedPhone);
        if (error) throw error;

        setOtpType('phone');
        toast.success('Check your phone for the sign-in code!');
      } else {
        // Email OTP
        const emailValidation = emailSchema.safeParse(trimmedIdentifier);
        if (!emailValidation.success) {
          toast.error(emailValidation.error.errors[0].message);
          setSubmitting(false);
          return;
        }

        const { error } = await signInWithOtp(trimmedIdentifier);
        if (error) throw error;

        setOtpType('email');
        toast.success('Check your email for the sign-in code!');
      }

      setStep('otp');
    } catch (error: any) {
      toast.error(error.message || 'Failed to send code');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle OTP Verification
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const validation = otpSchema.safeParse(otp);
      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        setSubmitting(false);
        return;
      }

      const trimmedIdentifier = identifier.trim();
      
      if (otpType === 'phone') {
        const normalizedPhone = normalizePhone(trimmedIdentifier);
        const { error } = await verifyPhoneOtp(normalizedPhone, otp);
        if (error) throw error;
      } else {
        const { error } = await verifyOtp(trimmedIdentifier, otp);
        if (error) throw error;
      }

      toast.success('Signed in successfully!');
      // Profile check will happen in useEffect
    } catch (error: any) {
      if (error.message?.includes('Token has expired')) {
        toast.error('Code expired. Please request a new one.');
        setStep('credentials');
        setOtp('');
      } else {
        toast.error(error.message || 'Invalid code');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Profile Completion
  const handleCompleteProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const validation = profileSchema.safeParse({ fullName, phone });
      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        setSubmitting(false);
        return;
      }

      const { error } = await updateProfile({
        full_name: fullName.trim(),
        phone: phone.trim(),
      });

      if (error) throw error;

      setStep('success');
      toast.success('Profile complete!');
      
      // Redirect after brief success animation
      setTimeout(() => {
        if (role === 'admin') {
          navigate('/admin/pos', { replace: true });
        } else {
          navigate(from, { replace: true });
        }
      }, 1500);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Resend OTP
  const handleResendOtp = async () => {
    setSubmitting(true);
    try {
      const trimmedIdentifier = identifier.trim();
      
      if (otpType === 'phone') {
        const normalizedPhone = normalizePhone(trimmedIdentifier);
        const { error } = await signInWithPhoneOtp(normalizedPhone);
        if (error) throw error;
      } else {
        const { error } = await signInWithOtp(trimmedIdentifier);
        if (error) throw error;
      }
      
      toast.success('New code sent!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to resend code');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="p-4 flex justify-center">
        <img 
          src={streetEatzLogo} 
          alt="Street Eatz" 
          className="h-12 w-auto"
        />
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="glass-card p-6 space-y-6">
            <AnimatePresence mode="wait">
              {/* Step 1: Credentials (Tabbed) */}
              {step === 'credentials' && (
                <motion.div
                  key="credentials"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'signin' | 'quick')} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-6">
                      <TabsTrigger value="signin" className="flex items-center gap-2">
                        <Lock className="w-4 h-4" />
                        Sign In
                      </TabsTrigger>
                      <TabsTrigger value="quick" className="flex items-center gap-2">
                        <Zap className="w-4 h-4" />
                        Quick Access
                      </TabsTrigger>
                    </TabsList>

                    {/* Email/Password Tab */}
                    <TabsContent value="signin" className="mt-0">
                      <div className="text-center mb-6">
                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                          <Lock className="w-8 h-8 text-primary" />
                        </div>
                        <h1 className="font-heading text-2xl text-foreground">
                          {isSignUp ? 'CREATE ACCOUNT' : 'WELCOME BACK'}
                        </h1>
                        <p className="text-muted-foreground text-sm mt-1">
                          {isSignUp ? 'Join Street Eatz for faster checkout' : 'Sign in with your email and password'}
                        </p>
                      </div>

                      <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="space-y-4">
                        {isSignUp && (
                          <>
                            <div className="space-y-2">
                              <Label htmlFor="signupName">Full Name</Label>
                              <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                  id="signupName"
                                  placeholder="John Doe"
                                  value={fullName}
                                  onChange={(e) => setFullName(e.target.value)}
                                  className="h-12 pl-10 bg-secondary"
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="signupPhone">Phone Number</Label>
                              <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                  id="signupPhone"
                                  type="tel"
                                  placeholder="+353 85 123 4567"
                                  value={phone}
                                  onChange={(e) => setPhone(e.target.value)}
                                  className="h-12 pl-10 bg-secondary"
                                />
                              </div>
                            </div>
                          </>
                        )}

                        <div className="space-y-2">
                          <Label htmlFor="email">Email</Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="email"
                              type="email"
                              placeholder="you@example.com"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              required
                              autoFocus={!isSignUp}
                              className="h-12 pl-10 bg-secondary"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="password">Password</Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="password"
                              type="password"
                              placeholder="••••••••"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              required
                              className="h-12 pl-10 bg-secondary"
                            />
                          </div>
                        </div>

                        {isSignUp && (
                          <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirm Password</Label>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input
                                id="confirmPassword"
                                type="password"
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                className="h-12 pl-10 bg-secondary"
                              />
                            </div>
                          </div>
                        )}

                        <Button
                          type="submit"
                          variant="glow"
                          size="lg"
                          className="w-full h-12"
                          disabled={submitting || !email.trim() || !password}
                        >
                          {submitting ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <>
                              {isSignUp ? 'Create Account' : 'Sign In'}
                              <ArrowRight className="w-4 h-4 ml-2" />
                            </>
                          )}
                        </Button>

                        <div className="text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setIsSignUp(!isSignUp);
                              setPassword('');
                              setConfirmPassword('');
                            }}
                            className="text-primary text-sm hover:underline"
                          >
                            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                          </button>
                        </div>
                      </form>
                    </TabsContent>

                    {/* Quick Access (OTP) Tab */}
                    <TabsContent value="quick" className="mt-0">
                      <div className="text-center mb-6">
                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                          <Zap className="w-8 h-8 text-primary" />
                        </div>
                        <h1 className="font-heading text-2xl text-foreground">QUICK ACCESS</h1>
                        <p className="text-muted-foreground text-sm mt-1">
                          Enter your email or phone for a one-time code
                        </p>
                      </div>

                      <form onSubmit={handleSendOtp} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="identifier">Email or Phone</Label>
                          <div className="relative">
                            {isPhoneNumber(identifier) ? (
                              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            ) : (
                              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            )}
                            <Input
                              id="identifier"
                              placeholder="you@example.com or +353 85 123 4567"
                              value={identifier}
                              onChange={(e) => setIdentifier(e.target.value)}
                              required
                              className="h-12 pl-10 bg-secondary"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {isPhoneNumber(identifier) 
                              ? "📱 We'll text you a 6-digit code" 
                              : "📧 We'll email you a 6-digit code"}
                          </p>
                        </div>

                        <Button
                          type="submit"
                          variant="glow"
                          size="lg"
                          className="w-full h-12"
                          disabled={submitting || !identifier.trim()}
                        >
                          {submitting ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <>
                              Send Code
                              <ArrowRight className="w-4 h-4 ml-2" />
                            </>
                          )}
                        </Button>
                      </form>
                    </TabsContent>
                  </Tabs>
                </motion.div>
              )}

              {/* Step 2: OTP Verification */}
              {step === 'otp' && (
                <motion.div
                  key="otp"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      {otpType === 'phone' ? (
                        <Phone className="w-8 h-8 text-primary" />
                      ) : (
                        <Mail className="w-8 h-8 text-primary" />
                      )}
                    </div>
                    <h1 className="font-heading text-2xl text-foreground">
                      {otpType === 'phone' ? 'CHECK YOUR PHONE' : 'CHECK YOUR EMAIL'}
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                      We sent a code to <span className="text-foreground">{identifier}</span>
                    </p>
                  </div>

                  <form onSubmit={handleVerifyOtp} className="space-y-6">
                    <div className="flex justify-center">
                      <InputOTP
                        value={otp}
                        onChange={setOtp}
                        maxLength={6}
                        className="gap-2"
                      >
                        <InputOTPGroup>
                          <InputOTPSlot index={0} className="w-12 h-14 text-xl" />
                          <InputOTPSlot index={1} className="w-12 h-14 text-xl" />
                          <InputOTPSlot index={2} className="w-12 h-14 text-xl" />
                          <InputOTPSlot index={3} className="w-12 h-14 text-xl" />
                          <InputOTPSlot index={4} className="w-12 h-14 text-xl" />
                          <InputOTPSlot index={5} className="w-12 h-14 text-xl" />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>

                    <Button
                      type="submit"
                      variant="glow"
                      size="lg"
                      className="w-full h-12"
                      disabled={submitting || otp.length !== 6}
                    >
                      {submitting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          Verify Code
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </>
                      )}
                    </Button>

                    <div className="flex items-center justify-between text-sm">
                      <button
                        type="button"
                        onClick={() => {
                          setStep('credentials');
                          setOtp('');
                        }}
                        className="text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        Go back
                      </button>
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={submitting}
                        className="text-primary hover:underline"
                      >
                        Resend code
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}

              {/* Step 3: Profile Completion */}
              {step === 'profile' && (
                <motion.div
                  key="profile"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <User className="w-8 h-8 text-primary" />
                    </div>
                    <h1 className="font-heading text-2xl text-foreground">COMPLETE YOUR PROFILE</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                      We'll use this to notify you about your orders
                    </p>
                  </div>

                  <form onSubmit={handleCompleteProfile} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="profileFullName">Full Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="profileFullName"
                          placeholder="John Doe"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          required
                          autoFocus
                          className="h-12 pl-10 bg-secondary"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="profilePhone">Phone Number</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="profilePhone"
                          type="tel"
                          placeholder="+353 85 123 4567"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          required
                          className="h-12 pl-10 bg-secondary"
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      variant="glow"
                      size="lg"
                      className="w-full h-12"
                      disabled={submitting || !fullName.trim() || !phone.trim()}
                    >
                      {submitting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          Complete Profile
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </form>
                </motion.div>
              )}

              {/* Step 4: Success */}
              {step === 'success' && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-8"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.1 }}
                    className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4"
                  >
                    <CheckCircle className="w-10 h-10 text-green-500" />
                  </motion.div>
                  <h1 className="font-heading text-2xl text-foreground">YOU'RE ALL SET!</h1>
                  <p className="text-muted-foreground text-sm mt-1">
                    Redirecting you now...
                  </p>
                  <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mt-4" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
