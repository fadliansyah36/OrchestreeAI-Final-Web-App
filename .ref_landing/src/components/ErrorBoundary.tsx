import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class DashboardErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[DashboardErrorBoundary] Uncaught rendering error caught by boundary:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[450px] p-8 flex items-center justify-center">
          <div className="max-w-xl w-full bg-slate-900 border border-rose-800/80 rounded-2xl p-6 shadow-2xl text-rose-200 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-rose-950/80 border border-rose-700/80 rounded-xl text-rose-400 shrink-0">
                <AlertOctagon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {this.props.fallbackTitle || 'Gangguan Render Komponen Dashboard'}
                </h3>
                <p className="text-xs text-slate-400">
                  Komponen gagal di-render tanpa mematikan seluruh aplikasi (Error Boundary Fail-Safe).
                </p>
              </div>
            </div>

            <div className="bg-black/60 border border-slate-800 rounded-xl p-3 text-xs font-mono text-rose-300 space-y-1 overflow-x-auto">
              <div className="font-bold text-rose-400">Pesan Kesalahan:</div>
              <div>{this.state.error?.message || 'Unknown render exception'}</div>
              {this.state.error?.stack && (
                <pre className="text-[10px] text-slate-400 whitespace-pre-wrap mt-2 max-h-40 overflow-y-auto">
                  {this.state.error.stack}
                </pre>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-slate-500">
                Status Error Boundary: Aktif & Mengisolasi Crash
              </span>
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition shadow"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Muat Ulang Layar</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
