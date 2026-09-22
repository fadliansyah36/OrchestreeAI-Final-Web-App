import React, { useState, useEffect } from 'react';
import {
  Package,
  Plus,
  Search,
  Tag,
  Layers,
  Edit2,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Percent,
  RefreshCw,
  Box,
  DollarSign,
  ArrowRight,
  Filter,
  X,
  SlidersHorizontal,
} from 'lucide-react';

interface Variant {
  id?: string;
  variant_sku: string;
  variant_name: string;
  attributes?: Record<string, any>;
  price_override?: number;
}

interface Product {
  id: string;
  tenant_id: string;
  sku: string;
  name: string;
  description?: string;
  category: string;
  base_price: number;
  currency: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' | 'OUT_OF_STOCK';
  image_url?: string;
  quantity_available?: number;
  quantity_reserved?: number;
  variants?: Variant[];
  created_at: string;
}

interface Promotion {
  id: string;
  code: string;
  name: string;
  discount_type: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING';
  discount_value: number;
  min_order_amount: number;
  is_active: boolean;
}

export const ProductCatalogScreen: React.FC<{
  tenantId: string;
  onOpenOrders?: () => void;
}> = ({ tenantId, onOpenOrders }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isPromoModalOpen, setIsPromoModalOpen] = useState<boolean>(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState<boolean>(false);
  const [stockToUpdate, setStockToUpdate] = useState<{ id: string; name: string; current: number }>({
    id: '',
    name: '',
    current: 0,
  });
  const [newStockVal, setNewStockVal] = useState<number>(0);

  // Form states for New Product
  const [formSku, setFormSku] = useState('');
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCategory, setFormCategory] = useState('Pakaian & Aksesoris');
  const [formPrice, setFormPrice] = useState<number>(150000);
  const [formStock, setFormStock] = useState<number>(25);
  const [formVariants, setFormVariants] = useState<Array<{ variant_sku: string; variant_name: string; price_override?: number }>>([]);
  const [varSkuInput, setVarSkuInput] = useState('');
  const [varNameInput, setVarNameInput] = useState('');

  // Form states for New Promotion
  const [promoCode, setPromoCode] = useState('');
  const [promoName, setPromoName] = useState('');
  const [promoType, setPromoType] = useState<'PERCENTAGE' | 'FIXED_AMOUNT'>('PERCENTAGE');
  const [promoVal, setPromoVal] = useState<number>(10);
  const [promoMinOrder, setPromoMinOrder] = useState<number>(100000);

  const [notification, setNotification] = useState<string | null>(null);

  const fetchCatalogData = async () => {
    setLoading(true);
    try {
      const pRes = await fetch(`/api/v1/tenants/${tenantId}/commerce/products`);
      const pData = await pRes.json();
      if (pData.status === 'ok') {
        setProducts(pData.data || []);
      }

      const prRes = await fetch(`/api/v1/tenants/${tenantId}/commerce/promotions`);
      const prData = await prRes.json();
      if (prData.status === 'ok') {
        setPromotions(prData.data || []);
      }
    } catch (err: any) {
      console.error('Gagal mengambil data katalog:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalogData();
  }, [tenantId]);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/commerce/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: formSku.trim().toUpperCase(),
          name: formName.trim(),
          description: formDesc.trim(),
          category: formCategory,
          base_price: Number(formPrice),
          initial_stock: Number(formStock),
          variants: formVariants,
        }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        showToast(`Produk '${formName}' berhasil ditambahkan ke katalog.`);
        setIsAddModalOpen(false);
        // Reset form
        setFormSku('');
        setFormName('');
        setFormDesc('');
        setFormVariants([]);
        fetchCatalogData();
      } else {
        alert(data.error || 'Gagal menyimpan produk.');
      }
    } catch (err: any) {
      alert(`Terjadi kesalahan: ${err.message}`);
    }
  };

  const handleUpdateStock = async () => {
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/commerce/products/${stockToUpdate.id}/stock`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: Number(newStockVal) }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        showToast(`Stok untuk '${stockToUpdate.name}' berhasil diperbarui ke ${newStockVal} unit.`);
        setIsStockModalOpen(false);
        fetchCatalogData();
      }
    } catch (err: any) {
      alert(`Gagal memperbarui stok: ${err.message}`);
    }
  };

  const handleCreatePromotion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/commerce/promotions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: promoCode.trim().toUpperCase(),
          name: promoName.trim(),
          discount_type: promoType,
          discount_value: Number(promoVal),
          min_order_amount: Number(promoMinOrder),
        }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        showToast(`Kupon promosi '${promoCode.toUpperCase()}' aktif.`);
        setIsPromoModalOpen(false);
        setPromoCode('');
        setPromoName('');
        fetchCatalogData();
      }
    } catch (err: any) {
      alert(`Gagal membuat kupon promo: ${err.message}`);
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div id="product-catalog-screen" className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg border border-emerald-500 text-sm font-medium animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{notification}</span>
        </div>
      )}

      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Katalog Produk & Inventori</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Katalog resmi tersinkronisasi basis data Supabase Postgres dengan Grounding AI aktif.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsPromoModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
          >
            <Tag className="w-3.5 h-3.5 text-purple-400" />
            <span>Kupon Promo ({promotions.length})</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Produk</span>
          </button>

          {onOpenOrders && (
            <button
              onClick={onOpenOrders}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 transition cursor-pointer"
            >
              <span>Pesanan Pelanggan</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter and stats banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Produk</span>
            <Box className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{products.length}</p>
        </div>

        <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Tersedia (Ready)</span>
            <CheckCircle2 className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">
            {products.filter((p) => p.status === 'ACTIVE' && (p.quantity_available || 0) > 0).length}
          </p>
        </div>

        <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Stok Habis</span>
            <AlertCircle className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-bold text-rose-400 mt-2">
            {products.filter((p) => p.status === 'OUT_OF_STOCK' || (p.quantity_available || 0) <= 0).length}
          </p>
        </div>

        <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Grounding AI</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-sm font-semibold text-emerald-400">100% Terverifikasi DB</span>
          </div>
        </div>
      </div>

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari SKU, nama produk, kategori..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950/60 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 transition cursor-pointer"
          >
            <option value="ALL">Semua Status</option>
            <option value="ACTIVE">Aktif (Tersedia)</option>
            <option value="OUT_OF_STOCK">Stok Habis</option>
            <option value="INACTIVE">Nonaktif</option>
          </select>

          <button
            onClick={fetchCatalogData}
            title="Muat ulang data"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Product List Grid */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-xs">Memuat katalog produk resmi...</div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/20 rounded-2xl border border-dashed border-slate-800">
          <Package className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-300">Belum ada produk ditemukan</p>
          <p className="text-xs text-slate-500 mt-1">Tambahkan produk pertama atau ubah kata kunci pencarian Anda.</p>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="mt-4 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Produk Sekarang</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((product) => {
            const stock = product.quantity_available || 0;
            const isOutOfStock = stock <= 0 || product.status === 'OUT_OF_STOCK';

            return (
              <div
                key={product.id}
                className="bg-slate-900/60 rounded-xl border border-slate-800/80 hover:border-slate-700 p-4 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-semibold">
                        {product.sku}
                      </span>
                      <h3 className="text-sm font-semibold text-white mt-1.5 line-clamp-1">{product.name}</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">{product.category}</p>
                    </div>

                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        isOutOfStock
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}
                    >
                      {isOutOfStock ? 'Stok Habis' : 'Aktif'}
                    </span>
                  </div>

                  {product.description && (
                    <p className="text-xs text-slate-400 mt-2 line-clamp-2">{product.description}</p>
                  )}

                  {/* Varian badges */}
                  {product.variants && product.variants.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {product.variants.map((v, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] bg-slate-800/80 text-slate-300 px-2 py-0.5 rounded border border-slate-700/60"
                        >
                          {v.variant_name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Harga Dasar</span>
                    <span className="text-sm font-bold text-emerald-400">
                      Rp {product.base_price.toLocaleString('id-ID')}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 block">Stok Realtime</span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-xs font-bold ${
                          isOutOfStock ? 'text-rose-400' : stock < 10 ? 'text-amber-400' : 'text-slate-200'
                        }`}
                      >
                        {stock} unit
                      </span>
                      <button
                        onClick={() => {
                          setStockToUpdate({ id: product.id, name: product.name, current: stock });
                          setNewStockVal(stock);
                          setIsStockModalOpen(true);
                        }}
                        title="Perbarui Stok"
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Tambah Produk Baru */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Package className="w-4 h-4 text-emerald-400" />
                <span>Tambah Produk Baru ke Katalog</span>
              </h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">SKU Produk *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: KEMEJA-01"
                    value={formSku}
                    onChange={(e) => setFormSku(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">Kategori</label>
                  <input
                    type="text"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Nama Produk *</label>
                <input
                  type="text"
                  required
                  placeholder="Nama produk lengkap..."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Deskripsi Singkat</label>
                <textarea
                  rows={2}
                  placeholder="Informasi detail bahan, ukuran, keunggulan..."
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">Harga Dasar (IDR) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={1000}
                    value={formPrice}
                    onChange={(e) => setFormPrice(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-semibold focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">Stok Awal Gudang *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={formStock}
                    onChange={(e) => setFormStock(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-semibold focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Varian Dinamis */}
              <div className="pt-2 border-t border-slate-800">
                <span className="text-xs font-semibold text-slate-300 block mb-2">Varian Produk (Opsional)</span>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="SKU Varian (misal: KMJ-01-L)"
                    value={varSkuInput}
                    onChange={(e) => setVarSkuInput(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Nama Varian (misal: Ukuran L - Hitam)"
                    value={varNameInput}
                    onChange={(e) => setVarNameInput(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (varSkuInput && varNameInput) {
                        setFormVariants([...formVariants, { variant_sku: varSkuInput, variant_name: varNameInput }]);
                        setVarSkuInput('');
                        setVarNameInput('');
                      }
                    }}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    +
                  </button>
                </div>

                {formVariants.length > 0 && (
                  <div className="space-y-1">
                    {formVariants.map((v, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-[11px] bg-slate-950 px-2.5 py-1 rounded border border-slate-800 text-slate-300"
                      >
                        <span className="font-mono text-emerald-400">{v.variant_sku}</span>
                        <span>{v.variant_name}</span>
                        <button
                          type="button"
                          onClick={() => setFormVariants(formVariants.filter((_, idx) => idx !== i))}
                          className="text-rose-400 hover:text-rose-300"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white bg-slate-800/60 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-md"
                >
                  Simpan Produk
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Update Stok Cepat */}
      {isStockModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-emerald-400" />
                <span>Perbarui Stok Gudang</span>
              </h2>
              <button
                onClick={() => setIsStockModalOpen(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <p className="text-xs text-slate-400">Produk:</p>
              <p className="text-sm font-semibold text-white mt-0.5">{stockToUpdate.name}</p>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Jumlah Stok Tersedia (Unit)</label>
              <input
                type="number"
                min={0}
                value={newStockVal}
                onChange={(e) => setNewStockVal(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white font-bold focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Bila stok diatur ke 0, status produk otomatis menjadi 'OUT_OF_STOCK' dan AI Closer dilarang menawarkannya.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsStockModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white bg-slate-800/60 cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleUpdateStock}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-md"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Kupon Promosi */}
      {isPromoModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Tag className="w-4 h-4 text-purple-400" />
                <span>Kelola Kupon Promosi</span>
              </h2>
              <button
                onClick={() => setIsPromoModalOpen(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List Promosi Aktif */}
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Kupon Aktif Saat Ini
              </span>
              {promotions.length === 0 ? (
                <p className="text-xs text-slate-500">Belum ada kupon promosi aktif.</p>
              ) : (
                promotions.map((pr) => (
                  <div
                    key={pr.id}
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-mono text-xs font-bold text-purple-400">{pr.code}</span>
                      <p className="text-[11px] text-slate-400 mt-0.5">{pr.name}</p>
                    </div>
                    <span className="text-xs font-semibold text-emerald-400">
                      {pr.discount_type === 'PERCENTAGE'
                        ? `${pr.discount_value}%`
                        : `Rp ${pr.discount_value.toLocaleString('id-ID')}`}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Form Tambah Kupon */}
            <form onSubmit={handleCreatePromotion} className="pt-3 border-t border-slate-800 space-y-3">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Buat Kupon Baru
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-300 block mb-0.5">Kode Kupon *</label>
                  <input
                    type="text"
                    required
                    placeholder="DISKON10"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-300 block mb-0.5">Tipe Diskon</label>
                  <select
                    value={promoType}
                    onChange={(e) => setPromoType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300"
                  >
                    <option value="PERCENTAGE">Persentase (%)</option>
                    <option value="FIXED_AMOUNT">Potongan Tetap (Rp)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-300 block mb-0.5">Nama Promosi *</label>
                <input
                  type="text"
                  required
                  placeholder="Promo Gajian Spesial"
                  value={promoName}
                  onChange={(e) => setPromoName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-300 block mb-0.5">Nilai Diskon *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={promoVal}
                    onChange={(e) => setPromoVal(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white font-semibold"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-300 block mb-0.5">Min. Belanja (Rp)</label>
                  <input
                    type="number"
                    min={0}
                    value={promoMinOrder}
                    onChange={(e) => setPromoMinOrder(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPromoModalOpen(false)}
                  className="px-3 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-white bg-slate-800/60 cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  className="px-4 py-1 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white cursor-pointer shadow-md"
                >
                  Terbitkan Kupon
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
