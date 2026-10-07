'use client';

import React, { useMemo } from 'react';
import {
  Users,
  Briefcase,
  TrendingUp,
  Brain,
  ShieldCheck,
  Sparkles,
  Search,
  CreditCard,
  Settings,
  Lock,
  ChevronRight,
  Activity,
  Layers
} from 'lucide-react';

export interface CategoryCard {
  key: string;
  label: string;
  icon: string;
  route: string;
  section?: string;
  description?: string;
  badgeCount?: number;
  isLocked?: boolean;
  tierRequired?: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  onUpgradeClick?: () => void;
}

export interface FeatureHubScreenProps {
  domain: string;
  description?: string;
  eyebrow?: string;
  analyticsSlot: React.ReactNode;
  categoryCards: CategoryCard[];
  insightFeed?: React.ReactNode;
  onNavigate?: (route: string) => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
  users: Users,
  briefcase: Briefcase,
  trending: TrendingUp,
  brain: Brain,
  shield: ShieldCheck,
  sparkles: Sparkles,
  search: Search,
  credit: CreditCard,
  settings: Settings,
  activity: Activity,
  layers: Layers
};

export function CategoryCardTile({
  card,
  onClick
}: {
  card: CategoryCard;
  onClick?: () => void;
}) {
  const IconComponent = ICON_MAP[card.icon.toLowerCase()] || Layers;

  const handleClick = () => {
    if (card.isLocked) {
      card.onUpgradeClick?.();
      return;
    }
    onClick?.();
  };

  return (
    <button
      id={`hub-category-${card.key}`}
      type="button"
      onClick={handleClick}
      className="group relative flex min-h-[164px] w-full flex-col justify-between rounded-[var(--orch-radius-md)] border border-[var(--orch-border)] bg-[var(--orch-surface-elevated)] p-5 text-left shadow-[var(--orch-shadow-1)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--orch-primary-green)] hover:shadow-[var(--orch-shadow-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--orch-primary-green)] disabled:cursor-not-allowed"
    >
      <div className="flex w-full items-start justify-between gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--orch-radius-sm)] border border-[var(--orch-border)] bg-[var(--orch-surface-muted)] text-[var(--orch-primary-green)] transition-colors group-hover:bg-[var(--orch-primary-green)] group-hover:text-white"
          aria-hidden="true"
        >
          <IconComponent className="h-5 w-5" />
        </span>

        {card.isLocked ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--orch-border)] bg-[var(--orch-surface-muted)] px-2 py-1 text-[11px] font-semibold text-[var(--orch-text-secondary)]">
            <Lock className="h-3 w-3" />
            {card.tierRequired || 'Terkunci'}
          </span>
        ) : typeof card.badgeCount === 'number' && card.badgeCount > 0 ? (
          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-[var(--orch-primary-green)] px-2 py-1 text-[11px] font-bold text-white">
            {card.badgeCount > 99 ? '99+' : card.badgeCount}
          </span>
        ) : null}
      </div>

      <span className="mt-5 block">
        <span className="block text-[15px] font-bold tracking-tight text-[var(--orch-text-primary)]">
          {card.label}
        </span>
        <span className="mt-1 flex items-center text-xs font-medium text-[var(--orch-text-muted)] transition-colors group-hover:text-[var(--orch-primary-green)]">
          <span>{card.isLocked ? 'Paket diperlukan' : 'Buka modul'}</span>
          <ChevronRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
        {card.description ? (
          <span className="mt-2 block line-clamp-2 text-xs leading-5 text-[var(--orch-text-secondary)]">
            {card.description}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function FeatureHubScreen({
  domain,
  description = 'Pusat kendali dan visibilitas operasional.',
  eyebrow = 'Workspace',
  analyticsSlot,
  categoryCards,
  insightFeed,
  onNavigate
}: FeatureHubScreenProps) {
  const groupedCards = useMemo(() => {
    const groups = new Map<string, CategoryCard[]>();
    categoryCards.forEach((card) => {
      const key = card.section || 'Kategori layanan';
      groups.set(key, [...(groups.get(key) || []), card]);
    });
    return Array.from(groups.entries());
  }, [categoryCards]);

  return (
    <main
      id={`feature-hub-${domain.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
      className="mx-auto flex w-full max-w-[1440px] flex-col gap-7 px-4 pb-8 pt-6 sm:px-6 lg:px-8"
    >
      <header className="flex flex-col gap-3 border-b border-[var(--orch-border)] pb-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--orch-primary-green)]">
            {eyebrow}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--orch-text-primary)] sm:text-3xl">
            {domain}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--orch-text-secondary)]">
            {description}
          </p>
        </div>
      </header>

      <section aria-label="Ringkasan workspace" className="w-full">
        {analyticsSlot}
      </section>

      <section aria-label="Domain dan modul" className="w-full">
        <div className="space-y-7">
          {groupedCards.map(([sectionName, cards]) => (
            <div key={sectionName}>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-[var(--orch-text-primary)]">{sectionName}</h2>
                  <p className="mt-0.5 text-xs text-[var(--orch-text-muted)]">
                    Modul yang tersedia pada struktur aplikasi saat ini.
                  </p>
                </div>
                <span className="text-[11px] font-semibold text-[var(--orch-text-muted)]">
                  {cards.length} modul
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {cards.map((card) => (
                  <CategoryCardTile
                    key={card.key}
                    card={card}
                    onClick={() => onNavigate?.(card.route)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {insightFeed ? (
        <section aria-label="Insight workspace" className="w-full">
          {insightFeed}
        </section>
      ) : null}
    </main>
  );
}
