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

export interface PersonaQuestionItem {
  id: string;
  question_key: string;
  question_text: string;
  question_type: 'single_choice' | 'multi_choice' | 'essay';
  options?: Array<{ value: string; label: string }> | null;
  category: string;
  display_order: number;
  is_required: boolean;
  is_active: boolean;
}

export interface PersonaSessionResponse {
  session_id: string;
  tenant_id: string;
  status: string;
  current_question_index: number;
  memory_write_pending: boolean;
  total_questions: number;
  answered_count: number;
  questions: PersonaQuestionItem[];
  responses: Record<string, any>;
  started_at: string;
  completed_at?: string | null;
}

export interface SubmitPersonaAnswerResponse {
  status: string;
  session_id: string;
  question_id: string;
  current_question_index: number;
  clarification_needed: boolean;
  clarification_question?: string | null;
  answered_count: number;
  total_questions: number;
}

export interface CompletePersonaSessionResponse {
  status: string;
  session_id: string;
  tenant_id: string;
  redirect_to: string;
  memory_write_pending: boolean;
  document_id?: string | null;
  message: string;
}

export interface PaidPlanCheckoutResponse {
  invoice_id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  plan_code: string;
  plan_name: string;
  payment_gateway: string;
  payment_url: string;
  client_key?: string | null;
  status: string;
}

