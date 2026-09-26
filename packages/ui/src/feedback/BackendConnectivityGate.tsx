'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BackendUnavailableScreen } from './BackendUnavailableScreen';
import { ShieldCheck } from 'lucide-react';

export type ConnectivityStatus = 'checking' | 'connected' | 'disconnected';

export interface UseBackendConnectivityResult {
  status: ConnectivityStatus;
  isChecking: boolean;
  checkNow: () => Promise<void>;
}

export function resolveBackendApiUrl(customUrl?: string): string {
  if (customUrl) {
    return customUrl.replace(/\/+$/, '');
  }
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BACKEND_API_URL) {
    return process.env.NEXT_PUBLIC_BACKEND_API_URL.replace(/\/+$/, '');
  }
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BACKEND_API_URL) {
    return (import.meta as any).env.VITE_BACKEND_API_URL.replace(/\/+$/, '');
  }
  return '';
}

export function useBackendConnectivity(backendApiUrl?: string): UseBackendConnectivityResult {
  const [status, setStatus] = useState<ConnectivityStatus>('checking');
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const resolvedUrlRef = useRef<string>(resolveBackendApiUrl(backendApiUrl));

  useEffect(() => {
    resolvedUrlRef.current = resolveBackendApiUrl(backendApiUrl);
  }, [backendApiUrl]);

  const check = useCallback(async (isManual: boolean = false) => {
    if (isManual) {
      setIsChecking(true);
    }
    let timeoutId: any = null;
    try {
      let signal: AbortSignal | undefined;
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        signal = AbortSignal.timeout(5000);
      } else if (typeof AbortController !== 'undefined') {
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), 5000);
        signal = controller.signal;
      }

      const baseUrl = resolvedUrlRef.current;
      const targetUrl = `${baseUrl}/health/ready`;

      const res = await fetch(targetUrl, {
        method: 'GET',
        cache: 'no-store',
        signal,
        headers: {
          'Accept': 'application/json',
        },
      });

      if (res.ok) {
        setStatus('connected');
      } else {
        setStatus('disconnected');
      }
    } catch {
      setStatus('disconnected');
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (isManual) {
        setIsChecking(false);
      }
    }
  }, []);

  const checkNow = useCallback(async () => {
    await check(true);
  }, [check]);

  useEffect(() => {
    let cancelled = false;

    const runInitialCheck = async () => {
      if (!cancelled) {
        await check(false);
      }
    };

    runInitialCheck();

    const interval = setInterval(() => {
      if (!cancelled) {
        check(false);
      }
    }, 10_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [check]);

  return { status, isChecking, checkNow };
}

export interface BackendConnectivityGateProps {
  children: React.ReactNode;
  backendUrl?: string;
  checkingFallback?: React.ReactNode;
}

export function BackendConnectivityGate({
  children,
  backendUrl,
  checkingFallback,
}: BackendConnectivityGateProps) {
  const { status, isChecking, checkNow } = useBackendConnectivity(backendUrl);

  if (status === 'checking') {
    if (checkingFallback) {
      return <>{checkingFallback}</>;
    }
    return (
      <div
        data-testid="backend-connectivity-checking"
        className="min-h-screen w-full bg-[#070D18] text-white flex flex-col items-center justify-center p-6 select-none font-sans antialiased"
      >
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-sky-600 flex items-center justify-center text-white font-bold text-lg mb-4 shadow-lg shadow-emerald-950/40">
            <ShieldCheck className="w-6 h-6 animate-pulse" />
          </div>
          <span className="text-sm font-medium text-slate-300">
            Memverifikasi koneksi server...
          </span>
          <span className="text-xs text-slate-500 mt-1">
            Menghubungkan ke gerbang verifikasi Fail-Closed
          </span>
        </div>
      </div>
    );
  }

  if (status === 'disconnected') {
    return (
      <BackendUnavailableScreen
        onRetry={checkNow}
        isRetrying={isChecking}
      />
    );
  }

  // Connected state: render children
  return <>{children}</>;
}
