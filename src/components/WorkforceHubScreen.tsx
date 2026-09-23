import React, { useState, useEffect, useCallback } from 'react';
import {
  FeatureHubScreen,
  CategoryCard,
  EmptyState,
  ErrorState,
  SkeletonLoader,
  HubAnalyticsSkeleton
} from '@orchestree/ui';
import {
  Building2,
  Users,
  Bot,
  Layers,
  Plus,
  Trash2,
  Shield,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  ChevronRight,
  UserCheck,
  Sparkles,
  RefreshCw,
  Kanban,
  Fingerprint,
  TrendingUp
} from 'lucide-react';
import { TenantRegistrationResponse } from '../types';
import { KanbanBoardScreen } from './KanbanBoardScreen';
import { WebAuthnAttendanceScreen } from './WebAuthnAttendanceScreen';
import { HomeOverviewScreen } from './HomeOverviewScreen';
import { JobTitleReconciliationPanel } from './JobTitleReconciliationPanel';
import { AgentCreationScreen } from './AgentCreationScreen';
import { EnterpriseWorkforceHubScreen } from './EnterpriseWorkforceHubScreen';

interface WorkforceHubScreenProps {
  tenant: TenantRegistrationResponse | null;
  onBack: () => void;
}

interface DepartmentItem {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  parent_department_id: string | null;
  manager_membership_id: string | null;
  manager_name?: string | null;
  color_tag: string | null;
  active_staff_count: number;
  active_agent_count: number;
  deleted_at?: string | null;
  created_at: string;
}

interface StaffItem {
  id: string;
  tenant_id: string;
  auth_user_id: string;
  full_name: string;
  department_id: string | null;
  department_name?: string | null;
  role_code: string;
  role_description?: string | null;
  status: string;
  created_at: string;
}

interface AgentItem {
  id: string;
  tenant_id: string;
  department_id: string | null;
  department_name?: string | null;
  persona_type: string;
  job_title_id?: string | null;
  job_title_name?: string | null;
  job_title_code?: string | null;
  category_tag?: string | null;
  structural_role_name?: string | null;
  level_code?: string | null;
  subtitle_name?: string | null;
  display_name: string;
  status: string;
  created_at: string;
}

interface OrgChartData {
  tenant_id: string;
  departments: Array<{
    id: string;
    name: string;
    description: string | null;
    color_tag: string;
    manager: { id: string; full_name: string } | null;
    staff_members: Array<{ id: string; full_name: string; role_code: string }>;
    ai_agents: Array<{ id: string; display_name: string; persona_type: string; status: string }>;
    sub_departments: any[];
  }>;
  unassigned_staff: Array<{ id: string; full_name: string; role_code: string }>;
  unassigned_agents: Array<{ id: string; display_name: string; persona_type: string; status: string }>;
  total_departments: number;
  total_active_staff: number;
  total_active_agents: number;
}

export const WorkforceHubScreen: React.FC<WorkforceHubScreenProps> = ({
  tenant,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<'hub' | 'performance' | 'departments' | 'staff' | 'agents' | 'job_titles' | 'org_chart' | 'kanban' | 'attendance' | 'enterprise_command'>('hub');
  const [testRole, setTestRole] = useState<'TENANT_OWNER' | 'DEPT_MANAGER' | 'STAFF_HUMAN'>('TENANT_OWNER');

  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [staffList, setStaffList] = useState<StaffItem[]>([]);
  const [agentList, setAgentList] = useState<AgentItem[]>([]);
  const [orgChart, setOrgChart] = useState<OrgChartData | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states
  const [showDeptModal, setShowDeptModal] = useState<boolean>(false);
  const [newDeptName, setNewDeptName] = useState<string>('');
  const [newDeptDesc, setNewDeptDesc] = useState<string>('');
  const [newDeptColor, setNewDeptColor] = useState<string>('#10B981');

  const [showStaffModal, setShowStaffModal] = useState<boolean>(false);
  const [newStaffName, setNewStaffName] = useState<string>('');
  const [newStaffDeptId, setNewStaffDeptId] = useState<string>('');
  const [newStaffRole, setNewStaffRole] = useState<string>('STAFF_HUMAN');

  const [showAgentModal, setShowAgentModal] = useState<boolean>(false);
  const [newAgentName, setNewAgentName] = useState<string>('');
  const [newAgentPersona, setNewAgentPersona] = useState<string>('RESEARCHER');
  const [newAgentDeptId, setNewAgentDeptId] = useState<string>('');

  const tenantId = tenant?.tenant_id || 'tenant_default_01';

  const getHeaders = useCallback(() => {
    return {
      'Content-Type': 'application/json',
      'X-Tenant-Id': tenantId,
      'X-User-Role': testRole,
      'X-User-Id': tenant?.membership_id || 'usr_default_admin',
    };
  }, [tenantId, testRole, tenant?.membership_id]);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const headers = getHeaders();

      const [deptRes, staffRes, agentRes, orgRes] = await Promise.all([
        fetch(`/api/v1/tenants/${tenantId}/departments`, { headers }),
        fetch(`/api/v1/tenants/${tenantId}/staff`, { headers }),
        fetch(`/api/v1/tenants/${tenantId}/agents`, { headers }),
        fetch(`/api/v1/tenants/${tenantId}/org-chart`, { headers }),
      ]);

      if (deptRes.ok) {
        const dData = await deptRes.json();
        setDepartments(Array.isArray(dData) ? dData : []);
      }
      if (staffRes.ok) {
        const sData = await staffRes.json();
        setStaffList(Array.isArray(sData) ? sData : []);
      }
      if (agentRes.ok) {
        const aData = await agentRes.json();
        setAgentList(Array.isArray(aData) ? aData : []);
      }
      if (orgRes.ok) {
        const oData = await orgRes.json();
        setOrgChart(oData);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memuat data tenaga kerja.');
    } finally {
      setLoading(false);
    }
  }, [tenantId, getHeaders]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Handle Create Department
  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setConflictMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/departments`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          name: newDeptName,
          description: newDeptDesc,
          color_tag: newDeptColor,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        if (res.status === 403) {
          setErrorMsg(errJson.detail || 'Akses ditolak (403): Peran Anda tidak memiliki hak kelola departemen.');
        } else {
          setErrorMsg(errJson.error || errJson.detail || 'Gagal membuat departemen.');
        }
        return;
      }

      setNewDeptName('');
      setNewDeptDesc('');
      setShowDeptModal(false);
      setSuccessMsg('Departemen berhasil didaftarkan.');
      await loadAllData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem.');
    }
  };

  // Handle Soft-Delete Department (Guard check)
  const handleDeleteDepartment = async (deptId: string, deptName: string) => {
    setErrorMsg(null);
    setConflictMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/departments/${deptId}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ deleted: true }),
      });

      if (res.status === 409) {
        const conflictData = await res.json();
        setConflictMsg(conflictData.error || `Departemen '${deptName}' masih memiliki staf atau AI agent aktif.`);
        return;
      }

      if (!res.ok) {
        const errJson = await res.json();
        if (res.status === 403) {
          setErrorMsg(errJson.detail || 'Akses ditolak (403): Peran Anda tidak memiliki hak kelola departemen.');
        } else {
          setErrorMsg(errJson.error || errJson.detail || 'Gagal menghapus departemen.');
        }
        return;
      }

      setSuccessMsg(`Departemen '${deptName}' berhasil dihapus.`);
      await loadAllData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem.');
    }
  };

  // Handle Create Staff
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setConflictMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/staff`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          full_name: newStaffName,
          department_id: newStaffDeptId || null,
          role_code: newStaffRole,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        if (res.status === 403) {
          setErrorMsg(errJson.detail || 'Akses ditolak (403): Peran Anda tidak memiliki hak mendaftarkan staf.');
        } else {
          setErrorMsg(errJson.error || errJson.detail || 'Gagal mendaftarkan staf.');
        }
        return;
      }

      setNewStaffName('');
      setNewStaffDeptId('');
      setShowStaffModal(false);
      setSuccessMsg('Staf karyawan berhasil didaftarkan.');
      await loadAllData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem.');
    }
  };

  // Handle Create Agent
  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setConflictMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/agents`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          display_name: newAgentName,
          persona_type: newAgentPersona,
          department_id: newAgentDeptId || null,
          status: 'active',
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        if (res.status === 403) {
          setErrorMsg(errJson.detail || 'Akses ditolak (403): Peran Anda tidak memiliki hak mendaftarkan AI Agent.');
        } else {
          setErrorMsg(errJson.error || errJson.detail || 'Gagal mendaftarkan AI agent.');
        }
        return;
      }

      setNewAgentName('');
      setNewAgentDeptId('');
      setShowAgentModal(false);
      setSuccessMsg('AI Agent otonom berhasil didaftarkan ke registri.');
      await loadAllData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem.');
    }
  };

  const categoryCards: CategoryCard[] = [
    {
      key: 'enterprise_command',
      label: 'Enterprise Workforce Command Center (Chief of Staff)',
      icon: 'briefcase',
      route: 'enterprise_command',
      badgeCount: 1,
    },
    {
      key: 'performance',
      label: 'Evaluasi & Skor Kinerja Tim',
      icon: 'trending',
      route: 'performance',
    },
    {
      key: 'kanban',
      label: 'Papan Tugas Kanban Realtime',
      icon: 'kanban',
      route: 'kanban',
    },
    {
      key: 'attendance',
      label: 'Presensi Biometrik WebAuthn',
      icon: 'fingerprint',
      route: 'attendance',
    },
    {
      key: 'departments',
      label: 'Departemen Organisasi',
      icon: 'briefcase',
      route: 'departments',
      badgeCount: departments.length,
    },
    {
      key: 'staff',
      label: 'Staf Karyawan',
      icon: 'users',
      route: 'staff',
      badgeCount: staffList.length,
    },
    {
      key: 'agents',
      label: 'AI Agent Registry',
      icon: 'sparkles',
      route: 'agents',
      badgeCount: agentList.length,
    },
    {
      key: 'job_titles',
      label: 'Katalog Jabatan & Rekonsiliasi',
      icon: 'sparkles',
      route: 'job_titles',
      badgeCount: 15,
    },
    {
      key: 'org_chart',
      label: 'Struktur Bagan Organisasi',
      icon: 'layers',
      route: 'org_chart',
    },
  ];

  const analyticsSlot = (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
          <span>Departemen Terdaftar</span>
          <Briefcase className="w-4 h-4 text-emerald-500" />
        </div>
        <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
          {departments.length}
        </div>
        <span className="text-[11px] text-slate-400 mt-1 block">Struktur operasional aktif</span>
      </div>

      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
          <span>Staf Karyawan</span>
          <Users className="w-4 h-4 text-sky-500" />
        </div>
        <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
          {staffList.length}
        </div>
        <span className="text-[11px] text-slate-400 mt-1 block">Anggota terverifikasi tenant</span>
      </div>

      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
          <span>AI Agent Otonom</span>
          <Bot className="w-4 h-4 text-purple-500" />
        </div>
        <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
          {agentList.length}
        </div>
        <span className="text-[11px] text-purple-600 dark:text-purple-400 font-medium mt-1 block">Siap dieksekusi</span>
      </div>

      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
          <span>Keamanan Akses</span>
          <Shield className="w-4 h-4 text-emerald-500" />
        </div>
        <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-2 flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" />
          <span>Isolasi RLS Aktif</span>
        </div>
        <span className="text-[11px] text-slate-400 mt-1 block">Evaluasi PDP Terpadu</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1220] py-6 px-4 md:px-8">
      {/* Top Controls Header */}
      <div className="max-w-7xl mx-auto mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">
                Staf AI & Tenaga Kerja Organisasi
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold">
                Workforce Hub
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Organisasi: <span className="font-semibold text-slate-700 dark:text-slate-200">{tenant?.display_name || 'Organisasi Aktif'}</span>
            </p>
          </div>
        </div>

        {/* Role Switcher for Verification */}
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 px-2 flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-emerald-500" />
            Peran Simulasi:
          </span>
          <button
            type="button"
            onClick={() => setTestRole('TENANT_OWNER')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              testRole === 'TENANT_OWNER'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Owner
          </button>
          <button
            type="button"
            onClick={() => setTestRole('DEPT_MANAGER')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              testRole === 'DEPT_MANAGER'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Dept Manager
          </button>
          <button
            type="button"
            onClick={() => setTestRole('STAFF_HUMAN')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              testRole === 'STAFF_HUMAN'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Staff Human
          </button>
          <button
            type="button"
            onClick={loadAllData}
            title="Muat Ulang Data"
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 ml-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Notifications */}
      <div className="max-w-7xl mx-auto mb-4 space-y-2">
        {conflictMsg && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
            <div>
              <h4 className="font-semibold text-sm">Penolakan Integritas Soft-Delete (409 Conflict)</h4>
              <p className="text-xs mt-0.5">{conflictMsg}</p>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-400 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
            <div>
              <h4 className="font-semibold text-sm">Pemberitahuan Sistem</h4>
              <p className="text-xs mt-0.5">{errorMsg}</p>
            </div>
          </div>
        )}

        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-500" />
            <p className="text-xs font-medium">{successMsg}</p>
          </div>
        )}
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('hub')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'hub'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Ringkasan Modul
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('performance')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'performance'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Evaluasi & Skor Kinerja</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('kanban')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'kanban'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Kanban className="w-3.5 h-3.5" />
            <span>Papan Tugas Kanban</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('attendance')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'attendance'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Fingerprint className="w-3.5 h-3.5" />
            <span>Presensi WebAuthn</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('departments')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'departments'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>Departemen ({departments.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('staff')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'staff'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Staf ({staffList.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('agents')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'agents'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>AI Agent Registry ({agentList.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('job_titles')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'job_titles'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Katalog Jabatan Resmi (15)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('org_chart')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'org_chart'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Bagan Organisasi</span>
          </button>
        </div>
      </div>

      {/* Content Rendering based on Tab */}
      <div className="max-w-7xl mx-auto">
        {loading ? (
          <div className="p-8">
            <HubAnalyticsSkeleton />
          </div>
        ) : activeTab === 'hub' ? (
          <FeatureHubScreen
            domain="Tenaga Kerja & Struktur Organisasi"
            analyticsSlot={analyticsSlot}
            categoryCards={categoryCards}
            onNavigate={(route) => {
              setActiveTab(route as any);
            }}
          />
        ) : activeTab === 'enterprise_command' ? (
          <EnterpriseWorkforceHubScreen
            tenant={tenant}
            onBack={() => setActiveTab('hub')}
            isEnterpriseTier={true}
          />
        ) : activeTab === 'performance' ? (
          <HomeOverviewScreen
            tenant={tenant}
            onNavigateDetail={(target) => {
              if (target === 'kanban') setActiveTab('kanban');
              else if (target === 'staff') setActiveTab('staff');
            }}
          />
        ) : activeTab === 'departments' ? (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Daftar Departemen Organisasi
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Kelola hierarki divisi kerja dan delegasi wewenang manajerial.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeptModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Departemen</span>
              </button>
            </div>

            {/* Modal Tambah Departemen */}
            {showDeptModal && (
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg mb-6">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-4">
                  Formulir Departemen Baru
                </h3>
                <form onSubmit={handleCreateDepartment} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Nama Departemen *
                      </label>
                      <input
                        type="text"
                        required
                        value={newDeptName}
                        onChange={(e) => setNewDeptName(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Warna Identifikasi Visual
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={newDeptColor}
                          onChange={(e) => setNewDeptColor(e.target.value)}
                          className="w-9 h-9 rounded-lg border border-slate-300 cursor-pointer p-0.5 bg-transparent"
                        />
                        <span className="text-xs font-mono text-slate-600 dark:text-slate-400">{newDeptColor}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Deskripsi Operasional (Opsional)
                    </label>
                    <textarea
                      rows={2}
                      value={newDeptDesc}
                      onChange={(e) => setNewDeptDesc(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowDeptModal(false)}
                      className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm"
                    >
                      Simpan Departemen
                    </button>
                  </div>
                </form>
              </div>
            )}

            {departments.length === 0 ? (
              <EmptyState
                id="empty-state-departments"
                title="Belum Ada Departemen Terdaftar"
                description="Organisasi Anda belum memiliki departemen kerja. Silakan buat departemen pertama untuk mengelompokkan staf dan AI agent."
                actionLabel="Tambah Departemen Pertama"
                onAction={() => setShowDeptModal(true)}
                icon={Briefcase}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {departments.map((dept) => (
                  <div
                    key={dept.id}
                    className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3.5 h-3.5 rounded-full"
                            style={{ backgroundColor: dept.color_tag || '#10B981' }}
                          />
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                            {dept.name}
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteDepartment(dept.id, dept.name)}
                          title="Hapus Departemen (Soft Delete)"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 line-clamp-2">
                        {dept.description || 'Tidak ada deskripsi departemen.'}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-sky-500" />
                          <strong className="text-slate-900 dark:text-white">{dept.active_staff_count}</strong> staf
                        </span>
                        <span className="flex items-center gap-1">
                          <Bot className="w-3.5 h-3.5 text-purple-500" />
                          <strong className="text-slate-900 dark:text-white">{dept.active_agent_count}</strong> agent
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {dept.id.substring(0, 8)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'staff' ? (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Daftar Staf Karyawan Organisasi
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Data anggota karyawan, penetapan departemen, dan peran hak akses.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowStaffModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Daftarkan Staf Baru</span>
              </button>
            </div>

            {/* Modal Tambah Staf */}
            {showStaffModal && (
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg mb-6">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-4">
                  Pendaftaran Anggota Staf
                </h3>
                <form onSubmit={handleCreateStaff} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Nama Lengkap Staf *
                      </label>
                      <input
                        type="text"
                        required
                        value={newStaffName}
                        onChange={(e) => setNewStaffName(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Penempatan Departemen
                      </label>
                      <select
                        value={newStaffDeptId}
                        onChange={(e) => setNewStaffDeptId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                      >
                        <option value="">-- Tanpa Departemen (Unassigned) --</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Peran Hak Akses
                      </label>
                      <select
                        value={newStaffRole}
                        onChange={(e) => setNewStaffRole(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-sky-500 outline-none"
                      >
                        <option value="STAFF_HUMAN">STAFF_HUMAN (Staf Karyawan)</option>
                        <option value="DEPT_MANAGER">DEPT_MANAGER (Manajer Departemen)</option>
                        <option value="TENANT_ADMIN">TENANT_ADMIN (Administrator)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowStaffModal(false)}
                      className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm"
                    >
                      Simpan Staf
                    </button>
                  </div>
                </form>
              </div>
            )}

            {staffList.length === 0 ? (
              <EmptyState
                id="empty-state-staff"
                title="Belum Ada Staf Karyawan"
                description="Belum ada anggota staf yang terdaftar di tenant ini. Daftarkan anggota staf baru untuk memperkuat tim Anda."
                actionLabel="Daftarkan Staf Pertama"
                onAction={() => setShowStaffModal(true)}
                icon={Users}
              />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Nama Lengkap</th>
                      <th className="py-3 px-4">Departemen</th>
                      <th className="py-3 px-4">Peran (Role)</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Tanggal Bergabung</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {staffList.map((staff) => (
                      <tr key={staff.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                          {staff.full_name}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                          {staff.department_name ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                              <Briefcase className="w-3 h-3" />
                              {staff.department_name}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Belum Ditempatkan</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 font-mono font-medium">
                            <UserCheck className="w-3 h-3" />
                            {staff.role_code}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {staff.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-slate-500 font-mono text-[11px]">
                          {staff.created_at ? new Date(staff.created_at).toLocaleDateString('id-ID') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : activeTab === 'agents' ? (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    AI Agent Registry
                  </h2>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-medium">
                    Autonomous Workforce
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Registri resmi pekerja kecerdasan buatan otonom dengan isolasi tenant RLS.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('job_titles')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 border border-emerald-600/20 text-xs font-semibold transition-colors"
                >
                  <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Katalog & Rekonsiliasi Jabatan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAgentModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition-colors shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Daftarkan AI Agent</span>
                </button>
              </div>
            </div>

            {/* Modal Tambah Agent (3 Langkah Terstandarisasi) */}
            {showAgentModal && (
              <div className="mb-6">
                <AgentCreationScreen
                  tenantId={tenantId}
                  userRole={testRole}
                  onSuccess={async (newAgent) => {
                    setShowAgentModal(false);
                    setSuccessMsg(`Staf AI '${newAgent.display_name}' berhasil didaftarkan dengan jabatan '${newAgent.job_title_name || 'Katalog Resmi'}'.`);
                    await loadAllData();
                  }}
                  onCancel={() => setShowAgentModal(false)}
                />
              </div>
            )}

            {agentList.length === 0 ? (
              <EmptyState
                id="empty-state-agents"
                title="Belum Ada AI Agent Bertugas"
                description="Registri agen AI organisasi Anda masih kosong. Daftarkan pekerja kecerdasan buatan otonom untuk mulai mengeksekusi otomatisasi."
                actionLabel="Daftarkan AI Agent Pertama"
                onAction={() => setShowAgentModal(true)}
                icon={Bot}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {agentList.map((agent) => (
                  <div
                    key={agent.id}
                    className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
                            <Bot className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                              {agent.display_name}
                            </h3>
                            <span className="text-[11px] font-mono text-purple-600 dark:text-purple-400">
                              {agent.persona_type}
                            </span>
                          </div>
                        </div>

                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          {agent.status}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 mt-2">
                        <div className="flex items-center justify-between">
                          <span>Departemen:</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {agent.department_name || 'Lintas Departemen'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Jabatan Resmi:</span>
                          {agent.job_title_name ? (
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <Sparkles className="w-3 h-3 shrink-0" />
                              <span className="truncate max-w-[130px]">{agent.job_title_name}</span>
                              <span className="text-[10px] px-1 rounded bg-emerald-100 dark:bg-emerald-950/60">{agent.level_code}</span>
                            </span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400 text-[11px] font-medium flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              Shadow Mapping Pending
                            </span>
                          )}
                        </div>
                        {agent.subtitle_name && (
                          <div className="flex items-center justify-between">
                            <span>Spesialisasi:</span>
                            <span className="text-purple-600 dark:text-purple-400 font-medium truncate max-w-[150px]">
                              {agent.subtitle_name}
                            </span>
                          </div>
                        )}
                        {agent.structural_role_name && (
                          <div className="flex items-center justify-between">
                            <span>Peran Hierarki:</span>
                            <span className="text-slate-600 dark:text-slate-400 truncate max-w-[150px]">
                              {agent.structural_role_name}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 mt-4 flex items-center justify-between text-[11px] text-slate-400">
                      <span>ID: {agent.id.substring(0, 8)}...</span>
                      <span className="font-mono">{new Date(agent.created_at).toLocaleDateString('id-ID')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'org_chart' ? (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Bagan Struktur Organisasi (Org Chart)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Visualisasi terpadu relasi departemen, staf manajerial, staf operasional, dan pekerja AI otonom.
                </p>
              </div>
            </div>

            {!orgChart || (orgChart.departments.length === 0 && orgChart.unassigned_staff.length === 0 && orgChart.unassigned_agents.length === 0) ? (
              <EmptyState
                id="empty-state-org-chart"
                title="Bagan Struktur Masih Kosong"
                description="Tambahkan departemen dan daftarkan anggota staf serta AI agent untuk melihat pohon struktur organisasi secara otomatis."
                actionLabel="Mulai dengan Tambah Departemen"
                onAction={() => {
                  setActiveTab('departments');
                  setShowDeptModal(true);
                }}
                icon={Layers}
              />
            ) : (
              <div className="space-y-6">
                {/* Departments Tree Rendering */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {orgChart.departments.map((dept) => (
                    <div
                      key={dept.id}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden"
                    >
                      {/* Department Header Banner */}
                      <div
                        className="px-5 py-3.5 flex items-center justify-between"
                        style={{
                          backgroundColor: `${dept.color_tag}15`,
                          borderBottom: `2px solid ${dept.color_tag}`,
                        }}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: dept.color_tag }}
                          />
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                            {dept.name}
                          </h3>
                        </div>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/60 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border border-slate-200/50 dark:border-slate-700">
                          {dept.staff_members.length + dept.ai_agents.length} Anggota
                        </span>
                      </div>

                      <div className="p-5 space-y-4">
                        {/* Manager Node */}
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                            Pimpinan / Manajer Departemen
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center font-bold text-xs">
                              M
                            </div>
                            <span className="text-xs font-semibold text-slate-900 dark:text-white">
                              {dept.manager?.full_name || 'Belum Ditunjuk'}
                            </span>
                          </div>
                        </div>

                        {/* Staf Karyawan Section */}
                        <div>
                          <span className="text-[11px] font-semibold text-slate-500 block mb-2 flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-sky-500" />
                            Staf Karyawan ({dept.staff_members.length})
                          </span>
                          {dept.staff_members.length === 0 ? (
                            <p className="text-[11px] text-slate-400 italic">Belum ada staf terikat.</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {dept.staff_members.map((s) => (
                                <span
                                  key={s.id}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60 text-xs"
                                >
                                  <UserCheck className="w-3 h-3 text-sky-500" />
                                  <span>{s.full_name}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* AI Agent Section */}
                        <div>
                          <span className="text-[11px] font-semibold text-slate-500 block mb-2 flex items-center gap-1.5">
                            <Bot className="w-3.5 h-3.5 text-purple-500" />
                            AI Agent Otonom ({dept.ai_agents.length})
                          </span>
                          {dept.ai_agents.length === 0 ? (
                            <p className="text-[11px] text-slate-400 italic">Belum ada AI agent bertugas di divisi ini.</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {dept.ai_agents.map((a) => (
                                <span
                                  key={a.id}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 text-xs font-medium"
                                >
                                  <Sparkles className="w-3 h-3 text-purple-500" />
                                  <span>{a.display_name}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Sub-Departments */}
                        {dept.sub_departments && dept.sub_departments.length > 0 && (
                          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                              Sub-Departemen Terikat
                            </span>
                            <div className="space-y-2 pl-3 border-l-2 border-slate-200 dark:border-slate-700">
                              {dept.sub_departments.map((sub: any) => (
                                <div key={sub.id} className="text-xs font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                  <ChevronRight className="w-3 h-3 text-slate-400" />
                                  <span>{sub.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Unassigned section if any */}
                {(orgChart.unassigned_staff.length > 0 || orgChart.unassigned_agents.length > 0) && (
                  <div className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/20">
                    <h3 className="font-bold text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-3 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      Tenaga Kerja Belum Ditempatkan ke Departemen
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {orgChart.unassigned_staff.map((s) => (
                        <span key={s.id} className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300">
                          {s.full_name} (Staf)
                        </span>
                      ))}
                      {orgChart.unassigned_agents.map((a) => (
                        <span key={a.id} className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-purple-600 dark:text-purple-400">
                          {a.display_name} (AI Agent)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : activeTab === 'job_titles' ? (
          <JobTitleReconciliationPanel
            tenantId={tenantId}
            userRole={testRole}
            onRefreshParent={loadAllData}
          />
        ) : activeTab === 'kanban' ? (
          <KanbanBoardScreen
            tenantId={tenantId}
            currentUserId={tenant?.membership_id || 'usr_default_admin'}
            onBack={() => setActiveTab('hub')}
          />
        ) : activeTab === 'attendance' ? (
          <WebAuthnAttendanceScreen
            tenantId={tenantId}
            membershipId={tenant?.membership_id || 'usr_default_admin'}
            userName={tenant?.owner_full_name || 'Anggota Organisasi'}
            onBack={() => setActiveTab('hub')}
          />
        ) : null}
      </div>
    </div>
  );
};
