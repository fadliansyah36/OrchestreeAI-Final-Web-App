/**
 * OpenAPI 3.1 & Domain Contracts for OrchestreeAI (PRD v2.2)
 */

export interface LiveHealthResponse {
  status: 'alive';
  timestamp: string;
  uptime_seconds: number;
}

export interface ReadyHealthResponse {
  status: 'ready' | 'not_ready';
  database: 'connected' | 'error' | 'not_implemented_yet';
  redis: 'connected' | 'error' | 'not_implemented_yet';
  storage: 'connected' | 'error' | 'not_implemented_yet';
  timestamp: string;
}

export type StartupCheckStatus = 'passed' | 'failed' | 'not_implemented_yet';

export interface StartupGateCheckResult {
  step_number: number;
  name: string;
  status: StartupCheckStatus;
  detail: string;
}

export interface StartupHealthResponse {
  overall_passed: boolean;
  total_steps: number;
  passed_steps: number;
  failed_steps: number;
  not_implemented_steps: number;
  checks: StartupGateCheckResult[];
  timestamp: string;
}

export type AuthzDecision =
  | 'ALLOW'
  | 'DENY_RBAC'
  | 'DENY_ABAC_NO_POLICY'
  | 'DENY_ABAC_OUT_OF_SCOPE'
  | 'DENY_TIER'
  | 'DENY_DEPARTMENT_BUDGET';

export interface AuthzRequest {
  tenant_id: string;
  actor_type: 'human_user' | 'ai_agent';
  actor_id: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  requested_field?: string;
  estimated_cost_credit?: number;
}

export interface CategoryCard {
  key: string;
  label: string;
  icon: string;
  route: string;
  badgeCount?: number;
  isLocked?: boolean;
}
