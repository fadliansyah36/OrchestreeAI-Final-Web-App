'use client';

/**
 * Utilitas pengunduhan berkas nyata ke penyimpanan lokal peramban (browser file download).
 * Mencegah pembukaan tautan berkas di tab baru, melainkan memicu unduhan langsung
 * dengan atribut Content-Disposition atau Blob URL lokal.
 */
export async function downloadFileFromUrl(url: string, filename: string): Promise<void> {
  try {
    const token = typeof window !== 'undefined'
      ? localStorage.getItem('orchestree_auth_token') || localStorage.getItem('sb-access-token') || ''
      : '';

    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Gagal mengunduh berkas (${response.status}): ${response.statusText}`);
    }

    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename || 'berkas_unduhan';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => {
      window.URL.revokeObjectURL(objectUrl);
    }, 1500);
  } catch (err: any) {
    console.error('Download error:', err);
    throw err;
  }
}

export const triggerDownload = downloadFileFromUrl;
