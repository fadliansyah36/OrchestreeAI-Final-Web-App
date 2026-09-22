'use client';

import React, { useState } from 'react';
import { MessageSquare, Users, Share2, Layers } from 'lucide-react';
import { OmnichannelInboxScreen } from './OmnichannelInboxScreen';
import { CustomerMergeReviewScreen } from './CustomerMergeReviewScreen';
import { ChannelAccountsScreen } from './ChannelAccountsScreen';

interface SalesMarketingHubScreenProps {
  tenantId: string;
}

export const SalesMarketingHubScreen: React.FC<SalesMarketingHubScreenProps> = ({ tenantId }) => {
  const [activeTab, setActiveTab] = useState<'INBOX' | 'MERGE_REVIEWS' | 'CHANNELS'>('INBOX');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Banner & Tab Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            Pusat Penjualan, Pemasaran & Omnichannel
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Gateway kanal terpadu (WhatsApp Cloud API & Telegram MTProto) dengan resolusi identitas pelanggan otomatis.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl self-start md:self-auto">
          <button
            onClick={() => setActiveTab('INBOX')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'INBOX'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Kotak Masuk Omnichannel</span>
          </button>

          <button
            onClick={() => setActiveTab('MERGE_REVIEWS')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'MERGE_REVIEWS'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Review Penggabungan (WEAK)</span>
          </button>

          <button
            onClick={() => setActiveTab('CHANNELS')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'CHANNELS'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Share2 className="w-4 h-4" />
            <span>Kanal & MTProto QR</span>
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      {activeTab === 'INBOX' && (
        <OmnichannelInboxScreen tenantId={tenantId} />
      )}

      {activeTab === 'MERGE_REVIEWS' && (
        <CustomerMergeReviewScreen tenantId={tenantId} />
      )}

      {activeTab === 'CHANNELS' && (
        <ChannelAccountsScreen tenantId={tenantId} />
      )}
    </div>
  );
};
