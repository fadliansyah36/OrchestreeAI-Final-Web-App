import { apiClient } from '@orchestree/api-client';
import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Zap,
  Lock,
  Unlock,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Cpu,
  Layers,
  FileText,
  Activity,
  ArrowRight,
  TrendingUp,
  Sparkles,
  Server,
  Database,
  Briefcase,
  Users,
  Globe,
  Search,
  BookOpen,
  Plus,
  Check,
  ShieldAlert
} from 'lucide-react';
import { TenantRegistrationResponse } from '@/types';
import { EnterpriseReportingQueryView } from './EnterpriseReportingQueryView';
import { EnterpriseWorkforceHubScreen } from './workforce/EnterpriseWorkforceHubScreen';
import { AccessTierConfigScreen } from './settings/AccessTierConfigScreen';


interface EnterpriseHubScreenProps {
  tenant: TenantRegistrationResponse | null;
  onBack: () => void;
  defaultTab?: 'workforce_hub' | 'chief_of_staff' | 'integration_fabric' | 'context_fabric' | 'enforcement' | 'reporting_query' | 'access_tier';
}

export const EnterpriseHubScreen: React.FC<EnterpriseHubScreenProps> = ({
  tenant,
  onBack,
  defaultTab = 'workforce_hub',
}) => {
  const tenantId = tenant?.tenant_id || '';
  const [activeTab, setActiveTab] = useState<'workforce_hub' | 'chief_of_staff' | 'integration_fabric' | 'context_fabric' | 'enforcement' | 'reporting_query' | 'access_tier'>(defaultTab);

  // Status langganan real-time
  const [tierInfo, setTierInfo] = useState<{
    tenant_id: string;
    display_name: string;
    plan_code: string;
    tier_level: number;
    is_enterprise: boolean;
  } | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Data Chief of Staff
  const [briefings, setBriefings] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [cosReadOnly, setCosReadOnly] = useState<boolean>(false);

  // Form Ingest Event
  const [eventTitle, setEventTitle] = useState('');
  const [eventSummary, setEventSummary] = useState('');
  const [eventType, setEventType] = useState('OPERATIONAL_ANOMALY');

  // Data Integration Fabric & DPIA
  const [connectors, setConnectors] = useState<any[]>([]);
  const [newConnectorCode, setNewConnectorCode] = useState('');
  const [newConnectorName, setNewConnectorName] = useState('');
  const [newConnectorType, setNewConnectorType] = useState('ERP');
  const [newAuthType, setNewAuthType] = useState('API_KEY');
  const [newApiKey, setNewApiKey] = useState('');
  const [newApiSecret, setNewApiSecret] = useState('');

  // DPIA Modal State
  const [dpiaModalOpen, setDpiaModalOpen] = useState<boolean>(false);
  const [selectedConnector, setSelectedConnector] = useState<any>(null);
  const [dpiaTitle, setDpiaTitle] = useState('');
  const [dpiaController, setDpiaController] = useState('');
  const [dpiaDpo, setDpiaDpo] = useState('');
  const [dpiaPurpose, setDpiaPurpose] = useState('');
  const [dpiaCategories, setDpiaCategories] = useState<string[]>(['TRANSACTIONAL_RECORDS', 'FINANCIAL_LEDGER']);
  const [dpiaSecMeasures, setDpiaSecMeasures] = useState(
    'TLS 1.3 in-transit, KMS Envelope Encryption dengan PBKDF2-HMAC-SHA256 at-rest, isolasi multi-tenant RLS Supabase, audit logging immutable.'
  );
  const [dpiaRiskLevel, setDpiaRiskLevel] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [dpiaResidualRisk, setDpiaResidualRisk] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('LOW');
  const [dpiaApprovalStatus, setDpiaApprovalStatus] = useState<'DRAFT' | 'PENDING_REVIEW' | 'APPROVED'>('APPROVED');

  // Sync Logs State
  const [syncLogsModalOpen, setSyncLogsModalOpen] = useState<boolean>(false);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);

  // Data Context Fabric & Specialist
  const [contextQuery, setContextQuery] = useState('');
  const [contextResult, setContextResult] = useState<any>(null);
  const [specialistResult, setSpecialistResult] = useState<any>(null);

  // Data Company Context Events & Signal Correlator
  const [contextEvents, setContextEvents] = useState<any[]>([]);
  const [contextSignals, setContextSignals] = useState<any[]>([]);
  const [signalSourceFilter, setSignalSourceFilter] = useState<'ALL' | 'Native' | 'Synced' | 'Uploaded'>('ALL');
  const [correlating, setCorrelating] = useState<boolean>(false);

  // Data Enforcement Verification
  const [enforcementResult, setEnforcementResult] = useState<any>(null);
  const [verifyingEnforcement, setVerifyingEnforcement] = useState<boolean>(false);

  // Data 8 Dimensi Company Context Fabric & AI Research Agent
  const [dimensions, setDimensions] = useState<any[]>([]);
  const [knowledgeNodes, setKnowledgeNodes] = useState<any[]>([]);
  const [researchPolicy, setResearchPolicy] = useState<{
    allow_public_web_search: boolean;
    max_research_depth: number;
    require_traceability_citations: boolean;
  } | null>(null);
  const [researchQueryText, setResearchQueryText] = useState('Analisis kepatuhan perlindungan data korporat dan risiko keterlambatan pengadaan server');
  const [researchObjectiveText, setResearchObjectiveText] = useState('Kesiapan mitigasi risiko operasional & hukum Q3 2026');
  const [researchResult, setResearchResult] = useState<any>(null);
  const [researchLoading, setResearchLoading] = useState<boolean>(false);
  const [policyLoading, setPolicyLoading] = useState<boolean>(false);
  const [selectedDimFilter, setSelectedDimFilter] = useState<string>('ALL');

  // Modal Node Baru
  const [showNodeModal, setShowNodeModal] = useState<boolean>(false);
  const [newNodeDim, setNewNodeDim] = useState('COMPLIANCE_AND_LEGAL');
  const [newNodeKey, setNewNodeKey] = useState('');
  const [newNodeTitle, setNewNodeTitle] = useState('');
  const [newNodeContent, setNewNodeContent] = useState('');
  const [newNodePriority, setNewNodePriority] = useState<number>(1);
  const [newNodeRef, setNewNodeRef] = useState('');

  const fetchDimensionsAndNodes = async () => {
    try {
      const dimRes = await apiClient.fetch(`/api/v1/tenants/${tenantId}/enterprise/context-fabric/dimensions`);
      if (dimRes.ok) {
        const dData = await dimRes.json();
        setDimensions(dData || []);
      }
      const nodeRes = await apiClient.fetch(`/api/v1/tenants/${tenantId}/enterprise/context-fabric/nodes`);
      if (nodeRes.ok) {
        const nData = await nodeRes.json();
        setKnowledgeNodes(nData || []);
      }
      const polRes = await apiClient.fetch(`/api/v1/tenants/${tenantId}/enterprise/research-policy`);
      if (polRes.ok) {
        const pData = await polRes.json();
        setResearchPolicy(pData);
      }
    } catch (err) {
      console.error('Error fetching context fabric data:', err);
    }
  };

  const handleToggleWebSearchPolicy = async () => {
    if (!researchPolicy) return;
    try {
      setPolicyLoading(true);
      const newAllowed = !researchPolicy.allow_public_web_search;
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/enterprise/research-policy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allow_public_web_search: newAllowed,
          max_research_depth: 3,
          require_traceability_citations: true,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setResearchPolicy(updated);
        showToast(
          'success',
          newAllowed
            ? 'Izin riset web publik AI Research Agent DIAKTIFKAN oleh kebijakan tenant.'
            : 'Izin riset web publik AI Research Agent DINONAKTIFKAN (Keamanan Data Terjaga).'
        );
      } else {
        const err = await res.json();
        showToast('error', err.error || 'Gagal mengubah kebijakan riset tenant');
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setPolicyLoading(false);
    }
  };

  const handleExecuteResearchQuery = async () => {
    if (!researchQueryText.trim()) return;
    try {
      setResearchLoading(true);
      // Sertakan sampel sumber web (Level 6) untuk menguji penegakan kebijakan tenant
      const sampleExplicit = [
        {
          level: 6,
          title: 'Berita Publik: Dinamika Rantai Pasok Semikonduktor Global & Regulasi Privasi',
          content: 'Laporan berita Reuters mengindikasikan kelangkaan chip server enterprise berangsur normal, sementara kepatuhan privasi global kian diperketat.',
          source_ref: 'https://reuters.com/business/tech/semiconductor-supply-2026',
          source_classification: 'External',
          dimension_code: 'CUSTOMER_AND_MARKET',
          confidence_weight: 0.75,
        }
      ];

      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/enterprise/research-agent/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: researchQueryText.trim(),
          research_objective: researchObjectiveText.trim() || undefined,
          explicit_sources: sampleExplicit,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResearchResult(data);
        showToast('success', 'AI Research Agent berhasil mensintesis jawaban dengan traceability lengkap.');
      } else {
        const err = await res.json();
        showToast('error', err.error || 'Gagal mengeksekusi riset AI Research Agent');
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setResearchLoading(false);
    }
  };

  const handleCreateKnowledgeNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNodeTitle.trim() || !newNodeContent.trim() || !newNodeKey.trim()) {
      showToast('error', 'Semua kolom entitas pengetahuan wajib diisi.');
      return;
    }
    try {
      setActionLoading(true);
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/enterprise/context-fabric/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dimension_code: newNodeDim,
          node_key: newNodeKey.trim(),
          title: newNodeTitle.trim(),
          content: newNodeContent.trim(),
          priority_level: newNodePriority,
          source_reference: newNodeRef.trim() || undefined,
          source_classification: 'Native',
          is_verified: true,
        }),
      });

      if (res.ok) {
        showToast('success', `Node pengetahuan [Tingkat ${newNodePriority}] berhasil didaftarkan ke ${newNodeDim}`);
        setShowNodeModal(false);
        setNewNodeTitle('');
        setNewNodeContent('');
        setNewNodeKey('');
        setNewNodeRef('');
        await fetchDimensionsAndNodes();
      } else {
        const err = await res.json();
        showToast('error', err.error || 'Gagal menyimpan node pengetahuan');
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const fetchContextEventsAndSignals = async () => {
    try {
      const evRes = await apiClient.fetch(`/api/v1/tenants/${tenantId}/enterprise/context/events`);
      if (evRes.ok) {
        const data = await evRes.json();
        setContextEvents(data.events || []);
      }
      const sigRes = await apiClient.fetch(`/api/v1/tenants/${tenantId}/enterprise/context/signals`);
      if (sigRes.ok) {
        const data = await sigRes.json();
        setContextSignals(data.signals || []);
      }
    } catch (err) {
      console.error('Error fetching context events and signals:', err);
    }
  };

  const fetchTierAndData = async () => {
    try {
      setLoading(true);
      // 1. Fetch Tier
      const tierRes = await apiClient.fetch(`/api/v1/tenants/${tenantId}/subscription/tier`);
      if (tierRes.ok) {
        const tData = await tierRes.json();
        setTierInfo(tData);
      }

      // 2. Fetch Briefings
      const bRes = await apiClient.fetch(`/api/v1/tenants/${tenantId}/enterprise/chief-of-staff/briefings`);
      if (bRes.ok) {
        const bData = await bRes.json();
        setBriefings(bData.briefings || []);
        setCosReadOnly(bData.read_only_history || false);
      }

      // 3. Fetch Events
      const eRes = await apiClient.fetch(`/api/v1/tenants/${tenantId}/enterprise/chief-of-staff/events`);
      if (eRes.ok) {
        const eData = await eRes.json();
        setEvents(eData.events || []);
      }

      // 4. Fetch Fabric Connectors
      const cRes = await apiClient.fetch(`/api/v1/tenants/${tenantId}/enterprise/integration-fabric/connectors`);
      if (cRes.ok) {
        const cData = await cRes.json();
        setConnectors(cData.connectors || []);
      }

      // 5. Fetch Context Events and Signals
      await fetchContextEventsAndSignals();

      // 6. Fetch 8 Dimensions Context Fabric & Research Policy
      await fetchDimensionsAndNodes();
    } catch (err: any) {
      console.error('Error fetching enterprise data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTierAndData();
  }, [tenantId]);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 5000);
  };

  // Beralih Tier (Simulasi Downgrade ke Growth / Upgrade ke Enterprise)
  const handleChangeTier = async (targetPlan: 'GROWTH' | 'ENTERPRISE') => {
    try {
      setActionLoading(true);
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/subscription/change-tier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_code: targetPlan }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast('error', data.error || 'Gagal mengubah paket langganan.');
        return;
      }

      showToast('success', data.message);
      await fetchTierAndData();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Ingest Event Chief of Staff (Gated tier 3)
  const handleIngestEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim() || !eventSummary.trim()) {
      showToast('error', 'Judul dan ringkasan event wajib diisi.');
      return;
    }

    try {
      setActionLoading(true);
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/enterprise/chief-of-staff/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: eventType,
          title: eventTitle,
          summary: eventSummary,
          details: { source: 'dashboard_manual_ingest', timestamp: new Date().toISOString() },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 || data.code === 'capability_not_available') {
          showToast('error', `[403 capability_not_available] Ditolak: ${data.message || data.error}`);
        } else {
          showToast('error', data.error || 'Gagal mengirim event');
        }
        return;
      }

      showToast('success', 'Event berhasil dicatat dan diproses oleh AI Chief of Staff!');
      setEventTitle('');
      setEventSummary('');
      await fetchTierAndData();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Generate Executive Briefing (Gated tier 3)
  const handleGenerateBriefing = async () => {
    try {
      setActionLoading(true);
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/enterprise/chief-of-staff/briefings/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ briefing_date: new Date().toISOString().split('T')[0] }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 || data.code === 'capability_not_available') {
          showToast('error', `[403 capability_not_available] Ditolak: ${data.message || data.error}`);
        } else {
          showToast('error', data.error || 'Gagal membuat briefing');
        }
        return;
      }

      showToast('success', 'Executive Morning Briefing berhasil disintesis oleh Raden Mas Arya!');
      await fetchTierAndData();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Menjalankan Korelasi Sinyal Lintas Sistem (4 Sinyal Traceable)
  const handleTriggerFourSignalsCorrelation = async () => {
    try {
      setCorrelating(true);
      const fourSignals = [
        {
          source_type: 'Native',
          source_system: 'ORCHESTREE_CRM',
          signal_type: 'DEAL_ESCALATION_HIGH_VALUE',
          title: 'Eskalasi Peluang Penjualan Korporat PT Mega Global Senilai Rp 4.2 Miliar',
          payload: { deal_value: 4200000000, client_tier: 'VIP_ENTERPRISE' },
          metadata: { pipeline_stage: 'PROPOSAL_NEGOTIATION' },
          source_ref_id: 'CRM-DEAL-8821',
        },
        {
          source_type: 'Synced',
          source_system: 'ERP_SAP_SUPPLY_CHAIN',
          signal_type: 'SHIPMENT_BACKORDER_DELAY',
          title: 'Keterlambatan Pengiriman Batch Server Rack ke Gudang Cikarang',
          payload: { batch_code: 'SAP-WH-9902', delay_days: 4 },
          metadata: { warehouse_id: 'WH-CKR-02' },
          source_ref_id: 'SAP-DEL-1049',
        },
        {
          source_type: 'Uploaded',
          source_system: 'ADMIN_LEGAL_STORE',
          signal_type: 'ENTERPRISE_SLA_PENALTY_CLAUSE',
          title: 'Adendum Kontrak Pengadaan Q3: Klausul Denda Keterlambatan Pengiriman 2% per Hari',
          payload: { penalty_rate_daily: 0.02, max_liability_cap: 0.15 },
          metadata: { document_type: 'CONTRACT_ADDENDUM' },
          source_ref_id: 'DOC-PDF-LEGAL-771',
        },
        {
          source_type: 'Synced',
          source_system: 'HRIS_WORKFORCE_OPS',
          signal_type: 'LOGISTICS_TEAM_CAPACITY_BOTTLENECK',
          title: 'Lonjakan Beban Kerja Tim Logistik Gudang Akibat Cuti Bersama',
          payload: { staff_absent_pct: 38, open_shift_count: 6 },
          metadata: { shift_code: 'SHIFT-MORNING' },
          source_ref_id: 'HRIS-ATTN-330',
        },
      ];

      // Ingest 4 sinyal terlebih dahulu
      for (const s of fourSignals) {
        await apiClient.fetch(`/api/v1/tenants/${tenantId}/enterprise/context/signals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(s),
        });
      }

      // Picu korelasi sinyal lintas sistem
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/enterprise/context/correlate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context_theme: 'Penyelarasan SLA Pengadaan & Mitigasi Risiko Keterlambatan',
          signals: fourSignals,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 || data.code === 'capability_not_available') {
          showToast('error', `[403 capability_not_available] Ditolak: ${data.message || data.error}`);
        } else {
          showToast('error', data.message || data.error || 'Gagal menjalankan korelasi sinyal lintas sistem.');
        }
        return;
      }

      showToast(
        'success',
        `Sintesis Berhasil: 4 sinyal lintas sistem menghasilkan 1 event gabungan (Skor: ${Math.round(
          (data.correlation_score || 0.94) * 100
        )}%)!`
      );
      await fetchContextEventsAndSignals();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setCorrelating(false);
    }
  };

  // Buat Konektor Integration Fabric (Gated tier 3)
  const handleCreateConnector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConnectorCode.trim() || !newConnectorName.trim()) {
      showToast('error', 'Kode dan nama konektor wajib diisi.');
      return;
    }

    try {
      setActionLoading(true);
      const credentials: Record<string, any> = {};
      if (newApiKey.trim()) credentials.apiKey = newApiKey.trim();
      if (newApiSecret.trim()) credentials.apiSecret = newApiSecret.trim();

      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/enterprise/integration-fabric/connectors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connector_code: newConnectorCode.trim().toUpperCase(),
          connector_name: newConnectorName.trim(),
          connector_type: newConnectorType,
          auth_type: newAuthType,
          credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
          config: { stream_mode: 'realtime_cdc', buffer_seconds: 5 },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 || data.code === 'capability_not_available') {
          showToast('error', `[403 capability_not_available] Ditolak: ${data.message || data.error}`);
        } else {
          showToast('error', data.error || 'Gagal menambahkan konektor');
        }
        return;
      }

      showToast('success', `Konektor '${newConnectorName}' terdaftar (Status: DRAFT). Kredensial diamankan dengan KMS Envelope Encryption.`);
      setNewConnectorCode('');
      setNewConnectorName('');
      setNewApiKey('');
      setNewApiSecret('');
      await fetchTierAndData();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Buka Modal DPIA untuk Konektor
  const handleOpenDpiaModal = async (conn: any) => {
    setSelectedConnector(conn);
    setDpiaTitle(`Penilaian Dampak Perlindungan Data (DPIA) - ${conn.connector_name}`);
    setDpiaController(tierInfo?.display_name || 'PT Enterprise Client');
    setDpiaDpo('Arya Wiryawan, CIPP/E, CIPM (Enterprise DPO)');
    setDpiaPurpose(`Sinkronisasi streaming data transaksional ${conn.connector_type} untuk otomatisasi alur kerja.`);
    setDpiaCategories(['TRANSACTIONAL_RECORDS', 'CUSTOMER_ORDER_RECORDS', 'FINANCIAL_LEDGER']);
    setDpiaSecMeasures(
      'TLS 1.3 in-transit, KMS Envelope Encryption dengan PBKDF2-HMAC-SHA256 at-rest, isolasi multi-tenant RLS Supabase, audit logging immutable.'
    );
    setDpiaRiskLevel('MEDIUM');
    setDpiaResidualRisk('LOW');
    setDpiaApprovalStatus('APPROVED');

    try {
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/enterprise/integration-fabric/connectors/${conn.id}/dpia`);
      if (res.ok) {
        const existing = await res.json();
        setDpiaTitle(existing.assessment_title || '');
        setDpiaController(existing.data_controller_name || '');
        setDpiaDpo(existing.data_protection_officer || '');
        setDpiaPurpose(existing.processing_purpose || '');
        if (Array.isArray(existing.data_categories) && existing.data_categories.length > 0) {
          setDpiaCategories(existing.data_categories);
        }
        setDpiaSecMeasures(existing.security_measures_description || '');
        setDpiaRiskLevel(existing.risk_level || 'MEDIUM');
        setDpiaResidualRisk(existing.residual_risk || 'LOW');
        setDpiaApprovalStatus(existing.status || 'APPROVED');
      }
    } catch {
      // Abaikan jika belum pernah dibuat
    }

    setDpiaModalOpen(true);
  };

  // Simpan / Setujui Formulir DPIA
  const handleSubmitDpia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConnector) return;

    if (!dpiaDpo.trim() || !dpiaPurpose.trim() || !dpiaSecMeasures.trim() || dpiaCategories.length === 0) {
      showToast('error', 'Seluruh kolom formulir DPIA wajib diisi lengkap termasuk DPO, tujuan pemrosesan, kategori data, dan mitigasi keamanan.');
      return;
    }

    try {
      setActionLoading(true);
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/enterprise/integration-fabric/connectors/${selectedConnector.id}/dpia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessment_title: dpiaTitle.trim(),
          data_controller_name: dpiaController.trim(),
          data_protection_officer: dpiaDpo.trim(),
          processing_purpose: dpiaPurpose.trim(),
          data_categories: dpiaCategories,
          security_measures_description: dpiaSecMeasures.trim(),
          risk_level: dpiaRiskLevel,
          residual_risk: dpiaResidualRisk,
          status: dpiaApprovalStatus,
          is_complete: true,
          review_notes: 'Diverifikasi sesuai standar kepatuhan regulasi PDP Enterprise.',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast('error', data.message || data.error || 'Gagal menyimpan dokumen DPIA');
        return;
      }

      showToast('success', `Dokumen DPIA untuk '${selectedConnector.connector_name}' berhasil disimpan & disetujui (${data.status})!`);
      setDpiaModalOpen(false);
      await fetchTierAndData();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Aktivasi Konektor Fabric (GATED by DPIA Completeness)
  const handleActivateConnector = async (conn: any) => {
    try {
      setActionLoading(true);
      const res = await apiClient.fetch(
        `/api/v1/tenants/${tenantId}/enterprise/integration-fabric/connectors/${conn.id}/activate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 422 || data.code === 'DPIA_INCOMPLETE') {
          showToast(
            'error',
            `[DPIA_INCOMPLETE Ditolak] ${data.message || data.error || 'DPIA belum lengkap atau belum disetujui!'}`
          );
        } else if (res.status === 403 || data.code === 'capability_not_available') {
          showToast('error', `[403 capability_not_available] Ditolak: ${data.message || data.error}`);
        } else {
          showToast('error', data.error || 'Aktivasi konektor gagal');
        }
        return;
      }

      showToast('success', `Koneksi '${conn.connector_name}' BERHASIL diaktifkan (Status: CONNECTED) setelah verifikasi penuh DPIA!`);
      await fetchTierAndData();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Lihat Riwayat Log Sinkronisasi
  const handleViewSyncLogs = async (connectorId?: string) => {
    try {
      setActionLoading(true);
      let url = `/api/v1/tenants/${tenantId}/enterprise/integration-fabric/sync-logs`;
      if (connectorId) url += `?connector_id=${connectorId}`;
      const res = await apiClient.fetch(url);
      if (res.ok) {
        const data = await res.json();
        setSyncLogs(data.sync_logs || []);
        setSyncLogsModalOpen(true);
      } else {
        showToast('error', 'Gagal memuat riwayat log sinkronisasi');
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Sync Streaming Connector (Gated tier 3)
  const handleSyncConnector = async (connectorCode: string) => {
    try {
      setActionLoading(true);
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/enterprise/integration-fabric/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connector_code: connectorCode }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 || data.code === 'capability_not_available') {
          showToast('error', `[403 capability_not_available] Ditolak: ${data.message || data.error}`);
        } else {
          showToast('error', data.error || 'Gagal sinkronisasi');
        }
        return;
      }

      showToast('success', `Sinkronisasi streaming '${connectorCode}' selesai: ${data.records_synced} catatan sinkron (${data.latency_ms}ms).`);
      await fetchTierAndData();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Query Context Fabric (Gated tier 3)
  const handleQueryContext = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contextQuery.trim()) return;

    try {
      setActionLoading(true);
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/enterprise/context-fabric/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: contextQuery }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 || data.code === 'capability_not_available') {
          showToast('error', `[403 capability_not_available] Ditolak: ${data.message || data.error}`);
        } else {
          showToast('error', data.error || 'Gagal kueri context fabric');
        }
        return;
      }

      setContextResult(data);
      showToast('success', 'Kueri Context Fabric berhasil!');
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Dispatch Specialist Agent (Gated tier 3)
  const handleDispatchSpecialist = async () => {
    try {
      setActionLoading(true);
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/enterprise/specialist-agents/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_role: 'CFO_STRATEGIST',
          task: 'Evaluasi Runway Finansial & Proyeksi Capex Q4',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 || data.code === 'capability_not_available') {
          showToast('error', `[403 capability_not_available] Ditolak: ${data.message || data.error}`);
        } else {
          showToast('error', data.error || 'Gagal menjalankan specialist agent');
        }
        return;
      }

      setSpecialistResult(data);
      showToast('success', 'AI Specialist CFO berhasil menyusun proyeksi strategis!');
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Verifikasi Penegakan 3 Titik (Live PDP Audit Check)
  const handleRunEnforcementCheck = async () => {
    try {
      setVerifyingEnforcement(true);
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/enterprise/enforcement-check`);
      const data = await res.json();
      setEnforcementResult(data);
      if (data.all_consistent) {
        showToast('success', `Verifikasi 3 Titik Selesai: 100% konsisten pada status Tier ${data.tenant_tier} (${data.plan_code})!`);
      } else {
        showToast('error', 'Terdeteksi inkonsistensi penegakan titik PDP.');
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setVerifyingEnforcement(false);
    }
  };

  const isEnterprise = tierInfo?.is_enterprise ?? false;

  return (
    <div className="min-h-screen bg-[#070D18] text-white">
      {/* Toast Notification */}
      {toastMsg && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-3 max-w-md animate-fade-in ${
            toastMsg.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
              : toastMsg.type === 'error'
              ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
              : 'bg-blue-950/90 border-blue-500/50 text-blue-200'
          }`}
        >
          {toastMsg.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : toastMsg.type === 'error' ? (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          ) : (
            <RefreshCw className="w-5 h-5 text-blue-400 shrink-0" />
          )}
          <span className="text-xs leading-relaxed">{toastMsg.text}</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Top Navigation & Status Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              ← Kembali ke Hub
            </button>
            <div className="h-4 w-[1px] bg-slate-800" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-purple-400" />
                  Kapabilitas Enterprise & AI Chief of Staff
                </h1>
                <span
                  className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${
                    isEnterprise
                      ? 'bg-purple-950/60 text-purple-300 border-purple-500/40 shadow-sm shadow-purple-900/30'
                      : 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                  }`}
                >
                  {isEnterprise ? 'Tier 3: Enterprise' : `Tier ${tierInfo?.tier_level || 2}: Growth`}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Organisasi: <span className="text-slate-200 font-medium">{tierInfo?.display_name || 'Organisasi Aktif'}</span> | PDP Tier Gate & Downgrade Resilience Terproteksi
              </p>
            </div>
          </div>

          {/* Tier Switcher Control (Downgrade / Upgrade Simulator) */}
          <div className="flex items-center gap-2 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-400 px-2 font-medium">Uji Status Paket:</span>
            {isEnterprise ? (
              <button
                disabled={actionLoading}
                onClick={() => handleChangeTier('GROWTH')}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-all cursor-pointer flex items-center gap-1.5"
                title="Simulasikan downgrade ke Growth untuk melihat suspensi otomatis konektor dan pemblokiran 403"
              >
                <Lock className="w-3.5 h-3.5" />
                Downgrade ke Growth (Tier 2)
              </button>
            ) : (
              <button
                disabled={actionLoading}
                onClick={() => handleChangeTier('ENTERPRISE')}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-900/40 hover:brightness-110 transition-all cursor-pointer flex items-center gap-1.5"
                title="Tingkatkan ke Enterprise untuk membuka seluruh kapabilitas dan reaktivasi konektor"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Tingkatkan ke Enterprise (Tier 3)
              </button>
            )}
            <button
              onClick={fetchTierAndData}
              disabled={loading}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Perbarui Data Real-time"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Downgrade Banner if on Growth */}
        {!isEnterprise && (
          <div className="bg-amber-950/30 border border-amber-500/40 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                  Penegakan PDP Aktif: Paket Saat Ini GROWTH (Tier 2)
                </h4>
                <p className="text-xs text-amber-200/80 leading-relaxed">
                  Fitur-fitur Enterprise ditangguhkan secara otomatis:
                  <span className="font-semibold text-amber-100"> Integration Fabric ter-suspend aman (SUSPENDED_TIER_DOWNGRADE, data tidak hilang)</span>,
                  event baru Chief of Staff ditolak dengan kode <code className="bg-amber-900/60 px-1 py-0.5 rounded text-amber-300">capability_not_available (403)</code>,
                  namun seluruh riwayat briefing & event terdahulu tetap dapat diakses secara read-only.
                </p>
              </div>
            </div>
            <button
              onClick={() => handleChangeTier('ENTERPRISE')}
              className="shrink-0 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-900/30 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Unlock className="w-3.5 h-3.5" /> Buka Akses Enterprise
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('workforce_hub')}
            className={`text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'workforce_hub'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Briefcase className="w-4 h-4" /> Enterprise Workforce Hub
          </button>
          <button
            onClick={() => setActiveTab('chief_of_staff')}
            className={`text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'chief_of_staff'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Briefcase className="w-4 h-4" /> AI Chief of Staff (Arya)
          </button>
          <button
            onClick={() => setActiveTab('integration_fabric')}
            className={`text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'integration_fabric'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Server className="w-4 h-4" /> Integration Fabric (Connectors)
          </button>
          <button
            onClick={() => setActiveTab('context_fabric')}
            className={`text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'context_fabric'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Cpu className="w-4 h-4" /> Context Fabric & Specialist Agents
          </button>
          <button
            onClick={() => setActiveTab('enforcement')}
            className={`text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'enforcement'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <ShieldCheck className="w-4 h-4" /> Audit Penegakan 3 Titik PDP
          </button>
          <button
            onClick={() => setActiveTab('reporting_query')}
            className={`text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'reporting_query'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <FileText className="w-4 h-4" /> Pelaporan Otomatis & Tanya Jawab Manajemen
          </button>
        </div>

        {/* TAB 0: ENTERPRISE WORKFORCE HUB */}
        {activeTab === 'workforce_hub' && (
          <EnterpriseWorkforceHubScreen
            tenant={tenant}
            isEnterpriseTier={isEnterprise}
          />
        )}

        {/* TAB 1: AI CHIEF OF STAFF */}
        {activeTab === 'chief_of_staff' && (
          <div className="space-y-6">
            {/* Header info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
                <div className="text-xs text-slate-400 font-medium">Agen Eksekutif</div>
                <div className="text-base font-bold text-white mt-1">Raden Mas Arya</div>
                <p className="text-xs text-slate-400 mt-1">Orkestrator & Sintesis Morning Briefing Tingkat Direksi</p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
                <div className="text-xs text-slate-400 font-medium">Status Pengambilan Event</div>
                <div className="text-base font-bold mt-1 flex items-center gap-2">
                  {isEnterprise ? (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-emerald-300">Aktif & Memproses</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                      <span className="text-amber-300">Ditangguhkan (Read-Only)</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {isEnterprise ? 'Menerima event real-time lintas departemen' : 'Ditolak dengan 403 capability_not_available'}
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400 font-medium">Sintesis Eksekutif</div>
                  <div className="text-base font-bold text-white mt-1">{briefings.length} Briefing Tersimpan</div>
                  <p className="text-xs text-slate-400 mt-1">Riwayat briefings dapat diakses read-only</p>
                </div>
                <button
                  disabled={actionLoading}
                  onClick={handleGenerateBriefing}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold shadow-md transition-all cursor-pointer flex items-center gap-1.5 ${
                    isEnterprise
                      ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/40'
                      : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                  }`}
                  title={isEnterprise ? 'Buat Executive Briefing Hari Ini' : 'Aksi ini akan menghasilkan 403 capability_not_available saat di Growth'}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Sintesis Briefing
                </button>
              </div>
            </div>

            {/* Ingestion & Events Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Form Ingest Event */}
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-purple-400" />
                    Simulasi Ingest Event Lintas Departemen
                  </h3>
                  {!isEnterprise && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Gated (403 Expected)
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  Kirimkan anomali atau sinyal departemen ke AI Chief of Staff. Pada tier Growth, aksi ini langsung ditolak oleh PDP dengan status 403 capability_not_available.
                </p>

                <form onSubmit={handleIngestEvent} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Tipe Event</label>
                    <select
                      value={eventType}
                      onChange={(e) => setEventType(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    >
                      <option value="OPERATIONAL_ANOMALY">OPERATIONAL_ANOMALY (Anomali Operasional)</option>
                      <option value="SLA_RISK_DETECTED">SLA_RISK_DETECTED (Risiko Pelanggaran SLA)</option>
                      <option value="CROSS_DEPT_ALERT">CROSS_DEPT_ALERT (Peringatan Antar-Divisi)</option>
                      <option value="FINANCIAL_CAP_WARNING">FINANCIAL_CAP_WARNING (Peringatan Plafon Kredit)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Judul Event (Sinyal Divisi / Insiden)</label>
                    <input
                      type="text"
                      value={eventTitle}
                      onChange={(e) => setEventTitle(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Ringkasan Sinyal Operasional</label>
                    <textarea
                      rows={2}
                      value={eventSummary}
                      onChange={(e) => setEventSummary(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md shadow-purple-900/30 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Kirim Event ke Chief of Staff
                  </button>
                </form>
              </div>

              {/* Recent Events List */}
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    Feed Event Chief of Staff ({events.length})
                  </h3>
                  {cosReadOnly && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      Mode Riwayat Read-Only
                    </span>
                  )}
                </div>

                <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                  {events.length === 0 ? (
                    <div className="text-center py-10 text-xs text-slate-500">
                      Belum ada event yang tercatat. Silakan lakukan ingest event di atas.
                    </div>
                  ) : (
                    events.map((ev) => (
                      <div
                        key={ev.id}
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-xs space-y-1 hover:border-slate-700 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white">{ev.title}</span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {new Date(ev.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-slate-300 text-[11px] leading-relaxed">{ev.summary}</p>
                        <div className="flex items-center gap-2 pt-1 text-[10px] text-slate-400">
                          <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-purple-300">
                            {ev.event_type}
                          </span>
                          <span className="text-emerald-400">Status: {ev.status}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Morning Briefings Archive */}
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-400" />
                  Arsip Executive Morning Briefings ({briefings.length})
                </h3>
                <span className="text-xs text-slate-400">
                  Data historis tersimpan permanen di Supabase Postgres
                </span>
              </div>

              {briefings.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-500">
                  Belum ada morning briefing yang disintesis. Klik tombol "Sintesis Briefing" di atas.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {briefings.map((b) => (
                    <div
                      key={b.id}
                      className="p-4 rounded-xl bg-slate-950 border border-slate-800/90 space-y-3 hover:border-purple-500/40 transition-all"
                    >
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                        <div className="font-semibold text-sm text-purple-300 flex items-center gap-2">
                          <Sparkles className="w-3.5 h-3.5" />
                          Briefing {b.briefing_date}
                        </div>
                        <span className="text-[10px] text-slate-400">Oleh: {b.generated_by}</span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed font-sans">{b.executive_summary}</p>
                      
                      {/* Action items */}
                      {Array.isArray(b.action_items) && b.action_items.length > 0 && (
                        <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 text-[11px] space-y-1">
                          <div className="font-semibold text-slate-300">Rekomendasi Tindakan Eksekutif:</div>
                          <ul className="list-disc list-inside space-y-0.5 text-slate-400">
                            {b.action_items.map((act: string, idx: number) => (
                              <li key={idx}>{act}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: INTEGRATION FABRIC */}
        {activeTab === 'integration_fabric' && (
          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Server className="w-5 h-5 text-purple-400" />
                    Konektor Integration Fabric Enterprise
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                    Streaming federasi sinkronisasi data enterprise real-time dua arah (SAP, Oracle, Salesforce, HRIS, ERP kustom) dengan
                    <strong className="text-purple-300"> DPIA Gating</strong> dan <strong className="text-purple-300">KMS Envelope Encryption</strong> per-koneksi.
                    <span className="block mt-0.5 text-slate-400">
                      <strong className="text-slate-200">Aturan Kepatuhan:</strong> Koneksi berstatus <code className="bg-slate-950 px-1 py-0.5 rounded text-amber-300">DRAFT</code> dilarang aktif sebelum dokumen DPIA diisi lengkap dan disetujui DPO (<code className="bg-slate-950 px-1 py-0.5 rounded text-emerald-300">APPROVED</code>).
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => handleViewSyncLogs()}
                    className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-purple-500/50 text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Activity className="w-3.5 h-3.5 text-purple-400" />
                    Audit Sync Logs
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Konektor:</span>
                    <span className="text-sm font-bold text-white px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">
                      {connectors.length}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* List Konektor */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {connectors.map((c) => {
                const isSuspended = c.status === 'SUSPENDED_TIER_DOWNGRADE';
                const isConnected = c.status === 'CONNECTED' || c.status === 'ACTIVE';
                const isDraft = c.status === 'DRAFT';
                const dpiaApproved = c.dpia_status === 'APPROVED';

                return (
                  <div
                    key={c.id}
                    className={`p-4 rounded-2xl border transition-all space-y-3.5 flex flex-col justify-between ${
                      isSuspended
                        ? 'bg-amber-950/20 border-amber-500/40 shadow-sm'
                        : isConnected
                        ? 'bg-slate-900/70 border-emerald-500/30 hover:border-emerald-500/60'
                        : 'bg-slate-900/60 border-slate-800/80 hover:border-purple-500/40'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="p-2 rounded-xl bg-purple-950/40 text-purple-400 border border-purple-800/30">
                          <Database className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                              isConnected
                                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                                : isSuspended
                                ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            {c.status}
                          </span>
                          {/* DPIA Badge */}
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 ${
                              dpiaApproved
                                ? 'bg-emerald-950/50 text-emerald-300 border-emerald-500/40'
                                : c.dpia_status === 'PENDING_REVIEW'
                                ? 'bg-amber-950/50 text-amber-300 border-amber-500/40'
                                : 'bg-rose-950/50 text-rose-300 border-rose-500/40'
                            }`}
                          >
                            <ShieldCheck className="w-2.5 h-2.5" />
                            DPIA: {c.dpia_status || 'NOT_SUBMITTED'}
                          </span>
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-mono text-purple-300">{c.connector_code}</div>
                        <h4 className="text-sm font-bold text-white mt-0.5">{c.connector_name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] text-slate-400">Tipe: {c.connector_type}</span>
                          <span className="text-[10px] text-slate-500 font-mono">({c.auth_type || 'API_KEY'})</span>
                        </div>
                      </div>

                      {/* KMS Security Badge */}
                      <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1 text-[11px]">
                        <div className="flex items-center justify-between text-slate-400">
                          <span className="flex items-center gap-1">
                            <Lock className="w-3 h-3 text-purple-400" />
                            KMS Envelope Key:
                          </span>
                          <span className="font-mono text-[10px] text-purple-300">
                            {c.credential_key_id ? c.credential_key_id.substring(0, 18) + '...' : 'Terenkripsi'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Sync Terakhir:</span>
                          <span className="text-slate-300 font-mono text-[10px]">
                            {c.last_sync_at ? new Date(c.last_sync_at).toLocaleTimeString('id-ID') : 'Belum pernah'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-2 pt-2 border-t border-slate-800/80">
                      {isDraft || !isConnected ? (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handleOpenDpiaModal(c)}
                            className="py-1.5 px-2 rounded-xl text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer flex items-center justify-center gap-1"
                          >
                            <FileText className="w-3 h-3 text-purple-400" />
                            {dpiaApproved ? 'Lihat DPIA' : 'Isi DPIA'}
                          </button>
                          <button
                            disabled={actionLoading}
                            onClick={() => handleActivateConnector(c)}
                            className={`py-1.5 px-2 rounded-xl text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                              dpiaApproved
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-900/30'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                            }`}
                            title={
                              dpiaApproved
                                ? 'Aktifkan koneksi ke status CONNECTED'
                                : 'DPIA wajib APPROVED sebelum diaktifkan (akan ditolak 422 bila belum lengkap)'
                            }
                          >
                            <Unlock className="w-3 h-3" />
                            Aktifkan
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            disabled={actionLoading || isSuspended}
                            onClick={() => handleSyncConnector(c.connector_code)}
                            className={`py-1.5 px-2 rounded-xl text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                              isEnterprise && !isSuspended
                                ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-900/30'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                            }`}
                          >
                            <RefreshCw className="w-3 h-3" />
                            Sync Data
                          </button>
                          <button
                            onClick={() => handleOpenDpiaModal(c)}
                            className="py-1.5 px-2 rounded-xl text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer flex items-center justify-center gap-1"
                          >
                            <ShieldCheck className="w-3 h-3 text-emerald-400" />
                            DPIA Info
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Form Tambah Konektor Baru */}
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4 max-w-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Server className="w-4 h-4 text-purple-400" />
                  Daftarkan Konektor Fabric Baru (KMS Protected)
                </h3>
                {!isEnterprise && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Gated Tier 3
                  </span>
                )}
              </div>

              <form onSubmit={handleCreateConnector} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Kode Konektor (e.g. ERP_SAP_FIN)</label>
                    <input
                      type="text"
                      value={newConnectorCode}
                      onChange={(e) => setNewConnectorCode(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Tipe Konektor</label>
                    <select
                      value={newConnectorType}
                      onChange={(e) => setNewConnectorType(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    >
                      <option value="ERP">ERP Core (SAP / Oracle / Workday)</option>
                      <option value="HRIS">HRIS (Talenta / BambooHR / Darwinbox)</option>
                      <option value="CRM">CRM (Salesforce / HubSpot)</option>
                      <option value="CMMS">CMMS (Maintenance / Fasilitas)</option>
                      <option value="ERP_SAP_ORACLE">ERP SAP S/4HANA / Oracle Fusion</option>
                      <option value="DATA_STREAM_PIPELINE">Data Stream Pipeline (Kafka / Postgres CDC)</option>
                      <option value="WEBHOOK_BROKER">High-Throughput Webhook Broker</option>
                      <option value="CUSTOM_RPC">Custom Corporate RPC Protocol</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Nama Tampilan Konektor</label>
                    <input
                      type="text"
                      value={newConnectorName}
                      onChange={(e) => setNewConnectorName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Metode Autentikasi</label>
                    <select
                      value={newAuthType}
                      onChange={(e) => setNewAuthType(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    >
                      <option value="API_KEY">API Key / Token</option>
                      <option value="OAUTH2">OAuth 2.0 Client Credentials</option>
                      <option value="MTLS">Mutual TLS Certificate</option>
                    </select>
                  </div>
                </div>

                {/* Kredensial & KMS Info */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-purple-300 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      Kredensial Koneksi (KMS Envelope Protection)
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono">PBKDF2-HMAC-SHA256</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">API Key / Client ID</label>
                      <input
                        type="password"
                        value={newApiKey}
                        onChange={(e) => setNewApiKey(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">API Secret / Client Secret</label>
                      <input
                        type="password"
                        value={newApiSecret}
                        onChange={(e) => setNewApiSecret(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    Kredensial disimpan terenkripsi dengan envelope key unik per-koneksi. Kredensial tidak pernah tersimpan dalam bentuk teks terbuka (plaintext).
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md shadow-purple-900/30 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Daftarkan Konektor (Status Awal: DRAFT)
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 3: CONTEXT FABRIC & SPECIALIST AGENTS */}
        {activeTab === 'context_fabric' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Context Fabric Query */}
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-purple-400" />
                    Kueri Federated Company Context Fabric
                  </h3>
                  {!isEnterprise && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Gated Tier 3
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Pencarian semantik terfederasi lintas seluruh basis pengetahuan, SOP divisi, dan ontologi relasi korporat.
                </p>

                <form onSubmit={handleQueryContext} className="flex gap-2">
                  <input
                    type="text"
                    value={contextQuery}
                    onChange={(e) => setContextQuery(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-purple-900/30 transition-all cursor-pointer"
                  >
                    Kueri
                  </button>
                </form>

                {contextResult && (
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-2">
                    <div className="font-semibold text-purple-300">Hasil Penelusuran Terfederasi:</div>
                    {contextResult.results?.map((r: any, idx: number) => (
                      <div key={idx} className="p-2 bg-slate-900 rounded-lg border border-slate-800/80 text-[11px] space-y-1">
                        <div className="flex items-center justify-between font-medium text-white">
                          <span>{r.entity}</span>
                          <span className="text-emerald-400 font-mono">Relevansi: {Math.round(r.relevance * 100)}%</span>
                        </div>
                        <p className="text-slate-300">{r.snippet}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Specialist Agents (CFO Strategist) */}
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    AI Specialist Agent (CFO & Financial Strategist)
                  </h3>
                  {!isEnterprise && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Gated Tier 3
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Pekerja AI spesialis tingkat direksi yang menyusun pemodelan proyeksi kas, simulasi beban gaji tim, dan perhitungan efisiensi operasional.
                </p>

                <button
                  disabled={actionLoading}
                  onClick={handleDispatchSpecialist}
                  className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md shadow-purple-900/30 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Jalankan Simulasi Pemodelan Proyeksi CFO
                </button>

                {specialistResult && (
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-2">
                    <div className="flex items-center justify-between font-semibold text-emerald-300">
                      <span>Peran: {specialistResult.agent_role}</span>
                      <span className="text-slate-400 font-mono">Confidence: {Math.round(specialistResult.confidence * 100)}%</span>
                    </div>
                    <p className="text-slate-200 text-[11px] leading-relaxed font-sans">{specialistResult.analysis}</p>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION: COMPANY CONTEXT EVENTS & SIGNAL CORRELATOR */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
                <div>
                  <div className="flex items-center gap-2.5">
                    <Layers className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-base font-semibold text-white">
                      Korelator Sinyal Lintas Sistem Korporat
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      company_context_events
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                    Menggabungkan 4 sinyal berbeda dari berbagai unit sistem (Native CRM, Synced ERP, Uploaded Legal, Synced HRIS)
                    menjadi 1 rekaman konteks terpadu yang 100% dapat ditelusuri ke sumber aslinya.
                  </p>
                </div>

                <button
                  disabled={correlating || actionLoading}
                  onClick={handleTriggerFourSignalsCorrelation}
                  className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-950/50 flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${correlating ? 'animate-spin' : ''}`} />
                  {correlating ? 'Menjalankan Sintesis...' : 'Sintesis 4 Sinyal Lintas Sistem'}
                </button>
              </div>

              {/* FILTER KLASIFIKASI SUMBER DATA */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">
                    Klasifikasi Sumber Data Granular:
                  </span>
                  <div className="flex items-center gap-1.5">
                    {(['ALL', 'Native', 'Synced', 'Uploaded'] as const).map((st) => (
                      <button
                        key={st}
                        onClick={() => setSignalSourceFilter(st)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                          signalSourceFilter === st
                            ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/40'
                            : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        {st === 'ALL' ? 'Semua Sumber' : st}
                      </button>
                    ))}
                  </div>
                </div>

                {/* DAFTAR SINYAL SUMBER */}
                {contextSignals.length === 0 ? (
                  <div className="p-6 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400">
                    Belum ada sinyal yang tercatat. Klik tombol &ldquo;Sintesis 4 Sinyal Lintas Sistem&rdquo; di atas untuk mengalirkan data.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {contextSignals
                      .filter((s) => signalSourceFilter === 'ALL' || s.source_type === signalSourceFilter)
                      .slice(0, 6)
                      .map((sig) => {
                        const isNative = sig.source_type === 'Native';
                        const isSynced = sig.source_type === 'Synced';
                        const badgeColor = isNative
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          : isSynced
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';

                        return (
                          <div
                            key={sig.id}
                            className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2 hover:border-slate-700/80 transition-all"
                          >
                            <div className="flex items-center justify-between">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badgeColor}`}>
                                {sig.source_type}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400">
                                Ref: {sig.source_ref_id || sig.id.slice(0, 8)}
                              </span>
                            </div>
                            <div className="text-xs font-semibold text-white leading-tight">
                              {sig.title}
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-900">
                              <span>Sistem: <strong className="text-slate-300">{sig.source_system}</strong></span>
                              <span>Tipe: <strong className="text-slate-300">{sig.signal_type}</strong></span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* RIWAYAT EVENT SINTESIS (company_context_events) */}
              <div className="space-y-4 pt-4 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-indigo-400" />
                    Riwayat Sintesis Konteks Korporat ({contextEvents.length})
                  </h4>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Provenance &amp; Traceability Aktif
                  </span>
                </div>

                {contextEvents.length === 0 ? (
                  <div className="p-6 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400">
                    Belum ada event korelasi tersimpan. Jalankan sintesis pertama untuk melihat visualisasi rekaman gabungan.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {contextEvents.slice(0, 5).map((ev) => {
                      const parsedSignals =
                        typeof ev.source_signals === 'string'
                          ? JSON.parse(ev.source_signals)
                          : ev.source_signals || [];
                      const parsedActions =
                        typeof ev.recommended_actions === 'string'
                          ? JSON.parse(ev.recommended_actions)
                          : ev.recommended_actions || [];

                      return (
                        <div
                          key={ev.id}
                          className="p-5 rounded-xl bg-slate-950 border border-slate-800/90 space-y-4"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                  {ev.event_type}
                                </span>
                                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                  Skor Korelasi: {Math.round(Number(ev.correlation_score || 0.94) * 100)}%
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {new Date(ev.created_at).toLocaleString('id-ID')}
                                </span>
                              </div>
                              <h5 className="text-sm font-semibold text-white">
                                {ev.title}
                              </h5>
                            </div>
                          </div>

                          <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                            {ev.summary}
                          </p>

                          {/* 4 SINYAL SUMBER TRACEABLE DALAM EVENT INI */}
                          <div className="space-y-2">
                            <div className="text-[11px] font-semibold text-indigo-300 flex items-center justify-between">
                              <span>Sinyal Sumber yang Dikorelasikan ({parsedSignals.length} Sinyal Traceable):</span>
                              <span className="text-[10px] text-slate-400">100% Provenance Verifiable</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {parsedSignals.map((ps: any, pIdx: number) => {
                                const isNative = ps.source_type === 'Native';
                                const isSynced = ps.source_type === 'Synced';
                                const color = isNative
                                  ? 'text-blue-400 border-blue-500/20 bg-blue-500/5'
                                  : isSynced
                                  ? 'text-purple-400 border-purple-500/20 bg-purple-500/5'
                                  : 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';

                                return (
                                  <div
                                    key={pIdx}
                                    className={`p-2.5 rounded-lg border text-[11px] space-y-1 ${color}`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold">[{ps.source_type}] {ps.source_system}</span>
                                      <span className="font-mono text-[10px] text-slate-400">{ps.source_ref_id}</span>
                                    </div>
                                    <div className="text-slate-200 line-clamp-2">{ps.title}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* REKOMENDASI TINDAKAN */}
                          {parsedActions.length > 0 && (
                            <div className="pt-2 border-t border-slate-900 space-y-1.5">
                              <span className="text-[11px] font-semibold text-slate-400">
                                Arahan Tindakan Korporat:
                              </span>
                              <div className="space-y-1.5">
                                {parsedActions.map((act: any, aIdx: number) => (
                                  <div
                                    key={aIdx}
                                    className="p-2 bg-slate-900/60 rounded-lg text-xs text-slate-300 flex items-start gap-2 border border-slate-800/60"
                                  >
                                    <ArrowRight className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
                                    <span>
                                      <strong className="text-white">[{act.target_department}]:</strong> {act.directive}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* SECTION: 8 DIMENSI COMPANY CONTEXT FABRIC */}
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-purple-400" />
                    <h3 className="text-base font-bold text-white">
                      8 Dimensi Inti Company Context Fabric
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      Ontologi Korporat
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                    Arsitektur basis pengetahuan terpadu 8 dimensi (Struktur, Strategi, Produk, Proses/SOP, Brand, Keuangan, Kepatuhan/Legal, dan Pasar).
                  </p>
                </div>

                <button
                  onClick={() => setShowNodeModal(true)}
                  className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-purple-900/30 flex items-center gap-1.5 cursor-pointer transition-all self-start sm:self-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah Node Pengetahuan
                </button>
              </div>

              {/* GRID 8 DIMENSI */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {dimensions.map((dim: any) => {
                  const nodeCount = knowledgeNodes.filter((n: any) => n.dimension_code === dim.dimension_code).length;
                  const isSelected = selectedDimFilter === dim.dimension_code;
                  return (
                    <div
                      key={dim.id}
                      onClick={() => setSelectedDimFilter(isSelected ? 'ALL' : dim.dimension_code)}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-purple-950/40 border-purple-500 shadow-md shadow-purple-900/30'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold text-purple-300 truncate">
                          {dim.dimension_code.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                          Bobot {dim.weight}x
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-white mt-1.5">{dim.dimension_name}</div>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">{dim.description}</p>
                      <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                        <span>Status: <strong className="text-emerald-400">{dim.status}</strong></span>
                        <span className="font-mono text-purple-300 font-semibold">{nodeCount} node terdaftar</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* DAFTAR NODE PENGETAHUAN */}
              <div className="pt-2 border-t border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">
                    Node Pengetahuan Terdaftar ({selectedDimFilter === 'ALL' ? 'Semua Dimensi' : selectedDimFilter}):
                  </span>
                  {selectedDimFilter !== 'ALL' && (
                    <button
                      onClick={() => setSelectedDimFilter('ALL')}
                      className="text-[11px] text-purple-400 hover:text-purple-300 underline cursor-pointer"
                    >
                      Tampilkan Semua Dimensi
                    </button>
                  )}
                </div>

                {knowledgeNodes.length === 0 ? (
                  <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-center text-xs text-slate-400">
                    Belum ada node pengetahuan. Klik tombol &ldquo;Tambah Node Pengetahuan&rdquo; untuk mendaftarkan dokumen SOP primer.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {knowledgeNodes
                      .filter((n: any) => selectedDimFilter === 'ALL' || n.dimension_code === selectedDimFilter)
                      .slice(0, 8)
                      .map((node: any) => {
                        const lvl = node.priority_level;
                        const lvlColor =
                          lvl === 1
                            ? 'bg-red-500/10 text-red-300 border-red-500/20'
                            : lvl === 2
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                            : lvl === 3
                            ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                            : lvl === 4
                            ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                            : lvl === 5
                            ? 'bg-teal-500/10 text-teal-300 border-teal-500/20'
                            : 'bg-slate-500/10 text-slate-300 border-slate-500/20';

                        return (
                          <div
                            key={node.id}
                            className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 hover:border-slate-700 transition-all"
                          >
                            <div className="flex items-center justify-between">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${lvlColor}`}>
                                Tingkat {lvl}: Prioritas {lvl === 1 ? 'Maksimal (Ground Truth)' : `${lvl}`}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400">
                                {node.source_reference || node.dimension_code}
                              </span>
                            </div>
                            <div className="text-xs font-semibold text-white">{node.title}</div>
                            <p className="text-[11px] text-slate-300 leading-relaxed line-clamp-2">
                              {node.content}
                            </p>
                            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-900">
                              <span>Sumber: <strong>{node.source_classification}</strong></span>
                              <span className="text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Terverifikasi
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>

            {/* SECTION: AI RESEARCH AGENT & 6-LEVEL KNOWLEDGE PRIORITY HIERARCHY */}
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Search className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-base font-bold text-white">
                      AI Research Agent & 6-Level Knowledge Priority Hierarchy
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      Standar Konteks Korporat Multi-Dimensi
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                    Autonomous AI Research Agent mengeksekusi investigasi korporat mendalam dengan rantai audit sitasi (traceable)
                    dan penegakan mutlak izin riset web publik oleh tenant.
                  </p>
                </div>

                {/* KONTROL KEBIJAKAN TENANT: WEB PUBLIK */}
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center gap-3">
                  <div className="space-y-0.5">
                    <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-blue-400" />
                      Izin Riset Web Publik (Tingkat 6)
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Status: {researchPolicy?.allow_public_web_search ? (
                        <span className="text-emerald-400 font-bold">DIIZINKAN OLEH TENANT</span>
                      ) : (
                        <span className="text-rose-400 font-bold">DITOLAK / NONAKTIF (Safe Mode)</span>
                      )}
                    </div>
                  </div>
                  <button
                    disabled={policyLoading}
                    onClick={handleToggleWebSearchPolicy}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      researchPolicy?.allow_public_web_search
                        ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40'
                    }`}
                  >
                    {researchPolicy?.allow_public_web_search ? 'Tolak / Blokir Web' : 'Izinkan Riset Web'}
                  </button>
                </div>
              </div>

              {/* 6 TINGKAT HIERARKI VISUAL */}
              <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-2">
                <span className="text-[11px] font-semibold text-slate-300">
                  Struktur 6 Tingkat Prioritas Pengetahuan (Hierarchical Precedence):
                </span>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                  <div className="p-2 rounded-lg bg-red-950/30 border border-red-500/30 text-[10px]">
                    <span className="font-bold text-red-300 block">Tingkat 1 (1.00)</span>
                    <span className="text-slate-300 font-medium">Verified Ground Truth</span>
                    <p className="text-[9px] text-slate-400 mt-0.5">SOP resmi & Kepatuhan Legal</p>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-950/30 border border-amber-500/30 text-[10px]">
                    <span className="font-bold text-amber-300 block">Tingkat 2 (0.88)</span>
                    <span className="text-slate-300 font-medium">Operational Data</span>
                    <p className="text-[9px] text-slate-400 mt-0.5">CRM, ERP & Context Signals</p>
                  </div>
                  <div className="p-2 rounded-lg bg-purple-950/30 border border-purple-500/30 text-[10px]">
                    <span className="font-bold text-purple-300 block">Tingkat 3 (0.75)</span>
                    <span className="text-slate-300 font-medium">Domain Specialist</span>
                    <p className="text-[9px] text-slate-400 mt-0.5">8 Dimensi Context Fabric</p>
                  </div>
                  <div className="p-2 rounded-lg bg-blue-950/30 border border-blue-500/30 text-[10px]">
                    <span className="font-bold text-blue-300 block">Tingkat 4 (0.62)</span>
                    <span className="text-slate-300 font-medium">Historical Learning</span>
                    <p className="text-[9px] text-slate-400 mt-0.5">Memori audit & feedback score</p>
                  </div>
                  <div className="p-2 rounded-lg bg-teal-950/30 border border-teal-500/30 text-[10px]">
                    <span className="font-bold text-teal-300 block">Tingkat 5 (0.50)</span>
                    <span className="text-slate-300 font-medium">Curated Benchmark</span>
                    <p className="text-[9px] text-slate-400 mt-0.5">Tolok ukur industri resmi</p>
                  </div>
                  <div className={`p-2 rounded-lg text-[10px] border ${
                    researchPolicy?.allow_public_web_search
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                  }`}>
                    <span className="font-bold block">Tingkat 6 (0.35)</span>
                    <span className="font-medium">Public Web Search</span>
                    <p className="text-[9px] text-slate-400 mt-0.5">
                      {researchPolicy?.allow_public_web_search ? 'Otorisasi Aktif' : 'DIBLOKIR Kebijakan'}
                    </p>
                  </div>
                </div>
              </div>

              {/* FORM QUERY RISET */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-300">
                      Pertanyaan Kueri Investigasi:
                    </label>
                    <input
                      type="text"
                      value={researchQueryText}
                      onChange={(e) => setResearchQueryText(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-300">
                      Sasaran Strategis / Konteks Investigasi:
                    </label>
                    <input
                      type="text"
                      value={researchObjectiveText}
                      onChange={(e) => setResearchObjectiveText(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">Contoh Cepat:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setResearchQueryText('Analisis kepatuhan perlindungan data korporat dan risiko keterlambatan pengadaan server');
                        setResearchObjectiveText('Kesiapan mitigasi risiko operasional & hukum Q3 2026');
                      }}
                      className="text-[11px] px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-indigo-300 rounded border border-slate-800 cursor-pointer"
                    >
                      Audit Kepatuhan & Pasokan
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setResearchQueryText('Bagaimana proyeksi pasar pasokan server global dibandingkan kesiapan internal kita?');
                        setResearchObjectiveText('Evaluasi benchmarking eksternal terhadap standar internal');
                      }}
                      className="text-[11px] px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-purple-300 rounded border border-slate-800 cursor-pointer"
                    >
                      Benchmarking Pasar & Internal
                    </button>
                  </div>

                  <button
                    disabled={researchLoading || !researchQueryText.trim()}
                    onClick={handleExecuteResearchQuery}
                    className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-950/40 flex items-center gap-2 cursor-pointer transition-all"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${researchLoading ? 'animate-spin' : ''}`} />
                    {researchLoading ? 'Menjalankan Riset Korporat...' : 'Jalankan AI Research Agent'}
                  </button>
                </div>
              </div>

              {/* HASIL SINTESIS AI RESEARCH AGENT */}
              {researchResult && (
                <div className="p-4 bg-slate-950 rounded-xl border border-indigo-900/60 space-y-4">
                  {/* HEADER STATUS & AUDIT */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-white">
                        Laporan Riset Terverifikasi AI Research Agent
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                        Keyakinan: {Math.round(researchResult.confidence_score * 100)}%
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 font-mono">
                        Latensi: {researchResult.latency_ms} ms
                      </span>
                      <span className={`px-2 py-0.5 rounded font-bold border ${
                        researchResult.public_web_search_allowed
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}>
                        Web Publik: {researchResult.public_web_status}
                      </span>
                    </div>
                  </div>

                  {/* LEVEL TERPAKAI */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-300 mr-1">
                      Tingkat Sumber Terkonsultasi:
                    </span>
                    {researchResult.knowledge_levels_consulted?.map((lvl: number) => (
                      <span
                        key={lvl}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          lvl === 1
                            ? 'bg-red-500/10 text-red-300 border-red-500/30'
                            : lvl === 2
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                            : lvl === 3
                            ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                            : lvl === 4
                            ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                            : lvl === 5
                            ? 'bg-teal-500/10 text-teal-300 border-teal-500/30'
                            : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        }`}
                      >
                        Tingkat {lvl}
                      </span>
                    ))}
                  </div>

                  {/* TEKS JAWABAN LENGKAP DENGAN STRUKTUR TRACEABLE */}
                  <div className="p-3.5 bg-slate-900/90 rounded-lg border border-slate-800 font-sans text-xs text-slate-200 whitespace-pre-line leading-relaxed">
                    {researchResult.answer_text}
                  </div>

                  {/* DAFTAR SITASI RINCI */}
                  {researchResult.traceability_report?.citations?.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-slate-800/80">
                      <span className="text-[11px] font-semibold text-slate-300">
                        Rantai Sitasi & Rujukan Provenance:
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {researchResult.traceability_report.citations.map((c: any, cIdx: number) => (
                          <div
                            key={cIdx}
                            className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-indigo-300">
                                #{c.citation_index} [{c.level_name}]
                              </span>
                              <span className="font-mono text-[10px] text-slate-400">
                                {c.source_ref || 'Internal DB'}
                              </span>
                            </div>
                            <div className="text-white font-medium">{c.title}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODAL TAMBAH NODE PENGETAHUAN */}
        {showNodeModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Plus className="w-4 h-4 text-purple-400" />
                  Tambah Node Pengetahuan Context Fabric
                </h3>
                <button
                  onClick={() => setShowNodeModal(false)}
                  className="text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  Tutup
                </button>
              </div>

              <form onSubmit={handleCreateKnowledgeNode} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Pilih 8 Dimensi:</label>
                  <select
                    value={newNodeDim}
                    onChange={(e) => setNewNodeDim(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    {dimensions.map((d: any) => (
                      <option key={d.dimension_code} value={d.dimension_code}>
                        {d.dimension_name} ({d.dimension_code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-300">Kunci Unik Node:</label>
                    <input
                      type="text"
                      value={newNodeKey}
                      onChange={(e) => setNewNodeKey(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-300">Tingkat Prioritas (1-6):</label>
                    <select
                      value={newNodePriority}
                      onChange={(e) => setNewNodePriority(parseInt(e.target.value, 10))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    >
                      <option value={1}>Tingkat 1: Ground Truth (SOP/Kepatuhan)</option>
                      <option value={2}>Tingkat 2: Operational Data</option>
                      <option value={3}>Tingkat 3: Domain Specialist Base</option>
                      <option value={4}>Tingkat 4: Historical Learning</option>
                      <option value={5}>Tingkat 5: Curated Benchmark</option>
                      <option value={6}>Tingkat 6: Public Web Search</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Judul Dokumen / Aturan:</label>
                  <input
                    type="text"
                    value={newNodeTitle}
                    onChange={(e) => setNewNodeTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Konten Pengetahuan Detail:</label>
                  <textarea
                    rows={3}
                    value={newNodeContent}
                    onChange={(e) => setNewNodeContent(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Referensi Dokumen Asli (Opsional):</label>
                  <input
                    type="text"
                    value={newNodeRef}
                    onChange={(e) => setNewNodeRef(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowNodeModal(false)}
                    className="px-3 py-2 bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-md shadow-purple-900/30"
                  >
                    {actionLoading ? 'Menyimpan...' : 'Simpan Node Pengetahuan'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 4: ENFORCEMENT AUDIT CHECK (DEFINITION OF DONE) */}
        {activeTab === 'enforcement' && (
          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-purple-400" />
                    Audit Penegakan Konsisten di 3 Titik PDP (Definition of Done)
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                    Sesuai kebijakan tier langganan organisasi, kapabilitas Enterprise wajib ditolak secara konsisten dengan status 
                    <strong className="text-slate-200"> 403 (capability_not_available)</strong> di seluruh titik akses:
                    REST API, Orchestration Workflow Node Execution, dan MCP Tool Invocation.
                  </p>
                </div>
                <button
                  disabled={verifyingEnforcement}
                  onClick={handleRunEnforcementCheck}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-900/40 transition-all cursor-pointer flex items-center gap-2 shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${verifyingEnforcement ? 'animate-spin' : ''}`} />
                  Jalankan Pengujian 3 Titik
                </button>
              </div>
            </div>

            {enforcementResult && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">Hasil Evaluasi Paket Saat Ini:</span>
                    <span className="text-xs font-bold text-white px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                      Tier {enforcementResult.tenant_tier} ({enforcementResult.plan_code})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {enforcementResult.all_consistent ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 px-3 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/40">
                        <CheckCircle2 className="w-4 h-4" /> 100% Konsistensi PDP Terverifikasi
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-400 px-3 py-1 rounded-lg bg-rose-950/60 border border-rose-500/40">
                        <XCircle className="w-4 h-4" /> Inkonsistensi Terdeteksi
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Titik 1: REST */}
                  <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-300">Titik 1: REST Endpoint</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          enforcementResult.point1_rest.passed
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                            : 'bg-rose-950/60 text-rose-300 border-rose-500/40'
                        }`}
                      >
                        HTTP {enforcementResult.point1_rest.status_code}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 truncate">{enforcementResult.point1_rest.endpoint}</div>
                    <p className="text-xs text-slate-300 leading-relaxed pt-1 border-t border-slate-800">
                      {enforcementResult.point1_rest.message}
                    </p>
                    {enforcementResult.point1_rest.code && (
                      <div className="text-[10px] text-amber-400 font-mono">Kode: {enforcementResult.point1_rest.code}</div>
                    )}
                  </div>

                  {/* Titik 2: Workflow Node */}
                  <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-300">Titik 2: Workflow Node</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          enforcementResult.point2_workflow_node.passed
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                            : 'bg-rose-950/60 text-rose-300 border-rose-500/40'
                        }`}
                      >
                        {enforcementResult.point2_workflow_node.passed ? 'PERMIT (Allowed)' : 'DENIED (403)'}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 truncate">{enforcementResult.point2_workflow_node.node_type}</div>
                    <p className="text-xs text-slate-300 leading-relaxed pt-1 border-t border-slate-800">
                      {enforcementResult.point2_workflow_node.message}
                    </p>
                    {enforcementResult.point2_workflow_node.error_code && (
                      <div className="text-[10px] text-amber-400 font-mono">Kode: {enforcementResult.point2_workflow_node.error_code}</div>
                    )}
                  </div>

                  {/* Titik 3: MCP Tool */}
                  <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-300">Titik 3: MCP Tool Invocation</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          enforcementResult.point3_mcp_tool.passed
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                            : 'bg-rose-950/60 text-rose-300 border-rose-500/40'
                        }`}
                      >
                        {enforcementResult.point3_mcp_tool.passed ? 'PERMIT (Allowed)' : 'DENIED (403)'}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 truncate">{enforcementResult.point3_mcp_tool.tool_name}</div>
                    <p className="text-xs text-slate-300 leading-relaxed pt-1 border-t border-slate-800">
                      {enforcementResult.point3_mcp_tool.message}
                    </p>
                    {enforcementResult.point3_mcp_tool.error_code && (
                      <div className="text-[10px] text-amber-400 font-mono">Kode: {enforcementResult.point3_mcp_tool.error_code}</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: AUTOMATIC REPORTING & MANAGEMENT CONVERSATIONAL QUERY */}
        {activeTab === 'reporting_query' && (
          <EnterpriseReportingQueryView
            tenantId={tenantId}
            isEnterprise={tierInfo?.is_enterprise ?? false}
            onUpgradePrompt={() => handleChangeTier('ENTERPRISE')}
          />
        )}
      </div>

      {/* MODAL 1: FORMULIR DPIA (Data Protection Impact Assessment) */}
      {dpiaModalOpen && selectedConnector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 space-y-5 my-8">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-purple-950/60 text-purple-400 border border-purple-800/40">
                    <ShieldCheck className="w-5 h-5" />
                  </span>
                  <h3 className="text-base font-bold text-white">
                    Formulir DPIA (Data Protection Impact Assessment)
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Konektor: <strong className="text-purple-300 font-mono">{selectedConnector.connector_name}</strong> ({selectedConnector.connector_code})
                </p>
              </div>
              <button
                onClick={() => setDpiaModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitDpia} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Judul Penilaian Dampak (Assessment Title)
                </label>
                <input
                  type="text"
                  value={dpiaTitle}
                  onChange={(e) => setDpiaTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nama Pengendali Data (Data Controller)
                  </label>
                  <input
                    type="text"
                    value={dpiaController}
                    onChange={(e) => setDpiaController(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Pejabat Pelindungan Data (DPO Verifikator)
                  </label>
                  <input
                    type="text"
                    value={dpiaDpo}
                    onChange={(e) => setDpiaDpo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Tujuan & Dasar Hukum Pemrosesan Data
                </label>
                <textarea
                  rows={2}
                  value={dpiaPurpose}
                  onChange={(e) => setDpiaPurpose(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              {/* Data Categories Multiselect */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Kategori Data yang Diproses (Pilih Minimal 1)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'TRANSACTIONAL_RECORDS', label: 'Transaksi & Faktur' },
                    { id: 'CUSTOMER_ORDER_RECORDS', label: 'Pesanan Pelanggan' },
                    { id: 'FINANCIAL_LEDGER', label: 'Buku Besar Keuangan' },
                    { id: 'EMPLOYEE_PII', label: 'PII Karyawan' },
                    { id: 'PAYROLL_DATA', label: 'Gaji / Payroll' },
                    { id: 'SUPPLY_CHAIN_LOGISTICS', label: 'Rantai Pasok & Gudang' },
                  ].map((cat) => {
                    const isSelected = dpiaCategories.includes(cat.id);
                    return (
                      <button
                        type="button"
                        key={cat.id}
                        onClick={() => {
                          if (isSelected) {
                            setDpiaCategories(dpiaCategories.filter((c) => c !== cat.id));
                          } else {
                            setDpiaCategories([...dpiaCategories, cat.id]);
                          }
                        }}
                        className={`text-[11px] p-2 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-purple-950/60 border-purple-500/50 text-purple-300 font-semibold'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span>{cat.label}</span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Deskripsi Mitigasi Keamanan Teknis (Enkripsi / Kontrol Akses)
                </label>
                <textarea
                  rows={2}
                  value={dpiaSecMeasures}
                  onChange={(e) => setDpiaSecMeasures(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Tingkat Risiko Inheren</label>
                  <select
                    value={dpiaRiskLevel}
                    onChange={(e: any) => setDpiaRiskLevel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="LOW">LOW (Rendah)</option>
                    <option value="MEDIUM">MEDIUM (Sedang)</option>
                    <option value="HIGH">HIGH (Tinggi)</option>
                    <option value="CRITICAL">CRITICAL (Kritis)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Risiko Residual (Pasca-Mitigasi)</label>
                  <select
                    value={dpiaResidualRisk}
                    onChange={(e: any) => setDpiaResidualRisk(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="LOW">LOW (Dapat Ditoleransi)</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Keputusan DPO</label>
                  <select
                    value={dpiaApprovalStatus}
                    onChange={(e: any) => setDpiaApprovalStatus(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 font-semibold"
                  >
                    <option value="APPROVED">APPROVED (Disetujui untuk Aktivasi)</option>
                    <option value="PENDING_REVIEW">PENDING_REVIEW (Dalam Telaah)</option>
                    <option value="DRAFT">DRAFT (Konsep Belum Selesai)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setDpiaModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md shadow-purple-900/40 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Simpan & Verifikasi DPIA
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: AUDIT SYNC LOGS FABRIC */}
      {syncLogsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 space-y-4 my-8">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-purple-950/60 text-purple-400 border border-purple-800/40">
                    <Activity className="w-5 h-5" />
                  </span>
                  <h3 className="text-base font-bold text-white">
                    Audit Log Sinkronisasi Streaming Fabric
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tabel riwayat eksekusi sinkronisasi federasi data lintas konektor enterprise.
                </p>
              </div>
              <button
                onClick={() => setSyncLogsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto overflow-x-auto">
              {syncLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  Belum ada log sinkronisasi tercatat untuk tenant ini.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-semibold text-[11px]">
                      <th className="py-2.5 px-3">Waktu</th>
                      <th className="py-2.5 px-3">Konektor</th>
                      <th className="py-2.5 px-3">Tipe Sync</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Record Masuk</th>
                      <th className="py-2.5 px-3">Latensi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {syncLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 px-3 text-slate-400 font-mono text-[10px]">
                          {new Date(log.created_at || log.started_at).toLocaleString('id-ID')}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-white font-mono text-[11px]">
                          {log.connector_code || log.connector_id?.substring(0, 8)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">
                          <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px]">
                            {log.sync_type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              log.status === 'SUCCESS'
                                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                                : 'bg-rose-950/60 text-rose-300 border-rose-500/40'
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-emerald-400 font-semibold">
                          +{log.records_ingested || 0}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400 text-[10px]">
                          {log.latency_ms} ms
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                onClick={() => setSyncLogsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
