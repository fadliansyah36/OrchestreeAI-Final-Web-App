import React, { useState } from 'react';
import { Database, Play, RefreshCw, CheckCircle2, ShieldCheck, Layers, Clock, Zap } from 'lucide-react';
import { api } from '../lib/api';

export const MemoryManagementScreen: React.FC = () => {
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleRunJob = async (jobName: string) => {
    setRunningJob(jobName);
    try {
      const res = await api.triggerSchedulerJob(jobName);
      setMessage({ type: 'success', text: res.message || `Job "${jobName}" berhasil dipicu.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || `Gagal menjalankan job "${jobName}".` });
    } finally {
      setRunningJob(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-5 rounded-xl backdrop-blur">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-400" />
            <span>Agent Memory Management, Decay & Hybrid RAG Re-ranking</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Audit consolidator threshold, linear & rolling decay scheduling, serta hybrid search vector embedding.
          </p>
        </div>
      </div>

      {message && (
        <div
          className={`p-3 text-xs rounded-lg border ${
            message.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/60 border-rose-800 text-rose-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Memory Policies */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white text-sm">Working Memory Consolidator</h3>
            <Layers className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xs text-slate-400">
            Menggabungkan short-term episodic buffer ke long-term semantic memory saat kapasitas melebihi ambang batas.
          </p>
          <div className="pt-2">
            <button
              onClick={() => handleRunJob('memory-consolidation')}
              disabled={runningJob === 'memory-consolidation'}
              className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{runningJob === 'memory-consolidation' ? 'Menjalankan...' : 'Trigger Consolidation'}</span>
            </button>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white text-sm">Linear & Rolling Decay Job</h3>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-xs text-slate-400">
            Mengurangi bobot relevansi ingatan lama secara bertahap untuk menjaga latensi pencarian RAG tetap efisien.
          </p>
          <div className="pt-2">
            <button
              onClick={() => handleRunJob('memory-decay')}
              disabled={runningJob === 'memory-decay'}
              className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{runningJob === 'memory-decay' ? 'Menjalankan...' : 'Trigger Memory Decay'}</span>
            </button>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white text-sm">Vector Index Re-ranking</h3>
            <Zap className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-xs text-slate-400">
            Membangun ulang index HNSW vector & BM25 sparse index untuk akurasi pencarian konteks pengetahuan organisasi.
          </p>
          <div className="pt-2">
            <button
              onClick={() => handleRunJob('vector-rerank')}
              disabled={runningJob === 'vector-rerank'}
              className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{runningJob === 'vector-rerank' ? 'Menjalankan...' : 'Re-index Knowledge Graph'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
