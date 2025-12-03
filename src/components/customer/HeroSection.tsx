import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';

export function HeroSection() {
  const scrollToMenu = () => {
    const menuSection = document.getElementById('menu');
    if (menuSection) {
      menuSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="min-h-screen flex flex-col items-center justify-center text-center px-4 pt-16 pb-20">
      {/* Logo/Brand Icon */}
      <div className="mb-8">
        <div className="w-24 h-24 mx-auto mb-6 relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
          <div className="relative w-full h-full bg-gradient-to-br from-primary to-orange-600 rounded-full flex items-center justify-center">
            <span className="font-heading text-3xl font-extrabold text-primary-foreground">SE</span>
          </div>
        </div>
      </div>

      {/* Main Headlines */}
      <div className="space-y-2 mb-6">
        <h1 className="font-heading text-6xl sm:text-7xl md:text-8xl font-extrabold text-primary tracking-tight text-glow-strong">
          GOURMET
        </h1>
        <h2 className="font-heading text-5xl sm:text-6xl md:text-7xl font-extrabold text-foreground tracking-tight">
          STREET FOOD
        </h2>
      </div>

      {/* Tagline */}
      <p className="text-muted-foreground text-sm sm:text-base tracking-[0.3em] uppercase mb-10">
        Fresh · Bold · Waterford
      </p>

      {/* CTA Buttons */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Button
          size="lg"
          onClick={scrollToMenu}
          className="btn-glow text-base px-8 py-6 font-semibold tracking-wider"
        >
          ORDER NOW
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={scrollToMenu}
          className="border-primary text-primary hover:bg-primary hover:text-primary-foreground text-base px-8 py-6 font-semibold tracking-wider"
        >
          VIEW MENU
        </Button>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-24 left-1/2 -translate-x-1/2 animate-bounce">
        <ChevronDown className="w-8 h-8 text-muted-foreground" />
      </div>
    </section>
  );
}
