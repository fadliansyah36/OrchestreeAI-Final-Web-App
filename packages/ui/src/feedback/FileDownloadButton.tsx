'use client';

import React, { useState } from 'react';
import { Download, Loader2, CheckCircle2 } from 'lucide-react';
import { triggerDownload } from './downloadHelper';

export interface FileDownloadButtonProps {
  url: string;
  filename?: string;
  label?: string;
  icon?: React.ReactNode;
  className?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export const FileDownloadButton: React.FC<FileDownloadButtonProps> = ({
  url,
  filename = 'unduhan',
  label = 'Unduh Berkas',
  icon,
  className = '',
  variant = 'secondary',
  size = 'md',
  disabled = false,
  onSuccess,
  onError,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!url || isDownloading || disabled) return;

    try {
      setIsDownloading(true);
      await triggerDownload(url, filename);
      setIsDownloaded(true);
      if (onSuccess) onSuccess();
      setTimeout(() => {
        setIsDownloaded(false);
      }, 2500);
    } catch (err: any) {
      const msg = err.message || 'Gagal mengunduh berkas.';
      if (onError) onError(msg);
    } finally {
      setIsDownloading(false);
    }
  };

  const variantStyles = {
    primary: 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600',
    secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700',
    outline: 'bg-transparent hover:bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600',
    ghost: 'bg-transparent hover:bg-slate-800/60 text-slate-400 hover:text-slate-200 border-transparent',
  }[variant];

  const sizeStyles = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5 rounded-lg',
    md: 'text-sm px-3.5 py-2 gap-2 rounded-xl',
    lg: 'text-base px-5 py-2.5 gap-2.5 rounded-xl font-medium',
  }[size];

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={disabled || !url || isDownloading}
      className={`inline-flex items-center justify-center font-medium border transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles} ${sizeStyles} ${className}`}
      title={label}
    >
      {isDownloading ? (
        <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
      ) : isDownloaded ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
      ) : (
        icon || <Download className="w-4 h-4" />
      )}
      {label && <span>{isDownloading ? 'Mengunduh...' : isDownloaded ? 'Tersimpan' : label}</span>}
    </button>
  );
};
