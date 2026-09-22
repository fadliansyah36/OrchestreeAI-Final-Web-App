import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function checkAll() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const tables = [
    'workflow_definitions',
    'workflow_executions',
    'workflow_node_runs',
    'workflow_nodes',
    'llm_providers',
    'llm_models',
    'mcp_tools',
    'tool_permissions',
    'tool_invocations',
    'llm_usage_logs',
    'model_routing_rules'
  ];
  for (const t of tables) {
    const res = await client.query('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position', [t]);
    console.log(t, ':', res.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));
  }
  await client.end();
}
checkAll().catch(console.error);
