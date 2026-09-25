'use client';

import React, { useEffect, useState } from 'react';
import { BillingHubScreen } from '../../components/billing/BillingHubScreen';
import { ShieldAlert } from 'lucide-react';
import { EmptyState } from '@orchestree/ui';

export default function ClientBillingPage() {
  const [activeTenant, setActiveTenant] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('orchestree_active_tenant');
      if (stored) {
        setActiveTenant(JSON.parse(stored));
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <main className="min-h-screen bg-[#070D18] text-white">
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Memverifikasi sesi organisasi...</div>
      ) : activeTenant ? (
        <BillingHubScreen
          tenantId={activeTenant.tenant_id}
          tenantName={activeTenant.display_name || activeTenant.legal_name || 'Organisasi Aktif'}
        />
      ) : (
        <div className="max-w-xl mx-auto pt-16 px-4">
          <EmptyState
            id="auth-required-billing"
            icon={ShieldAlert}
            title="Sesi Terautentikasi Diperlukan"
            description="Informasi dompet kredit, neraca langganan, dan tagihan hanya dapat diakses oleh anggota organisasi terdaftar."
            actionLabel="Masuk ke Portal Resmi"
            onAction={() => {
              window.location.href = '/';
            }}
          />
        </div>
      )}
    </main>
  );
}
