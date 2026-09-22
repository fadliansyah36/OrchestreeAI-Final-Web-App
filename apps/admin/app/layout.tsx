import React from 'react';
import './globals.css';

export const metadata = {
  title: 'OrchestreeAI Admin Console',
  description: 'Super Admin Control Plane',
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" data-theme="dark">
      <body className="min-h-screen bg-[#070D18] text-white antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
