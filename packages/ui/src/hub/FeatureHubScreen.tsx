import React from 'react';
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
  badgeCount?: number;
  isLocked?: boolean;
  tierRequired?: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  onUpgradeClick?: () => void;
}

export interface FeatureHubScreenProps {
  domain: string;
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
      if (card.onUpgradeClick) {
        card.onUpgradeClick();
      }
      return;
    }
    onClick?.();
  };

  return (
    <div
      id={`hub-category-${card.key}`}
      onClick={handleClick}
      className={`group relative flex flex-col justify-between text-left p-5 rounded-2xl border transition-all duration-200 ${
        card.isLocked
          ? 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-purple-900/40 cursor-pointer shadow-sm hover:border-purple-500/50'
          : 'bg-white dark:bg-[#0B1220] border-slate-200/80 dark:border-slate-800/80 hover:border-emerald-500/60 dark:hover:border-emerald-400/60 shadow-sm hover:shadow-md cursor-pointer'
      }`}
    >
      <div className="flex items-start justify-between w-full mb-3">
        <div
          className={`p-2.5 rounded-xl ${
            card.isLocked
              ? 'bg-purple-950/40 text-purple-400 border border-purple-800/30'
              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors'
          }`}
        >
          <IconComponent className="w-5 h-5" />
        </div>
        {card.isLocked ? (
          <div className="flex items-center gap-1.5">
            {card.tierRequired === 'ENTERPRISE' ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-400 border border-purple-500/30 shadow-sm">
                <Lock className="w-3 h-3 text-purple-400" />
                Enterprise
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <Lock className="w-3 h-3" />
                Terkunci
              </span>
            )}
          </div>
        ) : typeof card.badgeCount === 'number' && card.badgeCount > 0 ? (
          <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200">
            {card.badgeCount}
          </span>
        ) : null}
      </div>

      <div>
        <h4 className="font-semibold text-slate-900 dark:text-white text-base tracking-tight mb-1">
          {card.label}
        </h4>
        {card.isLocked && card.tierRequired === 'ENTERPRISE' ? (
          <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
            <span className="text-[11px] text-purple-600 dark:text-purple-300/80 font-medium">Eksklusif Enterprise</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (card.onUpgradeClick) {
                  card.onUpgradeClick();
                } else if (onClick) {
                  onClick();
                }
              }}
              className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-sm transition-all flex items-center gap-1 cursor-pointer"
            >
              Tingkatkan ke Enterprise
            </button>
          </div>
        ) : (
          <div className="flex items-center text-xs text-slate-500 dark:text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 font-medium pt-1">
            <span>{card.isLocked ? 'Terkunci Paket' : 'Buka modul'}</span>
            <ChevronRight className="w-3.5 h-3.5 ml-1 transition-transform group-hover:translate-x-0.5" />
          </div>
        )}
      </div>
    </div>
  );
}

export function FeatureHubScreen({
  domain,
  analyticsSlot,
  categoryCards,
  insightFeed,
  onNavigate
}: FeatureHubScreenProps) {
  return (
    <div id={`feature-hub-${domain.toLowerCase().replace(/\s+/g, '-')}`} className="flex flex-col gap-6 p-4 md:p-6 max-w-7xl mx-auto w-full">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            {domain}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Pusat kendali dan visibilitas operasional
          </p>
        </div>
      </header>

      {/* Analytics Slot */}
      <section aria-label="analytics" className="w-full">
        {analyticsSlot}
      </section>

      {/* Categories Grid */}
      <section aria-label="categories" className="w-full">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
          Kategori Layanan
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {categoryCards.map((card) => (
            <CategoryCardTile
              key={card.key}
              card={card}
              onClick={() => onNavigate && onNavigate(card.route)}
            />
          ))}
        </div>
      </section>

      {/* Actionable Insight Feed */}
      {insightFeed && (
        <section aria-label="insights" className="w-full pt-2">
          {insightFeed}
        </section>
      )}
    </div>
  );
}
