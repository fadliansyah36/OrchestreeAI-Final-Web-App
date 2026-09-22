import React from 'react';
import './globals.css';

export const metadata = {
  title: 'OrchestreeAI',
  description: 'Autonomous AI Workforce Operating System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" data-theme="dark">
      <body className="min-h-screen bg-slate-50 dark:bg-[#0B1220] text-slate-900 dark:text-white antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
