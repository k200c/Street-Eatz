import { Navbar } from '@/components/layout/Navbar';
import { FooterInfoBar } from '@/components/layout/FooterInfoBar';
import { HeroSection } from '@/components/customer/HeroSection';
import { MenuSection } from '@/components/customer/MenuSection';

export default function Index() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <HeroSection />
      <MenuSection />
      <FooterInfoBar />
    </div>
  );
}
