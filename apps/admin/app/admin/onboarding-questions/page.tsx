'use client';

import React, { useEffect, useState } from 'react';
import { OnboardingPersonaQuestionCuratorScreen } from '../../../components/OnboardingPersonaQuestionCuratorScreen';
import { EmptyState } from '@orchestree/ui';
import { ShieldAlert } from 'lucide-react';

export default function AdminOnboardingQuestionsPage() {
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
        <div className="p-12 text-center text-slate-400 text-sm">Memverifikasi protokol otorisasi Super Admin...</div>
      ) : isAdminAuth ? (
        <OnboardingPersonaQuestionCuratorScreen />
      ) : (
        <div className="max-w-xl mx-auto pt-16 px-4">
          <EmptyState
            id="admin-onboarding-questions-auth-guard"
            icon={ShieldAlert}
            title="Otentikasi Super Admin & MFA Diperlukan"
            description="Manajemen kurator kuesioner persona onboarding dan Company Brain memerlukan hak Super Admin dengan verifikasi MFA aktif."
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
