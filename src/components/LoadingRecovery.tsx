import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { hardResetApp } from '@/lib/resetApp';

interface LoadingRecoveryProps {
  showAfter?: number;
  onRetry?: () => void;
  message?: string;
}

/**
 * Reusable recovery button that appears after a timeout
 * Shows "Taking too long?" with a retry button
 */
export function LoadingRecovery({ 
  showAfter = 10000, 
  onRetry,
  message = "Taking too long?" 
}: LoadingRecoveryProps) {
  const [show, setShow] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setShow(true), showAfter);
    return () => clearTimeout(timer);
  }, [showAfter]);
  
  if (!show) return null;
  
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      hardResetApp();
    }
  };
  
  return (
    <div className="mt-6 text-center animate-fade-in">
      <p className="text-muted-foreground text-sm mb-3">
        {message}
      </p>
      <Button variant="outline" onClick={handleRetry} size="sm">
        <RefreshCw className="w-4 h-4 mr-2" />
        Tap here to retry
      </Button>
    </div>
  );
}
