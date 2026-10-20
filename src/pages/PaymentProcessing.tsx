import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { UtensilsCrossed } from "lucide-react";
import { LoadingRecovery } from "@/components/LoadingRecovery";
import { supabase } from "@/integrations/supabase/client";
import { getPaymentOutcome } from "@/lib/paymentState";
import { reportCheckoutFailure } from "@/lib/checkoutAlerts";

const MAX_ATTEMPTS = 20;
const POLL_INTERVAL = 3000;

const PaymentProcessing = () => {
  const { orderCode } = useParams<{ orderCode: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [attempts, setAttempts] = useState(0);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const checkPaymentStatus = async () => {
      if (!mountedRef.current) return;

      try {
        const { data, error } = await supabase.functions.invoke("payment-session", {
          body: { action: "status", order_code: orderCode },
        });

        if (error || !data) {
          console.error("Payment status check failed:", error);
          return;
        }
        
        if (!mountedRef.current) return;

        const paymentOutcome = getPaymentOutcome(data.status);

        if (paymentOutcome === "settled") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          navigate("/success", { replace: true });
          return;
        }

        if (paymentOutcome === "failed") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          navigate("/error?reason=declined", { replace: true });
          return;
        }

        // status === "pending" - continue polling
        setAttempts((prev) => {
          const next = prev + 1;
          if (next >= MAX_ATTEMPTS) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            void reportCheckoutFailure(supabase, "payment_return", `Payment still unconfirmed after polling (${orderCode})`);
            navigate("/error?reason=timeout", { replace: true });
          }
          return next;
        });
      } catch (error) {
        console.error("Error checking payment status:", error);
      }
    };

    // Start polling immediately
    checkPaymentStatus();
    pollingRef.current = setInterval(checkPaymentStatus, POLL_INTERVAL);

    return () => {
      mountedRef.current = false;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [orderCode, navigate]);

  const handleRetry = () => {
    // Navigate back to cart with checkout modal open
    navigate("/cart?checkout=true");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 gradient-bg">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center text-center max-w-sm"
      >
        {/* Pulsing food icon */}
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.7, 1, 0.7],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mb-8"
        >
          <motion.div
            animate={{
              rotate: [0, 10, -10, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <UtensilsCrossed className="w-12 h-12 text-primary" />
          </motion.div>
        </motion.div>

        {/* Loading spinner ring */}
        <div className="relative mb-8">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "linear",
            }}
            className="w-16 h-16 rounded-full border-4 border-muted border-t-primary"
          />
        </div>

        <h1 className="text-2xl font-heading text-foreground mb-3">
          Verifying Your Payment
        </h1>
        
        <p className="text-muted-foreground text-sm mb-6">
          Please don't refresh this page...
        </p>

        {/* Progress indicator */}
        <div className="w-full max-w-xs">
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: "0%" }}
              animate={{ width: `${(attempts / MAX_ATTEMPTS) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Checking payment status...
          </p>
        </div>

        {/* Recovery button after 10 seconds */}
        <LoadingRecovery 
          showAfter={10000}
          onRetry={handleRetry}
          message="Taking too long?"
        />
      </motion.div>
    </div>
  );
};

export default PaymentProcessing;
