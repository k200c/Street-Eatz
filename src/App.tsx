import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { lazy, Suspense, useState } from "react";
import { useCartSync } from "@/hooks/useCartSync";
import { AuthProvider } from "@/contexts/AuthContext";
import { UpdateToast } from "@/components/pwa/UpdateToast";
import { InstallAppPrompt } from "@/components/pwa/InstallAppPrompt";
import { OrderSourceCapture } from "@/components/customer/OrderSourceCapture";
import { AuthGuard } from "@/components/auth/AuthGuard";
// Eager, not lazy: these routes ship prerendered HTML. A lazy chunk would swap
// real crawled content for a Suspense spinner the moment React mounts.
import MarketingPage from "./pages/MarketingPage";
const Index = lazy(() => import("./pages/Index"));
const Menu = lazy(() => import("./pages/Menu"));
const Cart = lazy(() => import("./pages/Cart"));
const Auth = lazy(() => import("./pages/Auth"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const RateOrder = lazy(() => import("./pages/RateOrder"));
const Details = lazy(() => import("./pages/Details"));
const Profile = lazy(() => import("./pages/Profile"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PaymentProcessing = lazy(() => import("./pages/PaymentProcessing"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const PaymentError = lazy(() => import("./pages/PaymentError"));
const Processing = lazy(() => import("./pages/Processing"));
const OrderSuccess = lazy(() => import("./pages/OrderSuccess"));
const OrderFailed = lazy(() => import("./pages/OrderFailed"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsAndConditions = lazy(() => import("./pages/TermsAndConditions"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));
const DeliveryPolicy = lazy(() => import("./pages/DeliveryPolicy"));
const QrOrderEntry = lazy(() => import("./pages/QrOrderEntry"));
const StaffDashboard = lazy(() => import("./pages/StaffDashboard"));
const CommandCenter = lazy(() => import("./pages/CommandCenter"));
const QrHub = lazy(() => import("./pages/QrHub"));
const FoodOSPreview = lazy(() => import("./pages/FoodOSPreview"));
const InstallApp = lazy(() => import("./pages/InstallApp"));

// Component to initialize cart sync within the app
const CartSyncProvider = ({ children }: { children: React.ReactNode }) => {
  useCartSync();
  return <>{children}</>;
};

const App = () => {
const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,                    // Data is stale immediately
        gcTime: 1000 * 60 * 5,           // Keep cached results 5min to avoid refetch storms on remount
        retry: 1,                        // Only retry once
        refetchOnWindowFocus: false,     // CRITICAL: Prevent hanging on focus
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <CartSyncProvider>
            <Toaster />
            <Sonner 
              theme="dark" 
              toastOptions={{
                style: {
                  background: 'hsl(0 0% 10%)',
                  border: '1px solid hsl(0 0% 20%)',
                  color: 'hsl(0 0% 98%)',
                },
              }}
            />
            <UpdateToast />
            <InstallAppPrompt />
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <OrderSourceCapture />
            <Suspense fallback={<div className="min-h-[100dvh] bg-background flex items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
            <Routes>
                {/* CRITICAL: Viva Wallet redirect routes MUST be first - public, no auth */}
                <Route path="/processing" element={<Processing />} />
                <Route path="/order-success" element={<OrderSuccess />} />
                <Route path="/order-failed" element={<OrderFailed />} />
                
                {/* Public routes */}
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                {/* Finding 28: /login 404'd. It is a route people type. */}
                <Route path="/login" element={<Navigate to="/auth" replace />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/menu" element={<Menu />} />

                {/* Prerendered marketing routes. scripts/prerender.mjs writes real
                    HTML for these so crawlers and AI answer engines get dish text
                    without running JS; React then takes over for a human.
                    /menu is deliberately absent — it keeps the ordering page and
                    receives its prerendered HTML as a crawlable floor only. */}
                <Route path="/burgers" element={<MarketingPage />} />
                <Route path="/flatbreads" element={<MarketingPage />} />
                <Route path="/loaded-fries" element={<MarketingPage />} />
                <Route path="/allergens" element={<MarketingPage />} />
                <Route path="/catering" element={<MarketingPage />} />
                <Route path="/qr/order" element={<QrOrderEntry />} />
                <Route path="/install" element={<InstallApp />} />

                {/* Post-order rating from an SMS link. Public, no auth, no layout —
                    the token in the path is the only credential. The bare /rate
                    route catches a truncated or token-less link and shows the
                    expired state rather than a 404. */}
                <Route path="/rate/:token" element={<RateOrder />} />
                <Route path="/rate" element={<RateOrder />} />
                
                {/* Customer routes - require auth */}
                {/* Guests must reach the basket: since April this guard sent every guest to
                    the login page before checkout. Guest checkout starts a guest
                    session at payment instead (src/lib/guestCheckout.ts). */}
                <Route path="/cart" element={<Cart />} />
                <Route path="/account" element={<AuthGuard><Navigate to="/profile" replace /></AuthGuard>} />
                <Route path="/profile" element={<AuthGuard><Profile /></AuthGuard>} />
                <Route path="/details" element={<Details />} />
                
                {/* Staff routes - require admin role */}
                <Route path="/admin" element={<AuthGuard allowedRoles={['admin']}><StaffDashboard /></AuthGuard>} />
                <Route path="/admin/pos" element={<AuthGuard allowedRoles={['admin']}><StaffDashboard /></AuthGuard>} />
                <Route path="/admin/dashboard" element={<AuthGuard allowedRoles={['admin']}><CommandCenter /></AuthGuard>} />
                <Route path="/admin/qr" element={<AuthGuard allowedRoles={['admin']}><QrHub /></AuthGuard>} />
                
                {/* Legacy payment routes - require auth */}
                <Route path="/processing/:orderCode" element={<AuthGuard><PaymentProcessing /></AuthGuard>} />
                <Route path="/success" element={<PaymentSuccess />} />
                <Route path="/error" element={<PaymentError />} />
                
                {/* Legal pages (public) */}
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
                <Route path="/refund-policy" element={<RefundPolicy />} />
                <Route path="/delivery-policy" element={<DeliveryPolicy />} />

                {/* Visual-only Food OS workspace. Development builds only: this route is
                    intentionally unavailable in production until its modules are wired,
                    secured and approved. */}
                {import.meta.env.DEV && <Route path="/os-preview" element={<FoodOSPreview />} />}
                
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            </BrowserRouter>
          </CartSyncProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
