'use client';

import React from 'react';
import { useLocaleContext } from '../i18n';
import {
  Home,
  Briefcase,
  Sparkles,
  BarChart3,
  Bell,
  User,
  ShieldCheck,
  Building2,
  Server,
  DollarSign,
  LucideIcon
} from 'lucide-react';

export interface BottomNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badgeCount?: number;
  isSpecialAction?: boolean;
}

export interface OrchBottomNavProps {
  mode: 'client' | 'admin';
  activeId: string;
  onSelect: (id: string) => void;
  unreadCount?: number;
  pendingTasksCount?: number;
}

export function OrchBottomNav({
  mode,
  activeId,
  onSelect,
  unreadCount = 0,
  pendingTasksCount = 0
}: OrchBottomNavProps) {
  const { locale } = useLocaleContext();

  const clientItems: BottomNavItem[] = [
    { id: 'home', label: locale === 'en' ? 'Home' : 'Beranda', icon: Home },
    { id: 'work', label: locale === 'en' ? 'Work' : 'Kerja', icon: Briefcase, badgeCount: pendingTasksCount },
    { id: 'overview', label: locale === 'en' ? 'Overview' : 'Ringkasan', icon: BarChart3 },
    { id: 'activity', label: locale === 'en' ? 'Activity' : 'Aktivitas', icon: Bell, badgeCount: unreadCount },
    { id: 'account', label: locale === 'en' ? 'Account' : 'Akun', icon: User }
  ];

  const adminItems: BottomNavItem[] = [
    { id: 'admin_overview', label: locale === 'en' ? 'Overview' : 'Ringkasan', icon: ShieldCheck },
    { id: 'admin_tenants', label: locale === 'en' ? 'Tenants' : 'Tenant', icon: Building2 },
    { id: 'admin_system', label: locale === 'en' ? 'System' : 'Sistem', icon: Server },
    { id: 'admin_finance', label: locale === 'en' ? 'Finance' : 'Keuangan', icon: DollarSign },
    { id: 'admin_account', label: locale === 'en' ? 'Account' : 'Akun', icon: User }
  ];

  const items = mode === 'client' ? clientItems : adminItems;

  return (
    <nav
      id="orch-bottom-navigation"
      aria-label="Navigasi Bawah Utama"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0B1220]/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800/80 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.4)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="max-w-md mx-auto px-3 flex items-center justify-between h-16">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeId === item.id;

          if (item.isSpecialAction) {
            return (
              <button
                key={item.id}
                id={`bottom-nav-${item.id}`}
                onClick={() => onSelect(item.id)}
                className="relative -top-3 flex flex-col items-center justify-center min-w-[56px] min-h-[56px] rounded-2xl bg-gradient-to-tr from-emerald-600 to-sky-600 text-white shadow-lg shadow-emerald-500/25 hover:scale-105 active:scale-95 transition-transform cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                aria-label={item.label}
              >
                <Icon className="w-6 h-6 animate-pulse" />
                <span className="sr-only">{item.label}</span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              id={`bottom-nav-${item.id}`}
              onClick={() => onSelect(item.id)}
              className={`relative flex flex-col items-center justify-center flex-1 h-full min-h-[48px] px-1 py-1 rounded-xl transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                isActive
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                {item.badgeCount && item.badgeCount > 0 ? (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                    {item.badgeCount > 99 ? '99+' : item.badgeCount}
                  </span>
                ) : null}
              </div>
              <span
                className={`text-[11px] mt-1 font-medium tracking-tight ${
                  isActive ? 'font-semibold text-emerald-600 dark:text-emerald-400' : ''
                }`}
              >
                {item.label}
              </span>
              {isActive && (
                <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-emerald-500" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
