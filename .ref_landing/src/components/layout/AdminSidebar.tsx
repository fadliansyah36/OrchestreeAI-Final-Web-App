import React from 'react';
import {
  LayoutDashboard,
  Building2,
  Cpu,
  Wrench,
  Layers,
  Database,
  Puzzle,
  TrendingUp,
  ShieldCheck,
  Activity,
  LogOut,
  AlertOctagon,
  CreditCard,
  Sliders,
  Wallet,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export type AdminScreenType =
  | 'overview'
  | 'system_monitoring'
  | 'tenant_workforce'
  | 'prospect_registrations'
  | 'commercial_plans'
  | 'credit_metering'
  | 'tenant_credit_override'
  | 'financial_command_center'
  | 'payment_reconciliation'
  | 'dead_letter_queue'
  | 'tenants'
  | 'llm_providers'
  | 'mcp_tools'
  | 'app_registry'
  | 'master_data'
  | 'skill_plugins'
  | 'usage_cost'
  | 'security_audit'
  | 'workflow_tracing'
  | 'memory_management';

interface AdminSidebarProps {
  currentScreen: AdminScreenType;
  onNavigate: (screen: AdminScreenType) => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ currentScreen, onNavigate }) => {
  const { logout, user } = useAuth();

  const menuItems = [
    { id: 'overview', label: 'Platform Analytics', icon: LayoutDashboard },
    { id: 'system_monitoring', label: 'System Monitoring (102)', icon: Activity },
    { id: 'tenant_workforce', label: 'Workforce Telemetry (91.A, H)', icon: UserCheck },
    { id: 'prospect_registrations', label: 'Prospect Leads & 36 Trial (127)', icon: UserCheck },
    { id: 'commercial_plans', label: 'Commercial Plans (114.1)', icon: Layers },
    { id: 'credit_metering', label: 'Credit Metering (114.2)', icon: Sliders },
    { id: 'tenant_credit_override', label: 'Credit Overrides (114.3)', icon: Wallet },
    { id: 'financial_command_center', label: 'Financial Command (114.4)', icon: TrendingUp },
    { id: 'payment_reconciliation', label: 'Payment Recon (110)', icon: CreditCard },
    { id: 'dead_letter_queue', label: 'DLQ & Replay (109)', icon: AlertOctagon },
    { id: 'workflow_tracing', label: 'OTel Tracing & Calib', icon: Activity },
    { id: 'memory_management', label: 'Memory & Decay (17.2)', icon: Database },
    { id: 'tenants', label: 'Tenant Management', icon: Building2 },
    { id: 'llm_providers', label: 'LLM Providers (93.A)', icon: Cpu },
    { id: 'mcp_tools', label: 'MCP Tool Registry (93.B)', icon: Wrench },
    { id: 'app_registry', label: 'App Registry (93.C)', icon: Layers },
    { id: 'master_data', label: 'Master Data (91)', icon: Database },
    { id: 'skill_plugins', label: 'Skill Plugins (92.C)', icon: Puzzle },
    { id: 'usage_cost', label: 'Usage & Cost Intel', icon: TrendingUp },
    { id: 'security_audit', label: 'Security & Audit Center', icon: ShieldCheck },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen shrink-0">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800/80 flex items-center space-x-3">
        <img
          src="/logoorchestreeweb.png"
          alt="OrchestreeAI Logo"
          className="w-10 h-10 rounded-xl object-contain shadow-md shadow-emerald-950/50 shrink-0"
          referrerPolicy="no-referrer"
        />
        <div>
          <h1 className="font-bold text-white text-base leading-tight tracking-tight">OrchestreeAI</h1>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
            Super Admin
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentScreen === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id as AdminScreenType)}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User Profile & Logout */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
        <div className="flex items-center justify-between mb-3">
          <div className="truncate pr-2">
            <p className="text-xs font-semibold text-slate-200 truncate">{user?.fullName || 'Super Admin'}</p>
            <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
          </div>
          <span className="px-1.5 py-0.5 text-[9px] font-bold bg-purple-900/60 text-purple-300 border border-purple-700/60 rounded">
            MFA OK
          </span>
        </div>
        <button
          onClick={() => logout()}
          className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-xs font-semibold text-rose-400 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/40 rounded-lg transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Keluar Sesi Super Admin</span>
        </button>
      </div>
    </aside>
  );
};
