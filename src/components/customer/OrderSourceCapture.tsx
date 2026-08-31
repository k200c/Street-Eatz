import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { captureOrderSource } from '@/lib/orderSource';

export function OrderSourceCapture() {
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('source')) captureOrderSource(params);
  }, [location.search]);

  return null;
}
