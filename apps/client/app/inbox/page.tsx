'use client';

import React, { useEffect, useState } from 'react';
import { SalesMarketingHubScreen } from '../../components/omnichannel/SalesMarketingHubScreen';
import { ShieldAlert } from 'lucide-react';
import { EmptyState } from '@orchestree/ui';

export default function ClientInboxPage() {
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
        <div className="p-12 text-center text-slate-400 text-sm">Memverifikasi sesi komunikasi...</div>
      ) : activeTenant ? (
        <SalesMarketingHubScreen tenantId={activeTenant.tenant_id} />
      ) : (
        <div className="max-w-xl mx-auto pt-16 px-4">
          <EmptyState
            id="auth-required-inbox"
            icon={ShieldAlert}
            title="Sesi Terautentikasi Diperlukan"
            description="Pusat komunikasi dan pesan pelanggan hanya dapat diakses melalui portal resmi dengan sesi aktif."
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
