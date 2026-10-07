import React from 'react';
import { OrchIntlProvider, BackendConnectivityGate } from '@orchestree/ui';
import { ClientRouteBoundary } from '../components/ClientRouteBoundary';
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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function() {});
                });
              }
            `,
          }}
        />
      </head>
      <body className="min-h-screen antialiased">
        <OrchIntlProvider>
          <BackendConnectivityGate>
            <ClientRouteBoundary>{children}</ClientRouteBoundary>
          </BackendConnectivityGate>
        </OrchIntlProvider>
      </body>
    </html>
  );
}
