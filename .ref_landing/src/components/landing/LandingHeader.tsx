import React, { useState } from 'react';
import { Sparkles, Menu, X, ShieldCheck } from 'lucide-react';

interface LandingHeaderProps {
  onScrollToSection: (sectionId: string) => void;
  onOpenProspectForm?: () => void;
}

export const LandingHeader: React.FC<LandingHeaderProps> = ({ onScrollToSection, onOpenProspectForm }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (sectionId: string) => {
    onScrollToSection(sectionId);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#071226]/90 backdrop-blur-xl transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
        {/* Brand Identity */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => handleNavClick('hero')}
            className="flex items-center space-x-3 text-left group focus:outline-none cursor-pointer"
          >
            <img
              src="/logoorchestreeweb.png"
              alt="OrchestreeAI Logo"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-contain shadow-md shadow-[#08B85C]/20 group-hover:scale-105 transition-transform shrink-0"
              referrerPolicy="no-referrer"
            />
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg tracking-tight text-white">
                  Orchestree<span className="text-[#08B85C]">.AI</span>
                </span>
                <span className="hidden sm:inline-block text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-[#08B85C]/15 text-[#08B85C] border border-[#08B85C]/30 font-bold">
                  AI Workforce OS
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium hidden md:block">
                Human + AI Workforce Operating System
              </p>
            </div>
          </button>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center space-x-7 text-xs font-semibold text-slate-300">
          <button
            onClick={() => handleNavClick('workforce-universe')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Workforce Universe
          </button>
          <button
            onClick={() => handleNavClick('how-it-works')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Cara Kerja
          </button>
          <button
            onClick={() => handleNavClick('ai-employees')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            AI Employees
          </button>
          <button
            onClick={() => handleNavClick('collaboration')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Human + AI
          </button>
          <button
            onClick={() => handleNavClick('social-creative')}
            className="hover:text-white transition-colors cursor-pointer text-[#16B7D9] hover:text-white"
          >
            Social & Creative
          </button>
          <button
            onClick={() => handleNavClick('omnichannel-sales')}
            className="hover:text-white transition-colors cursor-pointer text-[#08B85C]"
          >
            Omnichannel Sales
          </button>
          <button
            onClick={() => handleNavClick('enterprise-workforce')}
            className="hover:text-white transition-colors cursor-pointer text-[#1976E8]"
          >
            Enterprise Workforce
          </button>
          <button
            onClick={() => handleNavClick('mobile-app')}
            className="hover:text-white transition-colors cursor-pointer text-[#08B85C] flex items-center space-x-1"
          >
            <span>App Mobile</span>
          </button>
          <button
            onClick={() => handleNavClick('performance')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Performance & HR
          </button>
          <button
            onClick={() => handleNavClick('roi-calculator')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Kalkulator ROI
          </button>
          <button
            onClick={() => handleNavClick('pricing')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Harga
          </button>
          <button
            onClick={() => handleNavClick('faq')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            FAQ
          </button>
        </nav>

        {/* Action Button & Status Badge */}
        <div className="hidden sm:flex items-center space-x-3">
          {onOpenProspectForm && (
            <button
              onClick={onOpenProspectForm}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#08B85C] to-[#1976E8] text-white text-xs font-bold shadow-md shadow-[#08B85C]/20 hover:brightness-110 transition-all cursor-pointer flex items-center space-x-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Daftar Trial (36 Slot)</span>
            </button>
          )}
          <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono font-medium text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Sovereign AI OS</span>
          </div>
        </div>

        {/* Mobile Hamburger Button */}
        <div className="lg:hidden flex items-center space-x-2">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 focus:outline-none"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-b border-white/10 bg-[#071226]/95 backdrop-blur-2xl px-4 py-6 space-y-4 animate-in slide-in-from-top-4 duration-200">
          <div className="grid grid-cols-2 gap-2 text-xs font-medium text-slate-300">
            <button
              onClick={() => handleNavClick('workforce-universe')}
              className="p-2.5 text-left rounded-lg hover:bg-white/5 hover:text-white"
            >
              Workforce Universe
            </button>
            <button
              onClick={() => handleNavClick('how-it-works')}
              className="p-2.5 text-left rounded-lg hover:bg-white/5 hover:text-white"
            >
              Cara Kerja
            </button>
            <button
              onClick={() => handleNavClick('ai-employees')}
              className="p-2.5 text-left rounded-lg hover:bg-white/5 hover:text-white"
            >
              AI Employees
            </button>
            <button
              onClick={() => handleNavClick('collaboration')}
              className="p-2.5 text-left rounded-lg hover:bg-white/5 hover:text-white"
            >
              Human + AI Flow
            </button>
            <button
              onClick={() => handleNavClick('social-creative')}
              className="p-2.5 text-left rounded-lg hover:bg-white/5 text-[#16B7D9]"
            >
              Social & Creative AI
            </button>
            <button
              onClick={() => handleNavClick('omnichannel-sales')}
              className="p-2.5 text-left rounded-lg hover:bg-white/5 text-[#08B85C]"
            >
              Omnichannel Sales
            </button>
            <button
              onClick={() => handleNavClick('enterprise-workforce')}
              className="p-2.5 text-left rounded-lg hover:bg-white/5 text-[#1976E8]"
            >
              Enterprise Workforce
            </button>
            <button
              onClick={() => handleNavClick('mobile-app')}
              className="p-2.5 text-left rounded-lg hover:bg-white/5 text-[#08B85C]"
            >
              Aplikasi Mobile
            </button>
            <button
              onClick={() => handleNavClick('performance')}
              className="p-2.5 text-left rounded-lg hover:bg-white/5 hover:text-white"
            >
              Performance & HR
            </button>
            <button
              onClick={() => handleNavClick('roi-calculator')}
              className="p-2.5 text-left rounded-lg hover:bg-white/5 hover:text-white"
            >
              Kalkulator ROI
            </button>
            <button
              onClick={() => handleNavClick('pricing')}
              className="p-2.5 text-left rounded-lg hover:bg-white/5 hover:text-white"
            >
              Daftar Harga
            </button>
            <button
              onClick={() => handleNavClick('faq')}
              className="p-2.5 text-left rounded-lg hover:bg-white/5 hover:text-white col-span-2"
            >
              FAQ & Panduan Kerja
            </button>
          </div>
          {onOpenProspectForm && (
            <div className="pt-2">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenProspectForm();
                }}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#08B85C] to-[#1976E8] text-white text-xs font-bold shadow-lg shadow-[#08B85C]/20 flex items-center justify-center space-x-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>Daftar Seleksi Trial 7 Hari (36 Slot)</span>
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
};
