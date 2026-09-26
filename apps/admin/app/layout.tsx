import React from 'react';
import { OrchIntlProvider, BackendConnectivityGate } from '@orchestree/ui';
import './globals.css';

export const viewport = {
  themeColor: '#1E6FE0',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata = {
  title: 'OrchestreeAI Admin Console — Super Admin Control Plane',
  description: 'Super Admin Control Plane and Multi-Tenant Platform Operations for OrchestreeAI',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'OrchAdmin',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" data-theme="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#1E6FE0" />
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
      <body className="min-h-screen bg-[#070D18] text-white antialiased font-sans">
        <OrchIntlProvider>
          <BackendConnectivityGate>
            {children}
          </BackendConnectivityGate>
        </OrchIntlProvider>
      </body>
    </html>
  );
}
