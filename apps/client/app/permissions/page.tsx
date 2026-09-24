'use client';

import React, { useEffect, useState } from 'react';
import { AIDataPermissionScreen } from '../../components/AIDataPermissionScreen';
import { ShieldAlert } from 'lucide-react';
import { EmptyState } from '@orchestree/ui';

export default function PermissionsPage() {
  const [activeTenant, setActiveTenant] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('orchestree_active_tenant');
      if (stored) {
        setActiveTenant(JSON.parse(stored));
      }
    } catch (e) {
      // Ignored
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <main className="min-h-screen bg-[#0B1220] pb-16 text-white">
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Memverifikasi sesi aman...</div>
      ) : activeTenant ? (
        <AIDataPermissionScreen
          tenantId={activeTenant.tenant_id}
          tenantName={activeTenant.display_name || activeTenant.legal_name}
          userRole={activeTenant.role || 'TENANT_MEMBER'}
          onBack={() => {
            if (typeof window !== 'undefined') {
              window.location.href = '/';
            }
          }}
        />
      ) : (
        <div className="max-w-xl mx-auto pt-16 px-4">
          <EmptyState
            id="auth-required-permissions"
            icon={ShieldAlert}
            title="Sesi Terautentikasi Diperlukan"
            description="Konfigurasi matriks izin data kecerdasan buatan hanya dapat diakses setelah masuk ke organisasi terdaftar."
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
