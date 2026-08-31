import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { QrCode } from 'lucide-react';
import { captureOrderSource } from '@/lib/orderSource';

export default function QrOrderEntry() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    captureOrderSource(location.search, 'qr');
    navigate('/menu', { replace: true });
  }, [location.search, navigate]);

  return (
    <main className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
      <div className="text-center">
        <QrCode className="w-10 h-10 text-primary mx-auto mb-4 animate-pulse" />
        <h1 className="font-heading text-2xl">OPENING THE MENU</h1>
        <p className="text-sm text-muted-foreground mt-2">Your QR order is being connected.</p>
      </div>
    </main>
  );
}
