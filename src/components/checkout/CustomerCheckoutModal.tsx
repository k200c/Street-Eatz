import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CreditCard, ShoppingBag, Loader2, ArrowRight, User, Phone, Mail, Clock, ChefHat, Shield, MessageSquare, RefreshCw } from 'lucide-react';
import { useCheckout } from '@/hooks/useCheckout';
import { useAuth } from '@/hooks/useAuth';
import { useAppSettings } from '@/hooks/useAppSettings';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { hardResetApp } from '@/lib/resetApp';
import { postFormToUrl } from '@/lib/postFormToUrl';
import { Link } from 'react-router-dom';
import { SchedulePicker } from '@/components/checkout/SchedulePicker';
import { ensureCheckoutSession, GUEST_CHECKOUT_UNAVAILABLE } from '@/lib/guestCheckout';

interface CustomerCheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (orderNumber: number) => void;
}

type Step = 'details' | 'payment' | 'connecting' | 'sending' | 'pending';

export function CustomerCheckoutModal({ open, onOpenChange, onSuccess }: CustomerCheckoutModalProps) {
  const { user, profile } = useAuth();
  const { submitOrder, sendToKitchen, clearCart, isSubmitting, isSendingToKitchen, total, items } = useCheckout();
  const { data: appSettings } = useAppSettings();
  const onlinePaymentsEnabled = appSettings?.online_payments_enabled ?? true;
  const payOnCollectionEnabled = appSettings?.pay_on_collection_enabled ?? true;
  const noPaymentMethods = !onlinePaymentsEnabled && !payOnCollectionEnabled;
  
  const [step, setStep] = useState<Step>('details');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [specialNotes, setSpecialNotes] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState<'asap' | 'scheduled'>('asap');
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [showRetryButton, setShowRetryButton] = useState(false);
  const [mountTime] = useState(() => Date.now());

  // Auto-fill from profile if logged in
  useEffect(() => {
    if (open) {
      if (profile?.full_name) setCustomerName(profile.full_name);
      if (profile?.phone) setCustomerPhone(profile.phone);
      if (user?.email) setCustomerEmail(user.email);
    }
  }, [open, profile, user]);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep('details');
        setOrderNumber(null);
        setIsProcessingPayment(false);
        setSpecialNotes('');
        setFulfillmentType('asap');
        setScheduledFor(null);
        setShowRetryButton(false);
      }, 300);
    }
  }, [open]);

  // Recovery effect: detect stuck loading state after redirect return (5 second timeout)
  useEffect(() => {
    if (step === 'connecting' || (step === 'payment' && isProcessingPayment)) {
      const stuckTimeout = setTimeout(() => {
        const elapsedTime = Date.now() - mountTime;
        if (elapsedTime > 5000) {
          console.log('Payment flow appears stuck, resetting state...');
          setStep('payment');
          setIsProcessingPayment(false);
        }
      }, 5000);
      
      return () => clearTimeout(stuckTimeout);
    }
  }, [step, mountTime, isProcessingPayment]);

  // Show retry button after 10 seconds of loading
  useEffect(() => {
    if (isProcessingPayment || step === 'connecting' || step === 'sending') {
      const retryTimeout = setTimeout(() => {
        setShowRetryButton(true);
      }, 10000);
      
      return () => clearTimeout(retryTimeout);
    } else {
      setShowRetryButton(false);
    }
  }, [isProcessingPayment, step]);

  const canProceed = Boolean(
    customerName.trim() &&
    customerPhone.trim() &&
    (fulfillmentType === 'asap' || scheduledFor)
  );
  const isButtonDisabled = isSubmitting || isProcessingPayment;
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Validate email format
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handlePayCard = async () => {
    // Prevent duplicate submissions
    if (isProcessingPayment) return;
    
    // Clear previous errors
    setPaymentError(null);

    // Validation before attempting payment
    const trimmedName = customerName.trim();
    const trimmedPhone = customerPhone.trim();
    const trimmedEmail = customerEmail.trim();

    if (!trimmedName) {
      setPaymentError('Please enter your name');
      return;
    }
    if (!trimmedPhone) {
      setPaymentError('Please enter your phone number');
      return;
    }
    if (!trimmedEmail) {
      setPaymentError('Email is required for card payments');
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setPaymentError('Please enter a valid email address');
      return;
    }
    if (total <= 0) {
      setPaymentError('Invalid order total');
      return;
    }

    // Guests order without an account: a signed-in customer keeps their
    // session, anyone else gets a guest session here. See src/lib/guestCheckout.ts.
    const checkoutSession = await ensureCheckoutSession(supabase.auth);
    if (!checkoutSession.ok) {
      setPaymentError(checkoutSession.message ?? GUEST_CHECKOUT_UNAVAILABLE);
      toast.error(checkoutSession.message ?? GUEST_CHECKOUT_UNAVAILABLE);
      return;
    }

    setIsProcessingPayment(true);

    try {
      // Step 1: Show connecting/redirecting spinner
      setStep('connecting');

      // Step 2: Create the order first
      const orderResult = await submitOrder({
        paymentMethod: 'card',
        customerName: trimmedName,
        customerPhone: trimmedPhone,
        customerEmail: trimmedEmail,
        specialNotes: specialNotes.trim() || undefined,
        fulfillmentType,
        scheduledFor,
      });

      if (!orderResult) {
        throw new Error('Failed to create order');
      }

      // Step 2.5: Wait 500ms to ensure order is fully committed to Supabase
      console.log('⏳ Waiting for order to commit...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify order exists in database before proceeding
      const { data: orderCheck } = await supabase
        .from('orders')
        .select('id')
        .eq('id', orderResult.orderId)
        .maybeSingle();

      if (!orderCheck) {
        console.warn('Order not immediately visible, waiting additional 500ms...');
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Step 5: create the provider session through the authenticated server boundary.
      const { data, error: paymentFnError } = await supabase.functions.invoke('payment-session', {
        body: {
          action: 'start',
          order_id: orderResult.orderId,
          payment_type: 'online',
          customer_email: trimmedEmail,
        },
      });

      if (paymentFnError || !data) {
        const errorMessage = paymentFnError?.message || 'Payment service unavailable';
        console.error('Payment session error:', paymentFnError);
        setPaymentError("Payment service is temporarily unavailable. Please try again in a moment.");
        toast.error("Payment Error: " + errorMessage);
        setStep('payment');
        setIsProcessingPayment(false);
        return;
      }

      // Validate response has success flag
      if (!data.success) {
        throw new Error(data.error || 'Payment initialization failed');
      }

      // myPOS hosted-checkout (form-post) branch — additive, runs BEFORE the
      // existing Viva paymentUrl redirect. If backend returns a form-post
      // response shape, we POST hidden fields to the provider's action_url.
      if (
        data?.paymentMode === 'form-post' &&
        typeof data?.action_url === 'string' &&
        data?.fields &&
        typeof data.fields === 'object'
      ) {
        if (data.orderCode) {
          console.log('✅ myPOS order code:', data.orderCode);
        }
        console.log('✅ Submitting myPOS hosted-checkout form to:', data.action_url);
        postFormToUrl(data.action_url, data.fields);
        return;
      }

      const paymentUrl = data.paymentUrl || data.url;

      if (!paymentUrl) {
        console.error('Response missing paymentUrl:', data);
        throw new Error('No payment URL received');
      }

      // Log viva_order_code if returned (for debugging)
      if (data.viva_order_code) {
        console.log('✅ Viva order code stored:', data.viva_order_code);
      }

      // Step 6: Redirect to Viva Wallet payment page
      console.log('✅ Redirecting to Viva Wallet:', paymentUrl);
      window.location.href = paymentUrl;

    } catch (error) {
      console.error('Payment initiation error:', error);
      const errorMessage = error instanceof Error 
        ? (error.name === 'AbortError' ? 'Payment request timed out' : error.message)
        : 'Payment failed';
      setPaymentError(errorMessage);
      toast.error('Payment Error: ' + errorMessage);
      setStep('payment');
      setIsProcessingPayment(false);
    }
  };

  const handlePayOnCollection = async () => {
    // Prevent duplicate submissions
    if (isProcessingPayment) return;

    // Guard: Pay on Collection must be enabled (blocks manipulated / stale-state submissions).
    // The DB trigger is the hard backstop; this prevents a wasted round-trip and shows a clear message.
    if (!payOnCollectionEnabled) {
      toast.error('Pay on Collection is currently unavailable. Please use card payment.');
      return;
    }

    const checkoutSession = await ensureCheckoutSession(supabase.auth);
    if (!checkoutSession.ok) {
      toast.error(checkoutSession.message ?? GUEST_CHECKOUT_UNAVAILABLE);
      return;
    }

    setIsProcessingPayment(true);

    try {
      // Show "Sending to Kitchen" spinner
      setStep('sending');

      const result = await submitOrder({
        paymentMethod: 'cash',
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim(),
        specialNotes: specialNotes.trim() || undefined,
        fulfillmentType,
        scheduledFor,
      });

      if (result) {
        // Release the saved order through the database-canonical kitchen dispatcher.
        const kitchenSuccess = fulfillmentType === 'scheduled' ? true : await sendToKitchen(
          result
        );

        // Only clear cart AFTER kitchen confirmation
        if (kitchenSuccess) {
          clearCart();
        }

        setOrderNumber(result.orderNumber);
        setStep('pending');
      } else {
        throw new Error('Order submission failed');
      }
    } catch (error) {
      console.error('Collection payment error:', error);
      toast.error('Payment Error: Please try again or use cash.');
      setStep('payment');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleClose = () => {
    if (step === 'pending' && orderNumber) {
      onSuccess(orderNumber);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-full h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-md bg-card border-border overflow-y-auto safe-area-pb">
        <AnimatePresence mode="wait">
          {/* Step 1: Customer Details */}
          {step === 'details' && (
            <motion.div
              key="details"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <DialogHeader>
                <DialogTitle className="font-heading text-2xl text-center">YOUR DETAILS</DialogTitle>
                <DialogDescription className="sr-only">Enter your contact details for order pickup</DialogDescription>
              </DialogHeader>

              <div className="mt-6 space-y-4">
                {/* Order Total */}
                <div className="text-center p-4 bg-secondary rounded-lg">
                  <p className="text-muted-foreground text-sm uppercase tracking-wider">Order Total</p>
                  <p className="font-heading text-3xl text-primary mt-1">€{total.toFixed(2)}</p>
                </div>

                {/* Name */}
                <div className="space-y-2">
                  <Label htmlFor="name" className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Your name"
                    className="h-12 bg-secondary"
                  />
                </div>

                {/* Phone */}
                <div className="space-y-2">
                  <Label htmlFor="phone" className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Phone <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="+353 85 123 4567"
                    className="h-12 bg-secondary"
                  />
                </div>

                {/* Email (Optional) */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-12 bg-secondary"
                  />
                </div>

                {/* Special Request / Notes */}
                <SchedulePicker
                  mode={fulfillmentType}
                  value={scheduledFor}
                  onModeChange={setFulfillmentType}
                  onChange={setScheduledFor}
                />

                <div className="space-y-2">
                  <Label htmlFor="specialNotes" className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Special Request <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                  <Textarea
                    id="specialNotes"
                    value={specialNotes}
                    onChange={(e) => setSpecialNotes(e.target.value)}
                    placeholder="e.g., Allergies, extra napkins, specific timing..."
                    className="bg-secondary min-h-[80px] resize-none"
                    maxLength={500}
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {specialNotes.length}/500
                  </p>
                </div>

                <Button
                  variant="glow"
                  size="lg"
                  className="w-full h-14 mt-4"
                  disabled={!canProceed}
                  onClick={() => setStep('payment')}
                >
                  Continue to Payment
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 2: Payment Selection */}
          {step === 'payment' && (
            <motion.div
              key="payment"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <DialogHeader>
                <DialogTitle className="font-heading text-2xl text-center">PAYMENT</DialogTitle>
                <DialogDescription className="sr-only">Choose your payment method</DialogDescription>
              </DialogHeader>

              <div className="mt-6 space-y-4">
                {/* Payment Error Display */}
                {paymentError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <p className="text-destructive text-sm">{paymentError}</p>
                  </div>
                )}

                {/* Order Summary */}
                <div className="p-4 bg-secondary rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Name</span>
                    <span>{customerName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Phone</span>
                    <span>{customerPhone}</span>
                  </div>
                  {customerEmail && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Email</span>
                      <span className="truncate max-w-[180px]">{customerEmail}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Collection</span>
                    <span>
                      {scheduledFor
                        ? new Intl.DateTimeFormat('en-IE', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(scheduledFor))
                        : 'As soon as possible'}
                    </span>
                  </div>
                  <div className="border-t border-border pt-2 mt-2 flex justify-between">
                    <span className="font-heading">Total</span>
                    <span className="font-heading text-xl text-primary">€{total.toFixed(2)}</span>
                  </div>
                </div>

                {/* No payment methods available */}
                {noPaymentMethods && (
                  <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <p className="text-destructive text-sm text-center leading-relaxed">
                      Ordering is temporarily unavailable because no payment methods are currently enabled. Please try again shortly.
                    </p>
                  </div>
                )}

                {onlinePaymentsEnabled && (
                  <>
                    {/* Email required notice for card payments */}
                    {!customerEmail.trim() && (
                      <p className="text-xs text-muted-foreground text-center">
                        💳 Email is required for card payments
                      </p>
                    )}

                    {/* Pay Card - Viva Wallet */}
                    <Button
                      variant="glow"
                      size="lg"
                      className="w-full h-16"
                      onClick={handlePayCard}
                      disabled={isButtonDisabled}
                    >
                      {isButtonDisabled ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <>
                          <CreditCard className="w-6 h-6 mr-3" />
                          PAY CARD
                        </>
                      )}
                    </Button>
                  </>
                )}

                {/* Pay on Collection */}
                {payOnCollectionEnabled && (
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full h-16"
                    onClick={handlePayOnCollection}
                    disabled={isButtonDisabled}
                  >
                    {isButtonDisabled ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <>
                        <ShoppingBag className="w-6 h-6 mr-3" />
                        PAY ON COLLECTION
                      </>
                    )}
                  </Button>
                )}

                {/* Compliance disclaimer */}
                <p className="text-xs text-muted-foreground text-center px-2 leading-relaxed">
                  By placing an order, you agree to our{" "}
                  <Link
                    to="/terms-and-conditions"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Terms &amp; Conditions
                  </Link>
                  ,{" "}
                  <Link
                    to="/refund-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Refund Policy
                  </Link>
                  , and{" "}
                  <Link
                    to="/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Privacy Policy
                  </Link>
                  .
                </p>

                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setStep('details')}
                  disabled={isButtonDisabled}
                >
                  Back
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 2.5a: Connecting to Secure Payment */}
          {step === 'connecting' && (
            <motion.div
              key="connecting"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="py-12"
            >
              <div className="text-center space-y-6">
                <div className="relative">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto"
                  >
                    <Shield className="w-10 h-10 text-primary" />
                  </motion.div>
                  <Loader2 className="w-6 h-6 text-primary/60 absolute -bottom-1 right-1/2 translate-x-10 animate-spin" />
                </div>

                <div>
                  <p className="font-heading text-2xl text-foreground">PREPARING SECURE PAYMENT...</p>
                  <p className="text-muted-foreground text-sm mt-2">
                    Connecting to payment gateway
                  </p>
                </div>

                {/* Retry button appears after 10 seconds */}
                {showRetryButton && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-muted-foreground text-sm mb-3">
                      Taking too long?
                    </p>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        await hardResetApp();
                      }}
                      className="text-primary border-primary hover:bg-primary/10"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Tap here to retry
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Step 2.5b: Sending to Kitchen (only for cash/collection) */}
          {step === 'sending' && (
            <motion.div
              key="sending"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="py-12"
            >
              <div className="text-center space-y-6">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto"
                >
                  <ChefHat className="w-10 h-10 text-primary" />
                </motion.div>

                <div>
                  <p className="font-heading text-2xl text-foreground">SENDING TO KITCHEN...</p>
                  <p className="text-muted-foreground text-sm mt-2">
                    Your order is being prepared
                  </p>
                </div>

                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />

                {/* Retry button appears after 10 seconds */}
                {showRetryButton && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-muted-foreground text-sm mb-3">
                      Taking too long?
                    </p>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        await hardResetApp();
                      }}
                      className="text-primary border-primary hover:bg-primary/10"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Tap here to retry
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Step 3: Order Pending - Pay on Collection */}
          {step === 'pending' && (
            <motion.div
              key="pending"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-6"
            >
              <div className="text-center space-y-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.1 }}
                  className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto"
                >
                  <Clock className="w-10 h-10 text-primary" />
                </motion.div>

                <div>
                  <p className="text-muted-foreground text-sm uppercase tracking-wider">Order Number</p>
                  <p className="font-heading text-5xl text-primary mt-2">#{orderNumber}</p>
                </div>

                <div className="p-4 bg-secondary rounded-lg space-y-2">
                  <p className="text-lg font-heading text-foreground">ORDER RECEIVED</p>
                  <p className="text-muted-foreground text-sm">
                    Estimated pickup: <span className="text-foreground font-medium">10-15 minutes</span>
                  </p>
                  <div className="pt-2 border-t border-border mt-2">
                    <p className="text-sm font-medium text-orange-500 flex items-center justify-center gap-2">
                      <ShoppingBag className="w-4 h-4" />
                      Pay on Collection - €{total.toFixed(2)}
                    </p>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  We'll send you a notification when your order is ready!
                </p>

                <Button
                  variant="glow"
                  size="lg"
                  className="w-full h-14 mt-4"
                  onClick={handleClose}
                >
                  Done
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
