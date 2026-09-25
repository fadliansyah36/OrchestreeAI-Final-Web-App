'use client';

import React, { useEffect, useState } from 'react';
import { SalesMarketingHubScreen } from '../../components/omnichannel/SalesMarketingHubScreen';
import { ShieldAlert } from 'lucide-react';
import { EmptyState } from '@orchestree/ui';

export default function ClientSalesPage() {
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
    <main className="min-h-screen bg-slate-50 dark:bg-[#0B1220]">
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Memverifikasi sesi penjualan...</div>
      ) : activeTenant ? (
        <SalesMarketingHubScreen tenantId={activeTenant.tenant_id} />
      ) : (
        <div className="max-w-xl mx-auto pt-16 px-4">
          <EmptyState
            id="auth-required-sales"
            icon={ShieldAlert}
            title="Sesi Terautentikasi Diperlukan"
            description="Manajemen pipeline penjualan, pesanan, dan katalog hanya dapat diakses melalui portal resmi dengan sesi aktif."
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
