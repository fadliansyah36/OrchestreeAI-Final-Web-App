'use client';

import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  X,
  FileSpreadsheet,
  FileCode,
  FileArchive,
  RefreshCw,
} from 'lucide-react';

export interface UploadedFileArtifact {
  file_id: string;
  file_name: string;
  storage_path: string;
  public_url: string;
  signed_url: string;
  content_type: string;
  size_bytes: number;
}

export interface FileUploadFieldProps {
  label?: string;
  description?: string;
  accept?: string;
  multiple?: boolean;
  maxSizeMB?: number;
  bucket?: 'documents' | 'avatars' | 'artifacts';
  category?: string;
  tenantId?: string;
  disabled?: boolean;
  className?: string;
  onUploadComplete?: (artifacts: UploadedFileArtifact[]) => void;
  onError?: (error: string) => void;
}

interface UploadProgressItem {
  id: string;
  file: File;
  previewUrl?: string;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  errorMessage?: string;
  artifact?: UploadedFileArtifact;
}

export const FileUploadField: React.FC<FileUploadFieldProps> = ({
  label = 'Unggah Berkas',
  description = 'Pilih berkas dari perangkat Anda atau seret berkas ke area ini.',
  accept = '.pdf,.doc,.docx,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,.txt',
  multiple = false,
  maxSizeMB = 15,
  bucket = 'documents',
  category = 'attachments',
  tenantId,
  disabled = false,
  className = '',
  onUploadComplete,
  onError,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadProgressItem[]>([]);

  const getFileIcon = (mimeType: string, filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (mimeType.startsWith('image/')) {
      return <ImageIcon className="w-5 h-5 text-emerald-400" />;
    }
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv' || mimeType.includes('spreadsheet') || mimeType.includes('csv')) {
      return <FileSpreadsheet className="w-5 h-5 text-teal-400" />;
    }
    if (ext === 'zip' || ext === 'tar' || ext === 'gz') {
      return <FileArchive className="w-5 h-5 text-amber-400" />;
    }
    if (ext === 'json' || ext === 'xml' || ext === 'html') {
      return <FileCode className="w-5 h-5 text-purple-400" />;
    }
    return <FileText className="w-5 h-5 text-sky-400" />;
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || disabled) return;

    const fileList = Array.from(files);
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    const newItems: UploadProgressItem[] = [];

    for (const file of fileList) {
      if (file.size > maxSizeBytes) {
        const err = `Berkas "${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)} MB) melebihi batas ${maxSizeMB} MB.`;
        if (onError) onError(err);
        continue;
      }

      let previewUrl: string | undefined;
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file);
      }

      const itemId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${file.size}`;
      newItems.push({
        id: `${file.name}-${itemId}`,
        file,
        previewUrl,
        progress: 0,
        status: 'uploading',
      });
    }

    if (newItems.length === 0) return;

    if (multiple) {
      setUploadItems((prev) => [...prev, ...newItems]);
    } else {
      setUploadItems(newItems);
    }

    // Eksekusi upload multipart ke backend
    const completedArtifacts: UploadedFileArtifact[] = [];

    for (const item of newItems) {
      try {
        const formData = new FormData();
        formData.append('file', item.file);
        formData.append('bucket', bucket);
        formData.append('category', category);
        if (tenantId) {
          formData.append('tenant_id', tenantId);
        }

        const token = typeof window !== 'undefined'
          ? localStorage.getItem('orchestree_auth_token') || localStorage.getItem('sb-access-token') || ''
          : '';

        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        // Simulasi progress upload awal
        setUploadItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, progress: 40 } : it))
        );

        const response = await fetch('/api/v1/storage/upload', {
          method: 'POST',
          headers,
          body: formData,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || errData.message || `Gagal mengunggah berkas (${response.status})`);
        }

        const result = await response.json();
        const artifact: UploadedFileArtifact = {
          file_id: result.file_id || result.id || item.id,
          file_name: result.filename || item.file.name,
          storage_path: result.storage_path,
          public_url: result.public_url,
          signed_url: result.signed_url || result.public_url,
          content_type: result.content_type || item.file.type,
          size_bytes: result.size_bytes || item.file.size,
        };

        completedArtifacts.push(artifact);

        setUploadItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? { ...it, progress: 100, status: 'completed', artifact }
              : it
          )
        );
      } catch (err: any) {
        const errorMsg = err.message || 'Gagal memproses berkas.';
        setUploadItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? { ...it, status: 'error', errorMessage: errorMsg }
              : it
          )
        );
        if (onError) onError(errorMsg);
      }
    }

    if (completedArtifacts.length > 0 && onUploadComplete) {
      onUploadComplete(completedArtifacts);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!disabled && e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const removeItem = (id: string) => {
    setUploadItems((prev) => prev.filter((it) => it.id !== id));
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-300 block">{label}</label>
          <span className="text-[11px] text-slate-500">Maks. {maxSizeMB} MB</span>
        </div>
      )}

      {/* Hidden Native File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
        aria-label={label}
      />

      {/* Dropzone & File Manager Trigger */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-5 text-center transition-all cursor-pointer select-none ${
          disabled
            ? 'opacity-50 cursor-not-allowed border-slate-800 bg-slate-950/40'
            : isDragOver
            ? 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
            : 'border-slate-700/80 hover:border-emerald-500/60 bg-slate-900/60 hover:bg-slate-900/90'
        }`}
      >
        <div className="flex flex-col items-center justify-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-200">
              Pilih dari File Manager / Galeri Perangkat
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">{description}</p>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500 font-mono">
            <span>Format didukung: {accept.replace(/\./g, '').toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* List Progress / Uploaded Items */}
      {uploadItems.length > 0 && (
        <div className="space-y-2 mt-3">
          {uploadItems.map((item) => (
            <div
              key={item.id}
              className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center gap-3 text-xs"
            >
              {/* Thumbnail / Icon */}
              <div className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                {item.previewUrl ? (
                  <img src={item.previewUrl} alt={item.file.name} className="w-full h-full object-cover" />
                ) : (
                  getFileIcon(item.file.type, item.file.name)
                )}
              </div>

              {/* Info & Progress */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-200 truncate pr-2">{item.file.name}</span>
                  <span className="text-[10px] text-slate-500 font-mono shrink-0">
                    {(item.file.size / 1024).toFixed(1)} KB
                  </span>
                </div>

                {item.status === 'uploading' && (
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}

                {item.status === 'completed' && (
                  <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Tersimpan di Penyimpanan Terisolasi Organisasi</span>
                  </div>
                )}

                {item.status === 'error' && (
                  <div className="flex items-center gap-1 text-[11px] text-rose-400">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{item.errorMessage || 'Gagal mengunggah'}</span>
                  </div>
                )}
              </div>

              {/* Status Actions */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeItem(item.id);
                }}
                className="text-slate-500 hover:text-slate-300 p-1 rounded-lg hover:bg-slate-800 transition"
                title="Hapus berkas"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
