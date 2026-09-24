'use client';

import React, { useEffect, useState } from 'react';
import { ProactiveChannelsScreen } from '../../../../src/components/ProactiveChannelsScreen';
import { ShieldAlert } from 'lucide-react';
import { EmptyState } from '@orchestree/ui';

export default function ClientProactivePage() {
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
    <main className="min-h-screen bg-slate-50 dark:bg-[#0B1220] pb-16">
      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-6">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Memverifikasi sesi aman...</div>
        ) : activeTenant ? (
          <ProactiveChannelsScreen
            tenant={activeTenant}
            onBack={() => {
              if (typeof window !== 'undefined') {
                window.location.href = '/overview';
              }
            }}
          />
        ) : (
          <div className="max-w-xl mx-auto pt-16">
            <EmptyState
              id="auth-required-proactive"
              icon={ShieldAlert}
              title="Sesi Terautentikasi Diperlukan"
              description="Konfigurasi kanal proaktif organisasi hanya dapat diakses melalui portal resmi dengan sesi valid."
              actionLabel="Masuk ke Portal Resmi"
              onAction={() => {
                window.location.href = '/';
              }}
            />
          </div>
        )}
      </div>
    </main>
  );
}
