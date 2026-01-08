import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Banknote, Check, CreditCard, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface QuickPayModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  displayId: number;
  total: number;
  onSuccess: () => void;
}

export function QuickPayModal({ 
  open, 
  onOpenChange, 
  orderId, 
  displayId, 
  total, 
  onSuccess 
}: QuickPayModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleConfirmPayment = async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      // Update order to paid and set to cooking (processing)
      const { error } = await supabase
        .from('orders')
        .update({ 
          payment_status: 'paid',
          payment_method: 'cash', // Default to cash for pay-on-collection
          status: 'cooking' // Move to processing
        })
        .eq('id', orderId);

      if (error) throw error;

      toast.success(`Order #${String(displayId).padStart(4, '0')} marked as PAID!`, {
        description: 'Order moved to cooking queue'
      });
      
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Payment confirmation error:', error);
      toast.error('Failed to confirm payment. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const displayNumber = String(displayId).padStart(4, '0');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <AnimatePresence mode="wait">
          {isProcessing ? (
            <motion.div
              key="processing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="py-12"
            >
              <div className="text-center space-y-6">
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto"
                >
                  <Check className="w-10 h-10 text-green-500" />
                </motion.div>
                <div>
                  <p className="font-heading text-2xl text-foreground">Processing...</p>
                </div>
                <Loader2 className="w-8 h-8 animate-spin text-green-500 mx-auto" />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="payment-options"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <DialogHeader>
                <DialogTitle className="font-heading text-2xl text-center">
                  Process Payment
                </DialogTitle>
              </DialogHeader>

              <div className="mt-6 space-y-6">
                {/* Order Info */}
                <div className="text-center p-6 bg-secondary rounded-lg">
                  <p className="text-muted-foreground text-sm uppercase tracking-wider">
                    Order #{displayNumber}
                  </p>
                  <p className="font-heading text-4xl text-primary mt-2">
                    €{total.toFixed(2)}
                  </p>
                </div>

                {/* Payment Confirmation Buttons */}
                <div className="space-y-3">
                  <Button
                    size="lg"
                    className="w-full h-16 text-lg bg-green-500 hover:bg-green-600 text-white font-bold gap-3"
                    onClick={handleConfirmPayment}
                    disabled={isProcessing}
                  >
                    <Check className="w-6 h-6" />
                    Confirm Cash/Card Collection
                  </Button>
                  
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full h-14 text-base gap-3 border-2"
                    onClick={() => onOpenChange(false)}
                    disabled={isProcessing}
                  >
                    <X className="w-5 h-5" />
                    Cancel
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground text-center">
                  Confirming will mark the order as paid and move it to the cooking queue
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
