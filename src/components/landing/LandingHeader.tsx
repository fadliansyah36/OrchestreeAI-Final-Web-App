import React, { useState } from 'react';
import { Menu, X, ShieldCheck, ArrowRight, Sparkles } from 'lucide-react';

interface LandingHeaderProps {
  onScrollToSection: (sectionId: string) => void;
  onOpenRegister: () => void;
  onOpenLogin: () => void;
  onOpenProspectModal: () => void;
}

export const LandingHeader: React.FC<LandingHeaderProps> = ({
  onScrollToSection,
  onOpenRegister,
  onOpenLogin,
  onOpenProspectModal,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (sectionId: string) => {
    onScrollToSection(sectionId);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#0B1220]/90 backdrop-blur-xl transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Brand Identity */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => handleNavClick('hero')}
            className="flex items-center space-x-3 text-left group focus:outline-none cursor-pointer"
          >
            <img
              src="/logoorchestreeweb.png"
              alt="OrchestreeAI Logo"
              className="w-10 h-10 rounded-xl object-contain shadow-md shadow-[#34D399]/20 group-hover:scale-105 transition-transform shrink-0"
              referrerPolicy="no-referrer"
            />
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-xl tracking-tight text-white">
                  Orchestree<span className="text-[#34D399]">.AI</span>
                </span>
                <span className="hidden sm:inline-block text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-[#34D399]/15 text-[#34D399] border border-[#34D399]/30 font-bold">
                  AI Workforce OS
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium hidden md:block">
                Sistem Operasi Tenaga Kerja AI Otonom
              </p>
            </div>
          </button>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center space-x-6 text-xs font-semibold text-slate-300">
          <button
            onClick={() => handleNavClick('pilar-produk')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Pilar Produk
          </button>
          <button
            onClick={() => handleNavClick('how-it-works')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Cara Kerja
          </button>
          <button
            onClick={() => handleNavClick('use-cases')}
            className="hover:text-white transition-colors cursor-pointer text-[#60A5FA]"
          >
            Solusi Industri
          </button>
          <button
            onClick={() => handleNavClick('keamanan')}
            className="hover:text-white transition-colors cursor-pointer flex items-center space-x-1"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#34D399]" />
            <span>Keamanan</span>
          </button>
          <button
            onClick={() => handleNavClick('pricing')}
            className="hover:text-white transition-colors cursor-pointer font-bold text-white hover:text-[#34D399]"
          >
            Paket Layanan
          </button>
          <button
            onClick={() => handleNavClick('faq')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            FAQ
          </button>
        </nav>

        {/* Action Buttons */}
        <div className="hidden sm:flex items-center space-x-3">
          <button
            onClick={onOpenProspectModal}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 text-xs font-semibold backdrop-blur-md transition-all cursor-pointer"
          >
            Request Demo
          </button>
          <button
            onClick={onOpenLogin}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold transition-all cursor-pointer"
          >
            Masuk
          </button>
          <button
            onClick={onOpenRegister}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#1FA35A] to-[#1E6FE0] text-white text-xs font-bold shadow-md shadow-[#1FA35A]/25 hover:shadow-[#1FA35A]/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-white" />
            <span>Coba Gratis</span>
          </button>
        </div>

        {/* Mobile Hamburger Toggle */}
        <div className="flex sm:hidden">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-b border-white/10 bg-[#0B1220] px-4 pt-3 pb-6 space-y-3">
          <button
            onClick={() => handleNavClick('pilar-produk')}
            className="block w-full text-left py-2 text-sm font-medium text-slate-200"
          >
            Pilar Produk
          </button>
          <button
            onClick={() => handleNavClick('how-it-works')}
            className="block w-full text-left py-2 text-sm font-medium text-slate-200"
          >
            Cara Kerja
          </button>
          <button
            onClick={() => handleNavClick('use-cases')}
            className="block w-full text-left py-2 text-sm font-medium text-slate-200"
          >
            Solusi Industri
          </button>
          <button
            onClick={() => handleNavClick('keamanan')}
            className="block w-full text-left py-2 text-sm font-medium text-slate-200"
          >
            Keamanan
          </button>
          <button
            onClick={() => handleNavClick('pricing')}
            className="block w-full text-left py-2 text-sm font-medium text-slate-200"
          >
            Paket Layanan
          </button>
          <button
            onClick={() => handleNavClick('faq')}
            className="block w-full text-left py-2 text-sm font-medium text-slate-200"
          >
            FAQ
          </button>
          <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenProspectModal();
              }}
              className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-center text-xs font-semibold text-white"
            >
              Request Demo
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenLogin();
              }}
              className="w-full py-2.5 rounded-xl bg-white/5 text-center text-xs font-semibold text-white"
            >
              Masuk
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenRegister();
              }}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#1FA35A] to-[#1E6FE0] text-center text-xs font-bold text-white"
            >
              Coba Gratis
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
