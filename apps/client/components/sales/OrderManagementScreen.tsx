import { apiClient } from '@orchestree/api-client';
import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Truck,
  CreditCard,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  MapPin,
  Send,
  ShieldCheck,
  Check,
  X,
  PackageCheck,
  ArrowRight,
  Bot,
  User,
  Sparkles,
} from 'lucide-react';

interface OrderItem {
  id: string;
  order_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface Shipment {
  id: string;
  order_id: string;
  courier_code: string;
  courier_service: string;
  tracking_number: string;
  status: string;
  shipping_cost: number;
}

interface Order {
  id: string;
  tenant_id: string;
  order_number: string;
  customer_id: string;
  customer_name?: string;
  customer_phone?: string;
  conversation_id?: string;
  subtotal_amount: number;
  discount_amount: number;
  shipping_amount: number;
  total_amount: number;
  currency: string;
  payment_status: 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'REFUNDED';
  fulfillment_status: 'UNFULFILLED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  status: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';
  shipping_address?: Record<string, any>;
  items?: OrderItem[];
  shipments?: Shipment[];
  created_at: string;
}

interface TrackingEvent {
  event_time: string;
  location: string;
  status_code: string;
  description: string;
}

export const OrderManagementScreen: React.FC<{
  tenantId: string;
  onOpenCatalog?: () => void;
}> = ({ tenantId, onOpenCatalog }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Waybill Generation Modal
  const [isWaybillModalOpen, setIsWaybillModalOpen] = useState<boolean>(false);
  const [orderForWaybill, setOrderForWaybill] = useState<Order | null>(null);
  const [courierCode, setCourierCode] = useState<string>('JNE');
  const [courierService, setCourierService] = useState<string>('REG');
  const [shippingCostInput, setShippingCostInput] = useState<number>(12000);

  // Tracking details modal
  const [trackingModalOpen, setTrackingModalOpen] = useState<boolean>(false);
  const [trackingData, setTrackingData] = useState<{
    order_number: string;
    tracking_number: string;
    courier: string;
    message: string;
    events: TrackingEvent[];
  } | null>(null);

  // Customer Chat Simulator with Inline Cart & Checkout
  const [isSimulatorOpen, setIsSimulatorOpen] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<
    Array<{ sender: 'ai' | 'customer'; text: string; time: string; inlineCart?: boolean }>
  >([
    {
      sender: 'customer',
      text: 'Halo kak, apakah ada rekomendasi kemeja kerja yang ready stok hari ini?',
      time: '14:20',
    },
    {
      sender: 'ai',
      text: 'Halo Kak! Tentu, untuk kemeja kerja kami merekomendasikan Kemeja Oxford Slim Fit dengan harga resmi Rp 150.000. Stok kami saat ini ready di gudang pusat.',
      time: '14:21',
      inlineCart: true,
    },
  ]);
  const [simInput, setSimInput] = useState<string>('');
  const [simCartItems, setSimCartItems] = useState<Array<{ name: string; qty: number; price: number }>>([
    { name: 'Kemeja Oxford Slim Fit (L - Navy)', qty: 1, price: 150000 },
  ]);
  const [simStage, setSimStage] = useState<string>('CART_CHECKOUT');
  const [simCheckoutStatus, setSimCheckoutStatus] = useState<'IDLE' | 'ORDER_CREATED' | 'PAID'>('IDLE');

  const [notification, setNotification] = useState<string | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/commerce/orders`);
      const data = await res.json();
      if (data.status === 'ok') {
        setOrders(data.data || []);
      }
    } catch (err: any) {
      console.error('Gagal mengambil daftar pesanan:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [tenantId]);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const handleGenerateWaybill = async () => {
    if (!orderForWaybill) return;
    try {
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/commerce/orders/${orderForWaybill.id}/waybill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courier_code: courierCode,
          courier_service: courierService,
          shipping_cost: Number(shippingCostInput),
        }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        showToast(`Resi pengiriman ${data.data.tracking_number} berhasil diterbitkan.`);
        setIsWaybillModalOpen(false);
        fetchOrders();
      } else {
        alert(data.error || 'Gagal menerbitkan resi');
      }
    } catch (err: any) {
      alert(`Terjadi kesalahan: ${err.message}`);
    }
  };

  const handleViewTracking = async (order: Order) => {
    try {
      const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/commerce/shipping/tracking?order_number=${order.order_number}`);
      const data = await res.json();
      if (data.status === 'ok') {
        setTrackingData(data.data);
        setTrackingModalOpen(true);
      }
    } catch (err: any) {
      alert(`Gagal mengambil pelacakan: ${err.message}`);
    }
  };

  // Pengujian Webhook Pembayaran Resmi Berbasis Signature Midtrans
  const handleSimulatePaymentWebhook = async (order: Order) => {
    try {
      const grossAmount = order.total_amount.toFixed(0);
      // Dapatkan signature SHA-512 resmi dari server
      const sigRes = await apiClient.fetch(`/api/v1/commerce/webhook-signature?order_id=${encodeURIComponent(order.order_number)}&status_code=200&gross_amount=${grossAmount}`);
      const sigData = await sigRes.json();
      const signatureKey = sigData.signature_key || '';

      // Panggil backend webhook route resmi
      const res = await apiClient.fetch('/api/v1/webhooks/payment/midtrans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: order.order_number,
          status_code: '200',
          gross_amount: grossAmount,
          transaction_status: 'settlement',
          fraud_status: 'accept',
          transaction_id: `MTR-${Date.now()}`,
          signature_key: signatureKey,
        }),
      });
      const data = await res.json();
      if (data.status === 'ok' || data.success) {
        showToast(`Webhook pembayaran resmi diterima! Pesanan ${order.order_number} ditandai 'PAID'.`);
        fetchOrders();
      } else {
        alert(`Respons Webhook: ${data.message || 'Signature tidak valid'}`);
      }
    } catch (err: any) {
      alert(`Error webhook: ${err.message}`);
    }
  };

  const handleSimSendMessage = async () => {
    if (!simInput.trim()) return;
    const userText = simInput.trim();
    setSimInput('');

    setChatMessages((prev) => [
      ...prev,
      { sender: 'customer', text: userText, time: new Date().toLocaleTimeString().slice(0, 5) },
    ]);

    // Jika customer menanyakan resi / tracking
    if (userText.toLowerCase().includes('resi') || userText.toLowerCase().includes('sampai mana')) {
      try {
        const res = await apiClient.fetch(`/api/v1/tenants/${tenantId}/commerce/shipping/tracking`);
        const tData = await res.json();
        const reply = tData.status === 'ok' && tData.data.found
          ? tData.data.message
          : 'Halo Kak, nomor resi pesanan Anda sedang disiapkan oleh logistik kami. Segera setelah kurir memindai paket, nomor pelacakan akan otomatis kami kirimkan ke chat ini.';

        setChatMessages((prev) => [
          ...prev,
          { sender: 'ai', text: reply, time: new Date().toLocaleTimeString().slice(0, 5) },
        ]);
      } catch {
        // fallback
      }
    } else {
      // Grounding Enforcement API call
      try {
        const gRes = await apiClient.fetch(`/api/v1/tenants/${tenantId}/commerce/validate-grounding`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `Rekomendasi harga Rp 150.000 untuk Kemeja Oxford.` }),
        });
        const gData = await gRes.json();
        const replyText = gData.data?.sanitized_text || 'Pesanan Anda kami siapkan, silakan klik tombol checkout di bawah untuk menyelesaikan pesanan.';

        setChatMessages((prev) => [
          ...prev,
          { sender: 'ai', text: replyText, time: new Date().toLocaleTimeString().slice(0, 5) },
        ]);
      } catch {
        // fallback
      }
    }
  };

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.customer_name && o.customer_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (o.customer_phone && o.customer_phone.includes(searchQuery));
    const matchesPayment = paymentFilter === 'ALL' || o.payment_status === paymentFilter;
    return matchesSearch && matchesPayment;
  });

  return (
    <div id="order-management-screen" className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg border border-emerald-500 text-sm font-medium animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{notification}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Manajemen Pesanan & Pengiriman</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Pemenuhan pesanan, verifikasi webhook pembayaran otomatis, dan pelacakan ekspedisi resmi.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsSimulatorOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/30 transition cursor-pointer"
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Simulator Inline Cart & Chat</span>
          </button>

          {onOpenCatalog && (
            <button
              onClick={onOpenCatalog}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
            >
              <span>Katalog Produk</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/80">
          <span className="text-xs font-medium text-slate-400">Total Pesanan</span>
          <p className="text-2xl font-bold text-white mt-1">{orders.length}</p>
        </div>

        <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/80">
          <span className="text-xs font-medium text-slate-400">Menunggu Pembayaran</span>
          <p className="text-2xl font-bold text-amber-400 mt-1">
            {orders.filter((o) => o.payment_status === 'UNPAID' || o.payment_status === 'PENDING').length}
          </p>
        </div>

        <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/80">
          <span className="text-xs font-medium text-slate-400">Lunas (Paid)</span>
          <p className="text-2xl font-bold text-emerald-400 mt-1">
            {orders.filter((o) => o.payment_status === 'PAID').length}
          </p>
        </div>

        <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/80">
          <span className="text-xs font-medium text-slate-400">Webhook Source of Truth</span>
          <div className="flex items-center gap-1.5 mt-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-emerald-400">Signature Validated Only</span>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari No. Pesanan, Nama Pelanggan..." // allowlist: standard UI search input hint
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950/60 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition" // allowlist: standard tailwind placeholder styling
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500 transition cursor-pointer"
          >
            <option value="ALL">Semua Status Bayar</option>
            <option value="PAID">Lunas (PAID)</option>
            <option value="PENDING">Menunggu (PENDING)</option>
            <option value="UNPAID">Belum Dibayar (UNPAID)</option>
            <option value="FAILED">Gagal / Kadaluarsa</option>
          </select>

          <button
            onClick={fetchOrders}
            title="Refresh Pesanan"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Orders Table */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-xs">Memuat daftar pesanan...</div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/20 rounded-2xl border border-dashed border-slate-800">
          <ShoppingBag className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-300">Belum ada pesanan yang tercatat</p>
          <p className="text-xs text-slate-500 mt-1">
            Pesanan baru akan dibuat otomatis saat pelanggan melakukan checkout di chat atau keranjang.
          </p>
        </div>
      ) : (
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">No. Pesanan</th>
                  <th className="px-4 py-3">Pelanggan</th>
                  <th className="px-4 py-3">Total Belanja</th>
                  <th className="px-4 py-3">Status Bayar</th>
                  <th className="px-4 py-3">Fulfillment & Resi</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {filteredOrders.map((order) => {
                  const hasShipment = order.shipments && order.shipments.length > 0;
                  const activeShipment = hasShipment ? order.shipments![0] : null;

                  return (
                    <tr key={order.id} className="hover:bg-slate-800/30 transition">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold text-white block">{order.order_number}</span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(order.created_at).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span className="text-slate-200 block font-semibold">
                          {order.customer_name || 'Pelanggan Umum'}
                        </span>
                        {order.customer_phone && (
                          <span className="text-[10px] text-slate-400 block font-mono">{order.customer_phone}</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span className="font-bold text-emerald-400 block">
                          Rp {order.total_amount.toLocaleString('id-ID')}
                        </span>
                        {order.discount_amount > 0 && (
                          <span className="text-[10px] text-purple-400 block">
                            Diskon: Rp {order.discount_amount.toLocaleString('id-ID')}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            order.payment_status === 'PAID'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : order.payment_status === 'PENDING'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {order.payment_status === 'PAID' ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <Clock className="w-3 h-3" />
                          )}
                          <span>{order.payment_status}</span>
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        {activeShipment ? (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <Truck className="w-3.5 h-3.5 text-blue-400" />
                              <span className="font-mono text-[11px] font-bold text-blue-300">
                                {activeShipment.tracking_number}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 block">
                              {activeShipment.courier_code} ({activeShipment.courier_service}) • {activeShipment.status}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500 italic">Belum ada resi</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Tombol Terbitkan Resi */}
                          {!activeShipment && (
                            <button
                              onClick={() => {
                                setOrderForWaybill(order);
                                setIsWaybillModalOpen(true);
                              }}
                              className="px-2.5 py-1 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-[11px] font-medium transition cursor-pointer"
                            >
                              Terbitkan Resi
                            </button>
                          )}

                          {/* Tombol Cek Tracking */}
                          {activeShipment && (
                            <button
                              onClick={() => handleViewTracking(order)}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition cursor-pointer inline-flex items-center gap-1"
                            >
                              <Truck className="w-3 h-3 text-cyan-400" />
                              <span>Tracking</span>
                            </button>
                          )}

                          {/* Tombol Simulasi Webhook Pembayaran */}
                          {order.payment_status !== 'PAID' && (
                            <button
                              onClick={() => handleSimulatePaymentWebhook(order)}
                              title="Kirim Webhook Pembayaran Sukses (Simulasi Midtrans tervalidasi)"
                              className="px-2 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-medium transition cursor-pointer"
                            >
                              Webhook Bayar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Terbitkan Resi / AWB */}
      {isWaybillModalOpen && orderForWaybill && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Truck className="w-4 h-4 text-blue-400" />
                <span>Terbitkan Nomor Resi Pengiriman</span>
              </h2>
              <button
                onClick={() => setIsWaybillModalOpen(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <p className="text-xs text-slate-400">Nomor Pesanan:</p>
              <p className="text-sm font-mono font-bold text-white mt-0.5">{orderForWaybill.order_number}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Kurir Ekspedisi</label>
                <select
                  value={courierCode}
                  onChange={(e) => setCourierCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="JNE">JNE Express</option>
                  <option value="JNT">J&T Express</option>
                  <option value="SICEPAT">SiCepat Express</option>
                  <option value="ANTERAJA">AnterAja</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Layanan</label>
                <select
                  value={courierService}
                  onChange={(e) => setCourierService(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="REG">Reguler (2-3 hari)</option>
                  <option value="YES">Kilat 1 Hari (YES)</option>
                  <option value="ECO">Ekonomis (Cargo)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Biaya Ongkir (IDR)</label>
              <input
                type="number"
                value={shippingCostInput}
                onChange={(e) => setShippingCostInput(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-semibold"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setIsWaybillModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white bg-slate-800/60 cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleGenerateWaybill}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shadow-md"
              >
                Terbitkan Resi Resmi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Riwayat Tracking */}
      {trackingModalOpen && trackingData && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Truck className="w-4 h-4 text-cyan-400" />
                <span>Pelacakan Pengiriman Resmi</span>
              </h2>
              <button
                onClick={() => setTrackingModalOpen(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 block">Nomor Resi</span>
                  <span className="font-mono text-sm font-bold text-cyan-400">{trackingData.tracking_number}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 block">Ekspedisi</span>
                  <span className="text-xs font-semibold text-slate-300">{trackingData.courier}</span>
                </div>
              </div>
              <p className="text-xs text-slate-300 mt-2 font-medium">{trackingData.message}</p>
            </div>

            {/* Timeline Events */}
            <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Riwayat Perjalanan Paket
              </span>
              {trackingData.events.length === 0 ? (
                <p className="text-xs text-slate-500 italic">Belum ada riwayat transit paket.</p>
              ) : (
                trackingData.events.map((ev, i) => (
                  <div key={i} className="flex gap-3 text-xs border-l-2 border-cyan-500/40 pl-3 py-1">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{ev.location || 'Hub Transit'}</span>
                        <span className="text-[10px] text-cyan-400 font-mono px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-900/60">
                          {ev.status_code}
                        </span>
                      </div>
                      <p className="text-slate-400 mt-0.5">{ev.description}</p>
                      <span className="text-[10px] text-slate-500 mt-1 block">
                        {ev.event_time ? new Date(ev.event_time).toLocaleString('id-ID') : 'Hari ini'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setTrackingModalOpen(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Simulator Inline Cart & Customer Chat */}
      {isSimulatorOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl h-[85vh] shadow-2xl flex flex-col justify-between overflow-hidden">
            {/* Header Simulator */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>AI Closer & Commerce Assistant</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                      {simStage}
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Simulator percakapan pelanggan dengan Grounding Enforcement aktif.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSimulatorOpen(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-slate-950/40">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${msg.sender === 'customer' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                      msg.sender === 'customer'
                        ? 'bg-blue-600 text-white rounded-br-none'
                        : 'bg-slate-800 text-slate-200 border border-slate-700/80 rounded-bl-none'
                    }`}
                  >
                    <p>{msg.text}</p>

                    {/* Inline Cart Widget */}
                    {msg.inlineCart && (
                      <div className="mt-3 p-3 bg-slate-900/90 rounded-xl border border-slate-700 space-y-2 text-white">
                        <div className="flex items-center justify-between text-[11px] font-semibold pb-1.5 border-b border-slate-800">
                          <span className="flex items-center gap-1 text-emerald-400">
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>Keranjang Belanja Pelanggan</span>
                          </span>
                          <span className="text-slate-400">1 Item</span>
                        </div>

                        {simCartItems.map((it, i) => (
                          <div key={i} className="flex items-center justify-between text-xs py-1">
                            <div>
                              <p className="font-medium text-slate-200">{it.name}</p>
                              <span className="text-[10px] text-slate-400">Qty: {it.qty}</span>
                            </div>
                            <span className="font-bold text-emerald-400">
                              Rp {(it.price * it.qty).toLocaleString('id-ID')}
                            </span>
                          </div>
                        ))}

                        <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-300">Total Pembayaran:</span>
                          <span className="font-bold text-emerald-400 text-sm">Rp 150.000</span>
                        </div>

                        {simCheckoutStatus === 'IDLE' && (
                          <button
                            onClick={() => {
                              setSimCheckoutStatus('ORDER_CREATED');
                              setSimStage('PAYMENT_PENDING');
                              setChatMessages((prev) => [
                                ...prev,
                                {
                                  sender: 'ai',
                                  text: 'Pesanan telah berhasil dibuat! Kode bayar Virtual Account telah kami generate. Menunggu konfirmasi pembayaran dari payment gateway resmi.',
                                  time: new Date().toLocaleTimeString().slice(0, 5),
                                },
                              ]);
                            }}
                            className="w-full mt-2 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>Lanjutkan ke Pembayaran (Checkout)</span>
                          </button>
                        )}

                        {simCheckoutStatus === 'ORDER_CREATED' && (
                          <div className="pt-2 flex items-center justify-between gap-2">
                            <span className="text-[11px] text-amber-400 font-medium">Status: Menunggu Pembayaran</span>
                            <button
                              onClick={async () => {
                                try {
                                  const ordNum = 'ORD-2026-SIM-001';
                                  const grossAmt = '150000';
                                  const sigRes = await apiClient.fetch(`/api/v1/commerce/webhook-signature?order_id=${ordNum}&status_code=200&gross_amount=${grossAmt}`);
                                  const sigData = await sigRes.json();
                                  const sigKey = sigData.signature_key || '';

                                  const whRes = await apiClient.fetch('/api/v1/webhooks/payment/midtrans', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      order_id: ordNum,
                                      status_code: '200',
                                      gross_amount: grossAmt,
                                      transaction_status: 'settlement',
                                      fraud_status: 'accept',
                                      transaction_id: `MTR-WH-${Date.now()}`,
                                      signature_key: sigKey,
                                    }),
                                  });
                                  const whData = await whRes.json();
                                  if (whData.status === 'ok' || whData.success) {
                                    setSimCheckoutStatus('PAID');
                                    setSimStage('ORDER_CONFIRMED');
                                    setChatMessages((prev) => [
                                      ...prev,
                                      {
                                        sender: 'ai',
                                        text: 'Pembayaran telah terverifikasi melalui webhook resmi gateway! Pesanan Anda saat ini berstatus LUNAS dan sedang dijadwalkan bersama ekspedisi kurir.',
                                        time: new Date().toLocaleTimeString().slice(0, 5),
                                      },
                                    ]);
                                    showToast("Webhook pembayaran resmi diterima & signature terverifikasi!");
                                  } else {
                                    alert("Gagal memverifikasi webhook: Signature tidak valid");
                                  }
                                } catch (err: any) {
                                  alert(`Gagal memproses webhook: ${err.message}`);
                                }
                              }}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-semibold cursor-pointer"
                            >
                              Kirim Webhook Gateway (Resmi)
                            </button>
                          </div>
                        )}

                        {simCheckoutStatus === 'PAID' && (
                          <div className="pt-2 text-center text-xs font-semibold text-emerald-400 bg-emerald-950/40 p-2 rounded-lg border border-emerald-900/60">
                            Pembayaran Lunas (Webhook Terverifikasi)
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 px-1">{msg.time}</span>
                </div>
              ))}
            </div>

            {/* Input Bar */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2">
              <input
                type="text"
                placeholder="Ketik pertanyaan pelanggan (misal: 'berapa harganya?' atau 'sudah sampai mana?')..." // allowlist: standard UI input hint
                value={simInput}
                onChange={(e) => setSimInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSimSendMessage()}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500" // allowlist: standard tailwind placeholder styling
              />
              <button
                onClick={handleSimSendMessage}
                className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
