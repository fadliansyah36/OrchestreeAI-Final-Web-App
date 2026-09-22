import React, { useState } from 'react';
import {
  Share2,
  Video,
  Image as ImageIcon,
  Palette,
  Sparkles,
  CheckCircle2,
  Calendar,
  Radio,
  BarChart3,
  ShieldCheck,
  Zap,
  Play,
  ArrowRight,
} from 'lucide-react';

export const SocialCreativeWorkforceSection: React.FC = () => {
  const [activeCreativeTab, setActiveCreativeTab] = useState<'video' | 'feed' | 'calendar' | 'brandkit'>('video');

  const creativeAgents = [
    { name: 'Dimas Art', role: 'AI Creative Director & Video Specialist', icon: '🎨' },
    { name: 'Kirana', role: 'AI Content Strategist', icon: '🚀' },
    { name: 'Reza Copy', role: 'AI Copywriter & Hook Specialist', icon: '✍️' },
    { name: 'Citra Guardian', role: 'AI Brand & Compliance Guardian', icon: '🛡️' },
    { name: 'Siti Social', role: 'AI Auto Scheduler & Dispatcher', icon: '📱' },
  ];

  const socialPlatforms = [
    { name: 'Instagram', status: 'Reels, Carousel, Feed & Story 9:16' },
    { name: 'TikTok', status: 'Video 9:16 + Trending Hook Copy' },
    { name: 'LinkedIn', status: 'Professional Thought Leadership' },
    { name: 'Facebook', status: 'Display Ads & Page Broadcast' },
    { name: 'YouTube Shorts', status: 'Short-Form Video Syndication' },
    { name: 'WhatsApp', status: 'Catalog & Customer Broadcast' },
  ];

  return (
    <section id="social-creative" className="py-24 bg-[#071226] text-white border-t border-white/10 relative overflow-hidden">
      {/* Glow Effects */}
      <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-[#16B7D9]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-purple-500/30 text-xs font-semibold text-purple-300 mb-4">
            <Share2 className="w-3.5 h-3.5" />
            <span>AUTOPILOT SOCIAL & CREATIVE STUDIO</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Produksi Konten & Distribusi Media Sosial Otomatis
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            Dari penyusunan strategi konten, copywriting persuasi, sintesis visual OpenAI GPT-4o & Gemini, hingga penjadwalan penerbitan multi-platform secara terorkestrasi
          </p>
        </div>

        {/* Closed-Loop Social Flow Pipeline Bar */}
        <div className="mt-12 p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
          <span className="px-3 py-1 rounded-lg bg-white/5 text-slate-300">1. Strategi & Riset</span>
          <span className="text-slate-500">→</span>
          <span className="px-3 py-1 rounded-lg bg-white/5 text-slate-300">2. Kalender Konten</span>
          <span className="text-slate-500">→</span>
          <span className="px-3 py-1 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30">3. Sintesis Video & Visual</span>
          <span className="text-slate-500">→</span>
          <span className="px-3 py-1 rounded-lg bg-white/5 text-slate-300">4. Copywriting Hook</span>
          <span className="text-slate-500">→</span>
          <span className="px-3 py-1 rounded-lg bg-amber-500/20 text-amber-300">5. Human Approval</span>
          <span className="text-slate-500">→</span>
          <span className="px-3 py-1 rounded-lg bg-[#08B85C]/20 text-[#08B85C]">6. Auto-Publish</span>
          <span className="text-slate-500">→</span>
          <span className="px-3 py-1 rounded-lg bg-[#16B7D9]/20 text-[#16B7D9]">7. Social Analytics</span>
        </div>

        {/* Main 2-Col Interactive Showcase */}
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Col: Creative Team & Tabs */}
          <div className="lg:col-span-6 space-y-6">
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-400">
                Creative Workforce Collaboration
              </span>
              <h3 className="text-2xl font-bold text-white">
                Satu Tim Kreatif AI Lengkap yang Bekerja Bersama
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Staf kreatif AI saling berkoordinasi: Creative Director merancang storyboard, Copywriter menulis headline, Brand Guardian memeriksa kepatuhan warna dan klaim terlarang, dan Scheduler menerbitkan di jam puncak engagement.
              </p>
            </div>

            {/* Creative Agents List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {creativeAgents.map((ag, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center space-x-3"
                >
                  <span className="text-2xl">{ag.icon}</span>
                  <div>
                    <h4 className="text-xs font-bold text-white">{ag.name}</h4>
                    <p className="text-[10px] text-slate-400">{ag.role}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Supported Platforms Grid */}
            <div className="pt-2">
              <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider block mb-2">
                Terhubung Langsung ke Platform Resmi:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {socialPlatforms.map((p, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl bg-white/5 border border-white/5 space-y-0.5">
                    <span className="font-bold text-white block">{p.name}</span>
                    <span className="text-[10px] text-slate-400 leading-tight block">{p.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Col: Video / Carousel Interactive Preview */}
          <div className="lg:col-span-6">
            <div className="rounded-3xl bg-gradient-to-b from-[#0B1835] to-[#071226] border border-purple-500/30 p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center space-x-2">
                  <Video className="w-5 h-5 text-purple-400" />
                  <span className="font-bold text-sm text-white">Sovereign Video & Creative Preview</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono">
                  OpenAI GPT-4o / Gemini Engine
                </span>
              </div>

              {/* Simulated 9:16 Video Frame with Safe-Zone Guidelines */}
              <div className="aspect-[9/14] sm:aspect-[16/9] w-full rounded-2xl bg-gradient-to-tr from-slate-900 via-purple-950/40 to-slate-900 border border-white/10 relative overflow-hidden flex flex-col justify-between p-4">
                {/* Safe Zone Overlay Indicator */}
                <div className="flex items-center justify-between text-[10px] text-purple-300 font-mono">
                  <span className="px-2 py-0.5 rounded bg-black/50 border border-purple-500/30">
                    Safe-Zone Margin: 9:16 Compliant
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#08B85C]/20 text-[#08B85C]">
                    Audio: 48kHz Stereo Sync
                  </span>
                </div>

                {/* Center Play Graphic */}
                <div className="self-center flex flex-col items-center space-y-2">
                  <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-xl hover:scale-110 transition-transform cursor-pointer">
                    <Play className="w-6 h-6 ml-1 text-white fill-white" />
                  </div>
                  <span className="text-xs font-semibold text-slate-200">Scene 1: Narrative Product Hook</span>
                </div>

                {/* Bottom Caption & Token Verification */}
                <div className="bg-black/60 backdrop-blur-md p-3 rounded-xl border border-white/10 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#16B7D9] font-mono">Brand Kit: Verified #08B85C</span>
                    <span className="text-[10px] text-[#08B85C] flex items-center space-x-1">
                      <ShieldCheck className="w-3 h-3" />
                      <span>Zero Forbidden Claims</span>
                    </span>
                  </div>
                  <p className="text-slate-200 text-[11px] font-sans">
                    "Tingkatkan produktivitas bisnis 10x lipat dengan AI Workforce Operating System pertama di Indonesia."
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
