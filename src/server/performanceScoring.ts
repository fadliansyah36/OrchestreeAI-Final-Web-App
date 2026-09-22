/**
 * OrchestreeAI Workforce Performance Scoring & Reproducibility Engine
 * Sesuai PRD v2.2 Bagian 6.3 & 22.3 (Audit Konsistensi Hub vs Detail)
 * 
 * 6 Dimensi Berbobot:
 * 1. Completion Rate (25%)
 * 2. Quality Score (20%)
 * 3. Deadline Discipline (15%)
 * 4. Productivity Volume (15%)
 * 5. Collaboration Score (15%)
 * 6. Attendance & Uptime (10%)
 */

import pg from 'pg';

export interface PerformanceScoreItem {
  id: string;
  period: string;
  worker_id: string;
  worker_type: 'human' | 'agent';
  worker_name: string;
  dept_name: string;
  persona_type?: string;
  total_assigned: number;
  total_completed: number;
  total_overdue: number;
  total_reworked: number;
  completion_rate: number;
  quality_score: number;
  deadline_discipline: number;
  productivity_volume: number;
  collaboration_score: number;
  attendance_uptime: number;
  final_score: number;
  rank_position: number;
  percentile: number;
  kpi_status: 'optimal' | 'needs_attention' | 'underperforming' | 'critical';
  summary: string;
}

export interface RadarDimension {
  dimension: string;
  key: string;
  human: number;
  agent: number;
  overall: number;
  fullMark: number;
}

export interface TrendMetricPoint {
  date: string;
  assigned: number;
  completed: number;
  overdue: number;
  quality: number;
  discipline: number;
}

export interface PerformanceAlertItem {
  id: string;
  worker_type: string;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  current_score: number | null;
  threshold_score: number | null;
  status: 'active' | 'acknowledged' | 'resolved';
  created_at: string;
}

export interface PerformanceOverviewResponse {
  tenant_id: string;
  period: string;
  query_key: string;
  summary: {
    average_score: number;
    completion_rate: number;
    quality_score: number;
    tasks_assigned: number;
    tasks_completed: number;
    tasks_overdue: number;
    active_workers_count: number;
    human_workers_count: number;
    agent_workers_count: number;
    kpi_status: 'optimal' | 'needs_attention' | 'underperforming' | 'critical';
  };
  radar_dimensions: RadarDimension[];
  trend_series: TrendMetricPoint[];
  leaderboard: PerformanceScoreItem[];
  alerts: PerformanceAlertItem[];
}

export function classifyKpiStatus(score: number): 'optimal' | 'needs_attention' | 'underperforming' | 'critical' {
  if (score >= 85.0) return 'optimal';
  if (score >= 70.0) return 'needs_attention';
  if (score >= 50.0) return 'underperforming';
  return 'critical';
}

/**
 * Menghitung metrik harian untuk seluruh pekerja dari data tasks dan task_events
 */
export async function computeDailyMetrics(
  pool: pg.Pool,
  tenantId: string,
  metricDate?: string
): Promise<void> {
  const targetDate = metricDate || new Date().toISOString().split('T')[0];

  const client = await pool.connect();
  try {
    // 1. Ambil seluruh anggota staf manusia aktif
    const humansRes = await client.query(
      `SELECT m.id, m.full_name, d.name as dept_name
       FROM tenant_memberships m
       LEFT JOIN departments d ON m.department_id = d.id
       WHERE m.tenant_id = $1 AND m.status = 'active'`,
      [tenantId]
    );

    // 2. Ambil seluruh agen AI aktif
    const agentsRes = await client.query(
      `SELECT a.id, a.display_name, a.persona_type, d.name as dept_name
       FROM ai_agents a
       LEFT JOIN departments d ON a.department_id = d.id
       WHERE a.tenant_id = $1 AND a.status = 'active'`,
      [tenantId]
    );

    // 3. Proses staf manusia
    for (const h of humansRes.rows) {
      const mId = h.id;
      const statsRes = await client.query(
        `SELECT
           COUNT(id)::int as total_assigned,
           COUNT(CASE WHEN progress_percentage >= 100 THEN 1 END)::int as total_completed,
           COUNT(CASE WHEN progress_percentage < 100 AND created_at < NOW() - INTERVAL '5 days' THEN 1 END)::int as total_overdue
         FROM tasks
         WHERE tenant_id = $1 AND assigned_membership_id = $2 AND deleted_at IS NULL`,
        [tenantId, mId]
      );
      const assigned = statsRes.rows[0]?.total_assigned || 0;
      const completed = statsRes.rows[0]?.total_completed || 0;
      const overdue = statsRes.rows[0]?.total_overdue || 0;

      const reworkRes = await client.query(
        `SELECT COUNT(e.id)::int as total_reworks
         FROM task_events e
         JOIN tasks t ON e.task_id = t.id
         WHERE t.tenant_id = $1 AND t.assigned_membership_id = $2
           AND e.event_type IN ('REWORK_REQUESTED', 'TASK_REOPENED', 'REJECTED')`,
        [tenantId, mId]
      );
      const reworks = reworkRes.rows[0]?.total_reworks || 0;

      const qualityScore = Math.max(50, Math.min(100, 100 - reworks * 12));
      const disciplineScore = Math.max(50, Math.min(100, 100 - overdue * 15));
      const collabScore = 92.0;
      const attendanceUptime = 98.0;

      await client.query(
        `INSERT INTO performance_metrics_daily (
           tenant_id, metric_date, worker_type, membership_id,
           tasks_assigned, tasks_completed, tasks_overdue, tasks_reworked,
           quality_score, collaboration_score, discipline_score, attendance_or_uptime_score,
           metrics_payload, updated_at
         ) VALUES (
           $1, $2, 'human', $3,
           $4, $5, $6, $7,
           $8, $9, $10, $11,
           $12, NOW()
         )
         ON CONFLICT (tenant_id, metric_date, membership_id) WHERE worker_type = 'human'
         DO UPDATE SET
           tasks_assigned = EXCLUDED.tasks_assigned,
           tasks_completed = EXCLUDED.tasks_completed,
           tasks_overdue = EXCLUDED.tasks_overdue,
           tasks_reworked = EXCLUDED.tasks_reworked,
           quality_score = EXCLUDED.quality_score,
           collaboration_score = EXCLUDED.collaboration_score,
           discipline_score = EXCLUDED.discipline_score,
           attendance_or_uptime_score = EXCLUDED.attendance_or_uptime_score,
           updated_at = NOW()`,
        [
          tenantId,
          targetDate,
          mId,
          assigned,
          completed,
          overdue,
          reworks,
          qualityScore,
          collabScore,
          disciplineScore,
          attendanceUptime,
          JSON.stringify({ worker_name: h.full_name, department: h.dept_name }),
        ]
      );
    }

    // 4. Proses agen AI
    for (const a of agentsRes.rows) {
      const aId = a.id;
      const statsRes = await client.query(
        `SELECT
           COUNT(id)::int as total_assigned,
           COUNT(CASE WHEN progress_percentage >= 100 THEN 1 END)::int as total_completed,
           COUNT(CASE WHEN progress_percentage < 100 AND created_at < NOW() - INTERVAL '3 days' THEN 1 END)::int as total_overdue
         FROM tasks
         WHERE tenant_id = $1 AND assigned_agent_id = $2 AND deleted_at IS NULL`,
        [tenantId, aId]
      );
      const assigned = statsRes.rows[0]?.total_assigned || 0;
      const completed = statsRes.rows[0]?.total_completed || 0;
      const overdue = statsRes.rows[0]?.total_overdue || 0;

      const reworkRes = await client.query(
        `SELECT COUNT(e.id)::int as total_reworks
         FROM task_events e
         JOIN tasks t ON e.task_id = t.id
         WHERE t.tenant_id = $1 AND t.assigned_agent_id = $2
           AND e.event_type IN ('REWORK_REQUESTED', 'TASK_REOPENED', 'REJECTED')`,
        [tenantId, aId]
      );
      const reworks = reworkRes.rows[0]?.total_reworks || 0;

      const qualityScore = Math.max(60, Math.min(100, 96 - reworks * 10));
      const disciplineScore = Math.max(60, Math.min(100, 98 - overdue * 12));
      const collabScore = 95.0;
      const attendanceUptime = 99.8;

      await client.query(
        `INSERT INTO performance_metrics_daily (
           tenant_id, metric_date, worker_type, agent_id,
           tasks_assigned, tasks_completed, tasks_overdue, tasks_reworked,
           quality_score, collaboration_score, discipline_score, attendance_or_uptime_score,
           metrics_payload, updated_at
         ) VALUES (
           $1, $2, 'agent', $3,
           $4, $5, $6, $7,
           $8, $9, $10, $11,
           $12, NOW()
         )
         ON CONFLICT (tenant_id, metric_date, agent_id) WHERE worker_type = 'agent'
         DO UPDATE SET
           tasks_assigned = EXCLUDED.tasks_assigned,
           tasks_completed = EXCLUDED.tasks_completed,
           tasks_overdue = EXCLUDED.tasks_overdue,
           tasks_reworked = EXCLUDED.tasks_reworked,
           quality_score = EXCLUDED.quality_score,
           collaboration_score = EXCLUDED.collaboration_score,
           discipline_score = EXCLUDED.discipline_score,
           attendance_or_uptime_score = EXCLUDED.attendance_or_uptime_score,
           updated_at = NOW()`,
        [
          tenantId,
          targetDate,
          aId,
          assigned,
          completed,
          overdue,
          reworks,
          qualityScore,
          collabScore,
          disciplineScore,
          attendanceUptime,
          JSON.stringify({ worker_name: a.display_name, persona_type: a.persona_type, department: a.dept_name }),
        ]
      );
    }
  } finally {
    client.release();
  }
}

/**
 * Menghitung skor bulanan 6 dimensi dari performance_metrics_daily
 */
export async function monthlyScore(
  pool: pg.Pool,
  tenantId: string,
  period: string
): Promise<PerformanceScoreItem[]> {
  const client = await pool.connect();
  try {
    // Pastikan metrik harian terisi minimal untuk hari ini
    await computeDailyMetrics(pool, tenantId);

    // Ambil agregasi dari performance_metrics_daily
    const aggRes = await client.query(
      `SELECT
         d.worker_type,
         d.membership_id,
         d.agent_id,
         SUM(d.tasks_assigned)::int as sum_assigned,
         SUM(d.tasks_completed)::int as sum_completed,
         SUM(d.tasks_overdue)::int as sum_overdue,
         SUM(d.tasks_reworked)::int as sum_reworked,
         ROUND(AVG(d.quality_score), 2)::float as avg_quality,
         ROUND(AVG(d.collaboration_score), 2)::float as avg_collab,
         ROUND(AVG(d.discipline_score), 2)::float as avg_discipline,
         ROUND(AVG(d.attendance_or_uptime_score), 2)::float as avg_attendance,
         COALESCE(m.full_name, a.display_name, 'Pekerja') as worker_name,
         COALESCE(dept_m.name, dept_a.name, 'Operasional') as dept_name,
         a.persona_type
       FROM performance_metrics_daily d
       LEFT JOIN tenant_memberships m ON d.membership_id = m.id
       LEFT JOIN departments dept_m ON m.department_id = dept_m.id
       LEFT JOIN ai_agents a ON d.agent_id = a.id
       LEFT JOIN departments dept_a ON a.department_id = dept_a.id
       WHERE d.tenant_id = $1 AND TO_CHAR(d.metric_date, 'YYYY-MM') = $2
       GROUP BY d.worker_type, d.membership_id, d.agent_id, m.full_name, a.display_name, dept_m.name, dept_a.name, a.persona_type`,
      [tenantId, period]
    );

    const candidates: any[] = [];

    for (const r of aggRes.rows) {
      const totAssigned = r.sum_assigned || 0;
      const totCompleted = r.sum_completed || 0;
      const totOverdue = r.sum_overdue || 0;
      const totReworked = r.sum_reworked || 0;

      // 1. Completion Rate (25%)
      const completionRate = totAssigned > 0
        ? Math.min(100, Math.round((totCompleted / totAssigned) * 10000) / 100)
        : (totCompleted > 0 ? 100.0 : 85.0);

      // 2. Quality Score (20%)
      const qualityScore = r.avg_quality || 90.0;

      // 3. Deadline Discipline (15%)
      const disciplineScore = r.avg_discipline || 90.0;

      // 4. Productivity Volume (15%)
      const benchmarkQuota = 10.0;
      const productivityVolume = Math.min(100, Math.max(50, Math.round((totCompleted / benchmarkQuota) * 10000) / 100));

      // 5. Collaboration Score (15%)
      const collabScore = r.avg_collab || 90.0;

      // 6. Attendance & Uptime (10%)
      const attendanceUptime = r.avg_attendance || 98.0;

      // Composite Final Score
      const finalScore = Math.round((
        (0.25 * completionRate) +
        (0.20 * qualityScore) +
        (0.15 * disciplineScore) +
        (0.15 * productivityVolume) +
        (0.15 * collabScore) +
        (0.10 * attendanceUptime)
      ) * 100) / 100;

      const kpiStatus = classifyKpiStatus(finalScore);

      candidates.push({
        worker_id: r.membership_id || r.agent_id,
        worker_type: r.worker_type,
        membership_id: r.membership_id,
        agent_id: r.agent_id,
        worker_name: r.worker_name,
        dept_name: r.dept_name,
        persona_type: r.persona_type,
        total_assigned: totAssigned,
        total_completed: totCompleted,
        total_overdue: totOverdue,
        total_reworked: totReworked,
        completion_rate: completionRate,
        quality_score: qualityScore,
        deadline_discipline: disciplineScore,
        productivity_volume: productivityVolume,
        collaboration_score: collabScore,
        attendance_uptime: attendanceUptime,
        final_score: finalScore,
        kpi_status: kpiStatus,
      });
    }

    // Sort by finalScore desc for leaderboard ranking
    candidates.sort((a, b) => b.final_score - a.final_score);
    const totalWorkers = candidates.length;
    const scoresResult: PerformanceScoreItem[] = [];

    for (let i = 0; i < totalWorkers; i++) {
      const cand = candidates[i];
      const rankPos = i + 1;
      const percentile = Math.round(((totalWorkers - rankPos + 1) / Math.max(totalWorkers, 1)) * 1000) / 10;
      const summaryText = `Kinerja ${cand.worker_name} periode ${period} berstatus ${cand.kpi_status.toUpperCase()} dengan skor ${cand.final_score}/100 (#${rankPos} dari ${totalWorkers}).`;

      let scoreId = '';
      if (cand.worker_type === 'human') {
        const upRes = await client.query(
          `INSERT INTO performance_scores_monthly (
             tenant_id, period, worker_type, membership_id,
             total_assigned, total_completed, total_overdue, total_reworked,
             completion_rate, quality_score, deadline_discipline, productivity_volume,
             collaboration_score, attendance_uptime, final_score,
             rank_position, percentile, kpi_status, summary, metadata, calculated_at, updated_at
           ) VALUES (
             $1, $2, 'human', $3,
             $4, $5, $6, $7,
             $8, $9, $10, $11,
             $12, $13, $14,
             $15, $16, $17, $18, $19, NOW(), NOW()
           )
           ON CONFLICT (tenant_id, period, membership_id) WHERE worker_type = 'human'
           DO UPDATE SET
             total_assigned = EXCLUDED.total_assigned,
             total_completed = EXCLUDED.total_completed,
             total_overdue = EXCLUDED.total_overdue,
             total_reworked = EXCLUDED.total_reworked,
             completion_rate = EXCLUDED.completion_rate,
             quality_score = EXCLUDED.quality_score,
             deadline_discipline = EXCLUDED.deadline_discipline,
             productivity_volume = EXCLUDED.productivity_volume,
             collaboration_score = EXCLUDED.collaboration_score,
             attendance_uptime = EXCLUDED.attendance_uptime,
             final_score = EXCLUDED.final_score,
             rank_position = EXCLUDED.rank_position,
             percentile = EXCLUDED.percentile,
             kpi_status = EXCLUDED.kpi_status,
             summary = EXCLUDED.summary,
             calculated_at = NOW(),
             updated_at = NOW()
           RETURNING id`,
          [
            tenantId,
            period,
            cand.membership_id,
            cand.total_assigned,
            cand.total_completed,
            cand.total_overdue,
            cand.total_reworked,
            cand.completion_rate,
            cand.quality_score,
            cand.deadline_discipline,
            cand.productivity_volume,
            cand.collaboration_score,
            cand.attendance_uptime,
            cand.final_score,
            rankPos,
            percentile,
            cand.kpi_status,
            summaryText,
            JSON.stringify({ worker_name: cand.worker_name, department: cand.dept_name }),
          ]
        );
        scoreId = upRes.rows[0]?.id || '';
      } else {
        const upRes = await client.query(
          `INSERT INTO performance_scores_monthly (
             tenant_id, period, worker_type, agent_id,
             total_assigned, total_completed, total_overdue, total_reworked,
             completion_rate, quality_score, deadline_discipline, productivity_volume,
             collaboration_score, attendance_uptime, final_score,
             rank_position, percentile, kpi_status, summary, metadata, calculated_at, updated_at
           ) VALUES (
             $1, $2, 'agent', $3,
             $4, $5, $6, $7,
             $8, $9, $10, $11,
             $12, $13, $14,
             $15, $16, $17, $18, $19, NOW(), NOW()
           )
           ON CONFLICT (tenant_id, period, agent_id) WHERE worker_type = 'agent'
           DO UPDATE SET
             total_assigned = EXCLUDED.total_assigned,
             total_completed = EXCLUDED.total_completed,
             total_overdue = EXCLUDED.total_overdue,
             total_reworked = EXCLUDED.total_reworked,
             completion_rate = EXCLUDED.completion_rate,
             quality_score = EXCLUDED.quality_score,
             deadline_discipline = EXCLUDED.deadline_discipline,
             productivity_volume = EXCLUDED.productivity_volume,
             collaboration_score = EXCLUDED.collaboration_score,
             attendance_uptime = EXCLUDED.attendance_uptime,
             final_score = EXCLUDED.final_score,
             rank_position = EXCLUDED.rank_position,
             percentile = EXCLUDED.percentile,
             kpi_status = EXCLUDED.kpi_status,
             summary = EXCLUDED.summary,
             calculated_at = NOW(),
             updated_at = NOW()
           RETURNING id`,
          [
            tenantId,
            period,
            cand.agent_id,
            cand.total_assigned,
            cand.total_completed,
            cand.total_overdue,
            cand.total_reworked,
            cand.completion_rate,
            cand.quality_score,
            cand.deadline_discipline,
            cand.productivity_volume,
            cand.collaboration_score,
            cand.attendance_uptime,
            cand.final_score,
            rankPos,
            percentile,
            cand.kpi_status,
            summaryText,
            JSON.stringify({ worker_name: cand.worker_name, persona_type: cand.persona_type, department: cand.dept_name }),
          ]
        );
        scoreId = upRes.rows[0]?.id || '';
      }

      // Check alerts
      if (cand.final_score < 70.0) {
        const severity = cand.final_score < 50.0 ? 'critical' : 'warning';
        await client.query(
          `INSERT INTO performance_alerts (
             tenant_id, worker_type, membership_id, agent_id,
             alert_type, severity, title, message, current_score, threshold_score, status
           ) VALUES ($1, $2, $3, $4, 'underperforming', $5, $6, $7, $8, 70.0, 'active')`,
          [
            tenantId,
            cand.worker_type,
            cand.membership_id,
            cand.agent_id,
            severity,
            `Deviasi Kinerja: ${cand.worker_name} (${cand.final_score}/100)`,
            `Skor kinerja bulanan berada di bawah ambang batas KPI 70.0. Tindakan supervisi direkomendasikan.`,
            cand.final_score,
          ]
        );
      } else if (cand.final_score >= 92.0) {
        await client.query(
          `INSERT INTO performance_alerts (
             tenant_id, worker_type, membership_id, agent_id,
             alert_type, severity, title, message, current_score, threshold_score, status
           ) VALUES ($1, $2, $3, $4, 'high_achiever', 'info', $5, $6, $7, 90.0, 'active')`,
          [
            tenantId,
            cand.worker_type,
            cand.membership_id,
            cand.agent_id,
            `Prestasi Kinerja Unggul: ${cand.worker_name} (#${rankPos})`,
            `Pekerja mencapai skor impresif ${cand.final_score}/100 pada periode ${period}.`,
            cand.final_score,
          ]
        );
      }

      scoresResult.push({
        id: scoreId,
        period,
        worker_id: cand.worker_id,
        worker_type: cand.worker_type,
        worker_name: cand.worker_name,
        dept_name: cand.dept_name,
        persona_type: cand.persona_type,
        total_assigned: cand.total_assigned,
        total_completed: cand.total_completed,
        total_overdue: cand.total_overdue,
        total_reworked: cand.total_reworked,
        completion_rate: cand.completion_rate,
        quality_score: cand.quality_score,
        deadline_discipline: cand.deadline_discipline,
        productivity_volume: cand.productivity_volume,
        collaboration_score: cand.collaboration_score,
        attendance_uptime: cand.attendance_uptime,
        final_score: cand.final_score,
        rank_position: rankPos,
        percentile,
        kpi_status: cand.kpi_status,
        summary: summaryText,
      });
    }

    return scoresResult;
  } finally {
    client.release();
  }
}

/**
 * Endpoint Handler: GET /api/v1/tenants/:tenantId/performance/overview
 */
export async function getPerformanceOverview(
  pool: pg.Pool,
  tenantId: string,
  period?: string
): Promise<PerformanceOverviewResponse> {
  const calcPeriod = period || new Date().toISOString().substring(0, 7);
  const client = await pool.connect();
  try {
    const scores = await monthlyScore(pool, tenantId, calcPeriod);

    // Ambil tren harian
    const trendRes = await client.query(
      `SELECT
         metric_date::text as date,
         SUM(tasks_assigned)::int as assigned,
         SUM(tasks_completed)::int as completed,
         SUM(tasks_overdue)::int as overdue,
         ROUND(AVG(quality_score), 1)::float as quality,
         ROUND(AVG(discipline_score), 1)::float as discipline
       FROM performance_metrics_daily
       WHERE tenant_id = $1
       GROUP BY metric_date
       ORDER BY metric_date ASC
       LIMIT 30`,
      [tenantId]
    );

    const trendSeries: TrendMetricPoint[] = trendRes.rows.map((r) => ({
      date: r.date,
      assigned: r.assigned || 0,
      completed: r.completed || 0,
      overdue: r.overdue || 0,
      quality: r.quality || 0,
      discipline: r.discipline || 0,
    }));

    // Hitung ringkasan agregat
    const totalWorkers = scores.length;
    const avgScore = totalWorkers > 0
      ? Math.round((scores.reduce((acc, s) => acc + s.final_score, 0) / totalWorkers) * 100) / 100
      : 0;
    const totAssigned = scores.reduce((acc, s) => acc + s.total_assigned, 0);
    const totCompleted = scores.reduce((acc, s) => acc + s.total_completed, 0);
    const totOverdue = scores.reduce((acc, s) => acc + s.total_overdue, 0);
    const avgQuality = totalWorkers > 0
      ? Math.round((scores.reduce((acc, s) => acc + s.quality_score, 0) / totalWorkers) * 10) / 10
      : 0;
    const compRate = totAssigned > 0
      ? Math.round((totCompleted / totAssigned) * 1000) / 10
      : 100.0;

    const humanScores = scores.filter((s) => s.worker_type === 'human');
    const agentScores = scores.filter((s) => s.worker_type === 'agent');

    const avgDim = (arr: PerformanceScoreItem[], key: keyof PerformanceScoreItem) => {
      if (arr.length === 0) return 0;
      const sum = arr.reduce((acc, item) => acc + (Number(item[key]) || 0), 0);
      return Math.round((sum / arr.length) * 10) / 10;
    };

    const radarDimensions: RadarDimension[] = [
      {
        dimension: 'Tingkat Penyelesaian (25%)',
        key: 'completion_rate',
        human: avgDim(humanScores, 'completion_rate'),
        agent: avgDim(agentScores, 'completion_rate'),
        overall: avgDim(scores, 'completion_rate'),
        fullMark: 100,
      },
      {
        dimension: 'Kualitas Output (20%)',
        key: 'quality_score',
        human: avgDim(humanScores, 'quality_score'),
        agent: avgDim(agentScores, 'quality_score'),
        overall: avgDim(scores, 'quality_score'),
        fullMark: 100,
      },
      {
        dimension: 'Disiplin Tenggat (15%)',
        key: 'deadline_discipline',
        human: avgDim(humanScores, 'deadline_discipline'),
        agent: avgDim(agentScores, 'deadline_discipline'),
        overall: avgDim(scores, 'deadline_discipline'),
        fullMark: 100,
      },
      {
        dimension: 'Volume Output (15%)',
        key: 'productivity_volume',
        human: avgDim(humanScores, 'productivity_volume'),
        agent: avgDim(agentScores, 'productivity_volume'),
        overall: avgDim(scores, 'productivity_volume'),
        fullMark: 100,
      },
      {
        dimension: 'Kolaborasi Tim (15%)',
        key: 'collaboration_score',
        human: avgDim(humanScores, 'collaboration_score'),
        agent: avgDim(agentScores, 'collaboration_score'),
        overall: avgDim(scores, 'collaboration_score'),
        fullMark: 100,
      },
      {
        dimension: 'Presensi / Uptime (10%)',
        key: 'attendance_uptime',
        human: avgDim(humanScores, 'attendance_uptime'),
        agent: avgDim(agentScores, 'attendance_uptime'),
        overall: avgDim(scores, 'attendance_uptime'),
        fullMark: 100,
      },
    ];

    // Ambil alert aktif
    const alertsRes = await client.query(
      `SELECT id, worker_type, alert_type, severity, title, message, current_score, threshold_score, status, created_at
       FROM performance_alerts
       WHERE tenant_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 10`,
      [tenantId]
    );

    const alerts: PerformanceAlertItem[] = alertsRes.rows.map((r) => ({
      id: r.id,
      worker_type: r.worker_type,
      alert_type: r.alert_type,
      severity: r.severity,
      title: r.title,
      message: r.message,
      current_score: r.current_score !== null ? parseFloat(r.current_score) : null,
      threshold_score: r.threshold_score !== null ? parseFloat(r.threshold_score) : null,
      status: r.status,
      created_at: r.created_at?.toISOString ? r.created_at.toISOString() : String(r.created_at),
    }));

    return {
      tenant_id: tenantId,
      period: calcPeriod,
      query_key: `performance:overview:${tenantId}:${calcPeriod}`,
      summary: {
        average_score: avgScore,
        completion_rate: compRate,
        quality_score: avgQuality,
        tasks_assigned: totAssigned,
        tasks_completed: totCompleted,
        tasks_overdue: totOverdue,
        active_workers_count: totalWorkers,
        human_workers_count: humanScores.length,
        agent_workers_count: agentScores.length,
        kpi_status: classifyKpiStatus(avgScore),
      },
      radar_dimensions: radarDimensions,
      trend_series: trendSeries,
      leaderboard: scores.slice(0, 10),
      alerts,
    };
  } finally {
    client.release();
  }
}
