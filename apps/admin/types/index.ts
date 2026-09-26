export interface TenantRegistrationRequest {
  legal_name: string;
  display_name: string;
  owner_auth_user_id: string;
  owner_full_name: string;
  plan_code?: string;
}

export interface TenantRegistrationResponse {
  tenant_id: string;
  legal_name: string;
  display_name: string;
  status: string;
  membership_id: string;
  role: string;
  user_id?: string;
  owner_full_name?: string;
  created_at: string;
}

export interface JoinCompanyRequest {
  company_code: string;
  full_name: string;
  email: string;
  auth_user_id: string;
  department_id?: string | null;
}

export interface JoinCompanyResponse {
  status: 'pending' | 'approved' | 'rejected';
  queue_id: string;
  tenant_id: string;
  message: string;
}

export interface CompanyCodeResponse {
  code: string;
  expires_at: string;
  max_uses: number | null;
  status: string;
  created_at: string;
}

export interface HRApprovalItem {
  id: string;
  tenant_id: string;
  requesting_auth_user_id: string;
  company_code_id: string | null;
  submitted_profile: {
    full_name?: string;
    email?: string;
    department_id?: string | null;
  };
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  rejection_reason?: string | null;
}

export interface TenantMemberItem {
  membership_id: string;
  tenant_id: string;
  auth_user_id: string;
  department_id: string | null;
  full_name: string;
  status: string;
  role: string;
  role_description: string;
  created_at: string;
}

export interface StartupGateStatus {
  status: 'ready' | 'degraded';
  database_connected: boolean;
  roles: {
    orchestree_app_nobypassrls: boolean;
    orchestree_app_nosuper: boolean;
  };
  evaluation: string;
}

export interface PlatformAnalyticsKPI {
  total_transactions: number;
  total_revenue_idr: number;
  total_repeat_orders: number;
  total_llm_cost_usd: number;
  total_credit_consumed: number;
  tenants: {
    total: number;
    active: number;
    trial: number;
  };
  total_human_staff: number;
  total_ai_agents_active: number;
}

export interface PlatformAnalyticsTimeSeriesPoint {
  date: string;
  transactions: number;
  revenue_idr: number;
  repeat_orders: number;
  llm_cost_usd: number;
  credit_consumed: number;
  total_tenants: number;
  active_tenants: number;
  trial_tenants: number;
  human_staff: number;
  ai_agents: number;
}

export interface PlatformAnalyticsOverviewResponse {
  range: string;
  start_date: string;
  end_date: string;
  kpi: PlatformAnalyticsKPI;
  sparklines: {
    transactions?: number[];
    revenue?: number[];
    tenants?: number[];
    human_staff?: number[];
    ai_agents?: number[];
    repeat_orders?: number[];
    llm_cost?: number[];
    credit_consumed?: number[];
  };
  time_series: PlatformAnalyticsTimeSeriesPoint[];
  data_points_count: number;
}

export interface TenantRankingItem {
  tenant_id: string;
  legal_name: string;
  display_name: string;
  status: string;
  plan_code: string;
  transaction_count: number;
  revenue_idr: number;
  credit_consumed: number;
  credit_available: number;
  active_ai_agent_count: number;
  active_human_staff_count: number;
  created_at: string;
}

export interface LLMUsageItem {
  name: string;
  provider?: string;
  tenant_id?: string;
  call_count: number;
  token_count: number;
  cost_usd: number;
  avg_latency_ms: number;
  percentage: number;
}

export interface LLMUsageBreakdownResponse {
  group_by: string;
  range: string;
  total_cost_usd: number;
  total_tokens: number;
  total_calls: number;
  avg_latency_ms: number;
  breakdown: LLMUsageItem[];
}

