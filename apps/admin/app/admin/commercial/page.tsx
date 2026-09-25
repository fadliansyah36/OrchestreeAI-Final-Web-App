'use client';

import React, { useEffect, useState } from 'react';
import { CommercialManagementHub } from '../../../components/CommercialManagementHub';
import { EmptyState } from '@orchestree/ui';
import { ShieldAlert } from 'lucide-react';

export default function AdminCommercialHubPage() {
  const [isAdminAuth, setIsAdminAuth] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    try {
      const token = localStorage.getItem('orchestree_admin_token') || localStorage.getItem('sb-access-token');
      const isMfa = localStorage.getItem('orchestree_mfa_verified') === 'true';
      setIsAdminAuth(Boolean(token && isMfa));
    } catch {
      setIsAdminAuth(false);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <main className="min-h-screen p-6 md:p-8 bg-[#070D18] text-white">
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Memverifikasi protokol otorisasi...</div>
      ) : isAdminAuth ? (
        <CommercialManagementHub />
      ) : (
        <div className="max-w-xl mx-auto pt-16 px-4">
          <EmptyState
            id="admin-commercial-auth-guard"
            icon={ShieldAlert}
            title="Otentikasi Super Admin & MFA Diperlukan"
            description="Konfigurasi paket langganan komersial, matriks fasilitas, dan formula kredit memerlukan hak Super Admin dengan verifikasi MFA aktif."
            actionLabel="Masuk Konsol Resmi"
            onAction={() => {
              window.location.href = '/login?admin=1';
            }}
          />
        </div>
      )}
    </main>
  );
}
