import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

type AppRole = 'admin' | 'customer';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  allowedRoles?: AppRole[];
}

export function AuthGuard({ children, requireAuth = true, allowedRoles }: AuthGuardProps) {
  const { user, role, loading, profileLoading } = useAuth();
  const location = useLocation();
  const [authTimeout, setAuthTimeout] = useState(false);
  const [showEmergencyReset, setShowEmergencyReset] = useState(false);

  // Auth timeout - force through after 3 seconds to prevent infinite loading
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading || profileLoading) {
        console.warn('[AuthGuard] Auth timeout - forcing through');
        setAuthTimeout(true);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [loading, profileLoading]);

  // Show emergency reset button after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading || profileLoading) {
        setShowEmergencyReset(true);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [loading, profileLoading]);

  // Emergency reset function - nuclear option
  const handleEmergencyReset = () => {
    console.warn('[AuthGuard] Emergency reset triggered');
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/';
  };

  // Show loading spinner ONLY if still loading AND timeout hasn't occurred
  if ((loading || profileLoading) && !authTimeout) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        {showEmergencyReset && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleEmergencyReset}
            className="text-destructive border-destructive/50 hover:bg-destructive/10"
          >
            Emergency Reset
          </Button>
        )}
      </div>
    );
  }

  // Redirect to auth if not authenticated
  if (requireAuth && !user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Check role restrictions
  if (allowedRoles && user) {
    const userRole = role || 'customer';
    if (!allowedRoles.includes(userRole)) {
      // Redirect non-admin users to menu
      return <Navigate to="/menu" replace />;
    }
  }

  return <>{children}</>;
}
