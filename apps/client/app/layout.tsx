import React from 'react';
import { OrchIntlProvider } from '@orchestree/ui';
import './globals.css';

export const viewport = {
  themeColor: '#1FA35A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata = {
  title: 'OrchestreeAI — Autonomous AI Workforce Operating System',
  description: 'Autonomous AI Workforce Operating System for Enterprise Multi-Tenant Operations',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'OrchestreeAI',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" data-theme="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#1FA35A" />
      </head>
      <body className="min-h-screen bg-slate-50 dark:bg-[#0B1220] text-slate-900 dark:text-white antialiased font-sans">
        <OrchIntlProvider>
          {children}
        </OrchIntlProvider>
      </body>
    </html>
  );
}
