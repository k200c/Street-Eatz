import { Phone, Mail, MapPin, Clock, Instagram, Facebook } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { BottomNav } from '@/components/layout/BottomNav';
import { clientAssets, clientConfig, clientMailto } from '@/config/client';

const getOpenStatus = () => {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ..., 4=Thu, 5=Fri, 6=Sat
  const hour = now.getHours();
  
  // Thu=4, Fri=5: 12pm-7pm (12-19)
  // Sat=6, Sun=0: 1pm-7pm (13-19)
  if (day === 4 || day === 5) {
    return hour >= 12 && hour < 19;
  }
  if (day === 6 || day === 0) {
    return hour >= 13 && hour < 19;
  }
  return false;
};

export default function Details() {
  const [isOpen, setIsOpen] = useState(getOpenStatus);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setIsOpen(getOpenStatus());
    }, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-background pb-24 pt-[var(--header-offset)]">
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* Header with Logo */}
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-10"
          >
            <img 
              src={clientAssets.logo}
              alt={`${clientConfig.brandName} logo`} 
              className="w-32 h-32 mx-auto mb-4 object-contain"
            />
            <h1 className="font-heading text-3xl font-bold text-foreground tracking-wider">
              {clientConfig.brandName.toUpperCase()}
            </h1>
            <p className="text-muted-foreground mt-2">{clientConfig.category} • {clientConfig.city}</p>
            
            {/* Live Status Indicator */}
            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/50 border border-border">
              <span className={`w-3 h-3 rounded-full ${isOpen ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className={`font-semibold ${isOpen ? 'text-green-500' : 'text-red-500'}`}>
                {isOpen ? 'Open Now' : 'Closed'}
              </span>
            </div>
          </motion.div>

        {/* Opening Hours */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-6 mb-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <h2 className="font-heading text-lg font-semibold text-foreground">Opening Hours</h2>
          </div>
          <div className="space-y-3">
            {clientConfig.openingHours.map(({ day, time }) => (
              <div key={day} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
                <span className="text-foreground font-medium">{day}</span>
                <span className="text-primary font-semibold">{time}</span>
              </div>
            ))}
          </div>
        </motion.section>

        {/* Contact Info */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-6 mb-6"
        >
          <h2 className="font-heading text-lg font-semibold text-foreground mb-4">Contact Us</h2>
          <div className="space-y-4">
            <a 
              href={clientConfig.phoneHref} 
              className="flex items-center gap-4 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Phone className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="text-foreground font-medium">{clientConfig.phoneDisplay}</p>
              </div>
            </a>
            <a 
              href={clientMailto} 
              className="flex items-center gap-4 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Mail className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="text-foreground font-medium text-sm">{clientConfig.email}</p>
              </div>
            </a>
          </div>
        </motion.section>

        {/* Social Media */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-6 mb-6"
        >
          <h2 className="font-heading text-lg font-semibold text-foreground mb-4">Follow Us</h2>
          <div className="flex gap-4">
            <a 
              href={clientConfig.instagramUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-3 p-4 rounded-lg bg-gradient-to-r from-purple-600/20 to-pink-600/20 hover:from-purple-600/30 hover:to-pink-600/30 transition-colors border border-purple-500/20"
            >
              <Instagram className="w-6 h-6 text-pink-400" />
              <span className="text-foreground font-medium">Instagram</span>
            </a>
            <a 
              href={clientConfig.facebookUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-3 p-4 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 transition-colors border border-blue-500/20"
            >
              <Facebook className="w-6 h-6 text-blue-400" />
              <span className="text-foreground font-medium">Facebook</span>
            </a>
          </div>
        </motion.section>

        {/* Location */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
            <h2 className="font-heading text-lg font-semibold text-foreground">Location</h2>
          </div>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            {clientConfig.addressLines.map((line) => <span key={line}>{line}<br /></span>)}
          </p>
          <div className="rounded-xl overflow-hidden border border-border">
            <iframe
              src={clientConfig.mapEmbedUrl}
              width="100%"
              height="250"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title={`${clientConfig.brandName} location`}
              className="grayscale hover:grayscale-0 transition-all duration-500"
            />
          </div>
        </motion.section>
      </div>
    </div>
      <BottomNav />
    </>
  );
}
