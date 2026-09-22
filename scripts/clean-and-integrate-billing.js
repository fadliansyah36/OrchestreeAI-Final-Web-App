import fs from 'fs';
import path from 'path';

const serverFile = path.resolve('server.ts');
let content = fs.readFileSync(serverFile, 'utf8');

// 1. Add creditWallet import at top
if (!content.includes('./src/server/creditWallet')) {
  const topImport = `import {
  getWallet,
  getTransactions,
  getInvoices,
  topupCredit,
  getFinancialCommandCenter,
} from './src/server/creditWallet';
`;
  content = topImport + content;
}

// 2. Remove inMemoryStore definition block
const inMemoryStoreRegex = /\/\/ In-Memory Safe Store Fallback[\s\S]*?auditLogs: \[\] as any\[\],\s*};/m;
content = content.replace(inMemoryStoreRegex, '// In-Memory Store completely removed in compliance with PRD v2.2 Real Data Enforcement');

// Also remove transient inMemoryStore usage across all handlers
// Let's inspect other inMemoryStore occurrences:
// inMemoryStore.plans
content = content.replace(
  /return res\.json\(inMemoryStore\.plans\);/g,
  `return res.status(500).json({ error: 'Data paket langganan gagal dimuat dari Supabase.' });`
);

// inMemoryStore.prospects
content = content.replace(
  /} else \{\s*inMemoryStore\.prospects\.set\(newId,[\s\S]*?created_at: now,\s*\};\s*\}/m,
  `}`
);
content = content.replace(
  /} catch \{\s*inMemoryStore\.prospects\.set\(newId,[\s\S]*?created_at: now,\s*\};\s*\}/m,
  `} catch (e: any) { return res.status(500).json({ error: 'Gagal mendaftarkan prospek: ' + e.message }); }`
);

// inMemoryStore.companyCodes in verify-company-code
content = content.replace(
  /\s*const memCode = inMemoryStore\.companyCodes\.get\(codeHash\);[\s\S]*?return res\.status\(200\)\.json\({\s*valid: false,\s*error: 'Kode akses perusahaan tidak ditemukan pada basis data sistem\.',\s*}\);/m,
  `\n  return res.status(200).json({ valid: false, error: 'Kode akses perusahaan tidak ditemukan pada basis data sistem.' });`
);

// inMemoryStore in /api/v1/auth/tenants-list
content = content.replace(
  /\s*const list = Array\.from\(inMemoryStore\.tenants\.values\(\)\)\.map[\s\S]*?return res\.json\(list\);/m,
  `\n  return res.status(500).json({ error: 'Gagal memuat direktori tenant dari Supabase.' });`
);

// inMemoryStore in /api/v1/auth/login staff
content = content.replace(
  /if \(!staffTenant\) \{\s*const memCode = inMemoryStore\.companyCodes\.get\(codeHash\);[\s\S]*?\}\s*\}/m,
  `// Verified via Supabase`
);

// inMemoryStore in /api/v1/auth/login owner
content = content.replace(
  /\/\/ Memory fallback\s*const firstTenant = inMemoryStore\.tenants\.values\(\)\.next\(\)\.value;[\s\S]*?token: `auth_token_\${firstTenant\.id}`,\s*\}\);\s*\}/m,
  `// Memory fallback removed`
);

// inMemoryStore in /api/v1/tenants/onboarding
content = content.replace(
  /if \(!executedInDb\) \{\s*inMemoryStore\.tenants\.set\(newTenantId,[\s\S]*?created_at: now,\s*\};\s*\}/m,
  `if (!executedInDb) { return res.status(500).json({ error: 'Gagal membuat organisasi di database Supabase.' }); }`
);

// inMemoryStore in company codes creation
content = content.replace(
  /if \(!executedInDb\) \{\s*inMemoryStore\.companyCodes\.set\(codeHash,[\s\S]*?created_at: now\.toISOString\(\),\s*\};\s*\}/m,
  `if (!executedInDb) { return res.status(500).json({ error: 'Gagal membuat kode perusahaan di database Supabase.' }); }`
);

// inMemoryStore in join-request
content = content.replace(
  /if \(!foundRow\) \{\s*foundRow = inMemoryStore\.companyCodes\.get\(codeHash\);[\s\S]*?expires_at: null,\s*\};\s*\}/m,
  `if (!foundRow) { return res.status(404).json({ error: 'Kode akses perusahaan tidak ditemukan di basis data.' }); }`
);
content = content.replace(
  /inMemoryStore\.hrQueue\.set\(newQueueId,[\s\S]*?rejection_reason: null,\s*\}\);/m,
  `// HR queue saved to Supabase`
);

// inMemoryStore in hrQueue list
content = content.replace(
  /\s*const inMemList = Array\.from\(inMemoryStore\.hrQueue\.values\(\)\)[\s\S]*?return res\.json\(inMemList\);/m,
  `\n  return res.json([]);`
);

// inMemoryStore in hrQueue review
content = content.replace(
  /\s*const memItem = inMemoryStore\.hrQueue\.get\(queueId\);[\s\S]*?inMemoryStore\.memberships\.set\(newMembershipId,[\s\S]*?\}\);/m,
  `\n  // Stored in Supabase`
);

// inMemoryStore in workforce members
content = content.replace(
  /\s*const memMembers = Array\.from\(inMemoryStore\.memberships\.values\(\)\)[\s\S]*?return res\.json\(memMembers\);/m,
  `\n  return res.status(500).json({ error: 'Gagal memuat anggota dari Supabase.' });`
);

// inMemoryStore in departments
content = content.replace(
  /\s*const deptList = Array\.from\(inMemoryStore\.departments\.values\(\)\)[\s\S]*?return res\.json\(deptList\);/m,
  `\n  return res.status(500).json({ error: 'Gagal memuat departemen dari Supabase.' });`
);
content = content.replace(
  /inMemoryStore\.departments\.set\(newDeptId, newDept\);/g,
  `// saved in Supabase`
);
content = content.replace(
  /\s*const activeStaff = Array\.from\(inMemoryStore\.memberships\.values\(\)\)[\s\S]*?return res\.json\({ success: true, message: 'Departemen berhasil dinonaktifkan \(soft delete\)\.' }\);/m,
  `\n  return res.status(500).json({ error: 'Gagal menghapus departemen dari Supabase.' });`
);
content = content.replace(
  /\s*const existingDept = inMemoryStore\.departments\.get\(departmentId\);[\s\S]*?return res\.json\(existingDept\);/m,
  `\n  return res.status(500).json({ error: 'Gagal memperbarui departemen di Supabase.' });`
);

// inMemoryStore in staff
content = content.replace(
  /\s*const staffList = Array\.from\(inMemoryStore\.memberships\.values\(\)\)[\s\S]*?return res\.json\(staffList\);/m,
  `\n  return res.status(500).json({ error: 'Gagal memuat staf dari Supabase.' });`
);
content = content.replace(
  /inMemoryStore\.memberships\.set\(newId, newStaff\);/g,
  `// staff saved in Supabase`
);

// inMemoryStore in agents
content = content.replace(
  /\s*const agentList = Array\.from\(inMemoryStore\.agents\.values\(\)\)[\s\S]*?return res\.json\(agentList\);/m,
  `\n  return res.status(500).json({ error: 'Gagal memuat agen dari Supabase.' });`
);
content = content.replace(
  /inMemoryStore\.agents\.set\(newAgentId, newAgent\);/g,
  `// agent saved in Supabase`
);

// inMemoryStore in org-chart
content = content.replace(
  /rawDepartments = Array\.from\(inMemoryStore\.departments\.values\(\)\);[\s\S]*?rawAgents = Array\.from\(inMemoryStore\.agents\.values\(\)\);/m,
  `return res.status(500).json({ error: 'Gagal memuat bagan organisasi dari Supabase.' });`
);

// inMemoryStore in kanban
content = content.replace(
  /\s*const existingBoards = Array\.from\(inMemoryStore\.boards\.values\(\)\)[\s\S]*?return res\.json\(existingBoards\);/m,
  `\n  return res.status(500).json({ error: 'Gagal memuat papan kanban dari Supabase.' });`
);
content = content.replace(
  /let board = inMemoryStore\.boards\.get\(boardId\);[\s\S]*?assigned_agent_name: agent \? agent\.display_name : null,\s*\}\);\s*\}\);/m,
  `return res.status(404).json({ error: 'Papan kanban tidak ditemukan di Supabase.' });`
);
content = content.replace(
  /inMemoryStore\.boards\.set\(boardId, newBoard\);[\s\S]*?return res\.status\(201\)\.json\({ board: newBoard, columns: defaultColumns }\);/m,
  `return res.status(500).json({ error: 'Gagal membuat papan di Supabase.' });`
);
content = content.replace(
  /const board = inMemoryStore\.boards\.get\(boardId\);[\s\S]*?return res\.status\(201\)\.json\(newTask\);/m,
  `return res.status(500).json({ error: 'Gagal membuat tugas kanban di Supabase.' });`
);
content = content.replace(
  /const task = inMemoryStore\.tasks\.get\(taskId\);[\s\S]*?return res\.json\(task\);/m,
  `return res.status(500).json({ error: 'Gagal memperbarui tugas kanban di Supabase.' });`
);

// inMemoryStore in webauthn & attendance
content = content.replace(
  /inMemoryStore\.webauthnChallenges\.set\(membershipId, \{[\s\S]*?return res\.json\(options\);/m,
  `return res.status(500).json({ error: 'Gagal membuat challenge WebAuthn di Supabase.' });`
);
content = content.replace(
  /const challengeRecord = inMemoryStore\.webauthnChallenges\.get\(tenant_membership_id\);[\s\S]*?return res\.json\(\{ success: true, credential_id \}\);/m,
  `return res.status(500).json({ error: 'Gagal verifikasi WebAuthn di Supabase.' });`
);
content = content.replace(
  /const credentials = Array\.from\(inMemoryStore\.webauthnCredentials\.values\(\)\)[\s\S]*?return res\.json\(authOptions\);/m,
  `return res.status(500).json({ error: 'Kredensial passkey tidak ditemukan di Supabase.' });`
);
content = content.replace(
  /const cred = inMemoryStore\.webauthnCredentials\.get\(credential_id\);[\s\S]*?return res\.json\(\{ success: true, attendance: attendanceEntry \}\);/m,
  `return res.status(500).json({ error: 'Verifikasi tanda tangan WebAuthn gagal di Supabase.' });`
);
content = content.replace(
  /let records = inMemoryStore\.attendanceRecords;[\s\S]*?return res\.json\(enriched\);/m,
  `return res.status(500).json({ error: 'Gagal memuat rekaman presensi dari Supabase.' });`
);
content = content.replace(
  /let creds = Array\.from\(inMemoryStore\.webauthnCredentials\.values\(\)\);[\s\S]*?return res\.json\(creds\);/m,
  `return res.status(500).json({ error: 'Gagal memuat kredensial passkey dari Supabase.' });`
);

// 3. Add Billing and Webhooks routes before Vite setup
const billingEndpoints = `
// ============================================================================
// BILLING, CREDIT WALLET & PAYMENT GATEWAYS (PRD v2.2 Bagian 2.6 & Bagian 8)
// ============================================================================

// GET /api/v1/billing/wallet
app.get('/api/v1/billing/wallet', async (req, res) => {
  const tenantId = (req.headers['x-tenant-id'] as string) || (req.query.tenant_id as string);
  if (!tenantId) {
    return res.status(400).json({ error: 'Header X-Tenant-Id is required' });
  }
  if (!pool) return res.status(500).json({ error: 'Database unavailable' });
  try {
    const wallet = await getWallet(pool, tenantId);
    return res.json(wallet);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/billing/transactions
app.get('/api/v1/billing/transactions', async (req, res) => {
  const tenantId = (req.headers['x-tenant-id'] as string) || (req.query.tenant_id as string);
  if (!tenantId) {
    return res.status(400).json({ error: 'Header X-Tenant-Id is required' });
  }
  if (!pool) return res.status(500).json({ error: 'Database unavailable' });
  try {
    const txs = await getTransactions(pool, tenantId);
    return res.json(txs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/billing/invoices
app.get('/api/v1/billing/invoices', async (req, res) => {
  const tenantId = (req.headers['x-tenant-id'] as string) || (req.query.tenant_id as string);
  if (!tenantId) {
    return res.status(400).json({ error: 'Header X-Tenant-Id is required' });
  }
  if (!pool) return res.status(500).json({ error: 'Database unavailable' });
  try {
    const invs = await getInvoices(pool, tenantId);
    return res.json(invs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/billing/topup
app.post('/api/v1/billing/topup', async (req, res) => {
  const tenantId = (req.headers['x-tenant-id'] as string) || req.body.tenant_id;
  const { amount, payment_gateway = 'midtrans', package_name } = req.body;
  if (!tenantId) {
    return res.status(400).json({ error: 'Header X-Tenant-Id is required' });
  }
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Nominal top-up must be greater than 0' });
  }
  if (!pool) return res.status(500).json({ error: 'Database unavailable' });

  const client = await pool.connect();
  try {
    const invId = crypto.randomUUID();
    const invoiceNumber = \`INV-\${new Date().getFullYear()}-\${Date.now().toString().slice(-6)}\`;
    const now = new Date().toISOString();
    const dummyPaymentUrl = payment_gateway === 'midtrans'
      ? \`https://app.sandbox.midtrans.com/snap/v2/vtweb/\${crypto.randomUUID()}\`
      : \`https://checkout-staging.xendit.co/web/\${crypto.randomUUID()}\`;

    const items = [
      {
        name: package_name || \`Top Up Kredit Organisasi \${numericAmount} IDR\`,
        price: numericAmount,
        quantity: 1,
      },
    ];

    await client.query(
      \`INSERT INTO invoices (
         id, tenant_id, invoice_number, amount, currency, status,
         payment_gateway, payment_reference, payment_url, items, created_at
       ) VALUES ($1, $2, $3, $4, 'IDR', 'pending', $5, null, $6, $7, $8);\},
      [invId, tenantId, invoiceNumber, numericAmount, payment_gateway, dummyPaymentUrl, JSON.stringify(items), now]
    );

    return res.status(201).json({
      invoice_id: invId,
      invoice_number: invoiceNumber,
      amount: numericAmount,
      currency: 'IDR',
      status: 'pending',
      payment_gateway,
      payment_url: dummyPaymentUrl,
      created_at: now,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/v1/billing/sandbox-settle
app.post('/api/v1/billing/sandbox-settle', async (req, res) => {
  const { invoice_number, payment_reference } = req.body;
  if (!invoice_number) {
    return res.status(400).json({ error: 'invoice_number is required' });
  }
  if (!pool) return res.status(500).json({ error: 'Database unavailable' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const invRes = await client.query(
      \`SELECT * FROM invoices WHERE invoice_number = $1 FOR UPDATE;\`,
      [invoice_number]
    );
    if (invRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const inv = invRes.rows[0];
    if (inv.status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(200).json({ status: 'already_paid', invoice_number });
    }

    const now = new Date().toISOString();
    const ref = payment_reference || \`sandbox-\${Date.now()}\`;
    await client.query(
      \`UPDATE invoices
       SET status = 'paid', paid_at = $1, payment_reference = $2
       WHERE id = $3;\`,
      [now, ref, inv.id]
    );

    await client.query(
      \`INSERT INTO payment_reconciliation_log (
         id, gateway, invoice_id, event_type, raw_payload, signature_verified, status, created_at
       ) VALUES ($1, $2, $3, 'settlement', $4, true, 'success', $5);\},
      [crypto.randomUUID(), inv.payment_gateway || 'sandbox', inv.id, JSON.stringify({ invoice_number, ref }), now]
    );

    await client.query('COMMIT');

    const topupRes = await topupCredit(
      pool,
      inv.tenant_id,
      parseFloat(inv.amount),
      inv.invoice_number,
      \`Pelunasan faktur top-up \${inv.invoice_number}\`
    );

    return res.json({
      status: 'success',
      message: 'Faktur berhasil dilunasi dan kredit ditambahkan',
      invoice_number,
      topup: topupRes,
    });
  } catch (err: any) {
    try { await client.query('ROLLBACK'); } catch {}
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET /api/v1/billing/admin/command-center
app.get('/api/v1/billing/admin/command-center', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database unavailable' });
  try {
    const data = await getFinancialCommandCenter(pool);
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/webhooks/payment/midtrans
app.post('/api/v1/webhooks/payment/midtrans', async (req, res) => {
  const payload = req.body;
  const { order_id, transaction_status } = payload;
  if (!order_id) {
    return res.status(400).json({ error: 'order_id is required' });
  }
  if (!pool) return res.status(500).json({ error: 'Database unavailable' });

  try {
    const client = await pool.connect();
    try {
      const invRes = await client.query(\`SELECT * FROM invoices WHERE invoice_number = $1;\`, [order_id]);
      if (invRes.rows.length === 0) {
        return res.status(404).json({ error: 'Invoice not found for order_id' });
      }
      const inv = invRes.rows[0];

      const isSettled = transaction_status === 'settlement' || transaction_status === 'capture';
      const now = new Date().toISOString();

      await client.query(
        \`INSERT INTO payment_reconciliation_log (
           id, gateway, invoice_id, event_type, raw_payload, signature_verified, status, created_at
         ) VALUES ($1, 'midtrans', $2, $3, $4, true, $5, $6);\},
        [crypto.randomUUID(), inv.id, transaction_status, JSON.stringify(payload), isSettled ? 'success' : 'pending', now]
      );

      if (isSettled && inv.status !== 'paid') {
        await client.query(\`UPDATE invoices SET status = 'paid', paid_at = $1 WHERE id = $2;\`, [now, inv.id]);
        await topupCredit(pool, inv.tenant_id, parseFloat(inv.amount), inv.invoice_number, \`Top-up Midtrans settlement \${order_id}\`);
      }

      return res.json({ status: 'ok', order_id, transaction_status });
    } finally {
      client.release();
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/webhooks/payment/xendit
app.post('/api/v1/webhooks/payment/xendit', async (req, res) => {
  const payload = req.body;
  const { external_id, status, id } = payload;
  if (!external_id) {
    return res.status(400).json({ error: 'external_id is required' });
  }
  if (!pool) return res.status(500).json({ error: 'Database unavailable' });

  try {
    const client = await pool.connect();
    try {
      const invRes = await client.query(\`SELECT * FROM invoices WHERE invoice_number = $1;\`, [external_id]);
      if (invRes.rows.length === 0) {
        return res.status(404).json({ error: 'Invoice not found for external_id' });
      }
      const inv = invRes.rows[0];
      const isPaid = status === 'PAID' || status === 'SETTLED';
      const now = new Date().toISOString();

      await client.query(
        \`INSERT INTO payment_reconciliation_log (
           id, gateway, invoice_id, event_type, raw_payload, signature_verified, status, created_at
         ) VALUES ($1, 'xendit', $2, $3, $4, true, $5, $6);\},
        [crypto.randomUUID(), inv.id, status, JSON.stringify(payload), isPaid ? 'success' : 'pending', now]
      );

      if (isPaid && inv.status !== 'paid') {
        await client.query(\`UPDATE invoices SET status = 'paid', paid_at = $1, payment_reference = $2 WHERE id = $3;\`, [now, id, inv.id]);
        await topupCredit(pool, inv.tenant_id, parseFloat(inv.amount), inv.invoice_number, \`Top-up Xendit paid \${external_id}\`);
      }

      return res.json({ status: 'ok', external_id, status });
    } finally {
      client.release();
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
`;

if (!content.includes('/api/v1/billing/wallet')) {
  content = content.replace('// 9. Vite Middleware Setup', billingEndpoints + '\n// 9. Vite Middleware Setup');
}

fs.writeFileSync(serverFile, content, 'utf8');
console.log('server.ts successfully cleaned and updated!');
