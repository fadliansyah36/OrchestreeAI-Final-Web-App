import React, { useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  Clock,
  Zap,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Info,
} from 'lucide-react';

export const RoiCalculatorSection: React.FC = () => {
  const [employeeCount, setEmployeeCount] = useState<number>(12);
  const [avgSalaryIdr, setAvgSalaryIdr] = useState<number>(6500000);
  const [repetitivePct, setRepetitivePct] = useState<number>(35);
  const [deptCount, setDeptCount] = useState<number>(4);

  // Calculations
  const workingHoursPerMonthPerEmployee = 160;
  const totalRepetitiveHours = Math.round(
    employeeCount * workingHoursPerMonthPerEmployee * (repetitivePct / 100)
  );

  const hourlyCost = avgSalaryIdr / workingHoursPerMonthPerEmployee;
  const monthlySavingsGross = Math.round(totalRepetitiveHours * hourlyCost * 0.75);
  const annualSavingsGross = monthlySavingsGross * 12;

  // Estimated Orchestree plan based on employee count
  let estimatedPlanCostMonthly = 1499000;
  if (employeeCount > 20) {
    estimatedPlanCostMonthly = 3499000;
  } else if (employeeCount <= 5) {
    estimatedPlanCostMonthly = 499000;
  }

  const netMonthlySavings = Math.max(0, monthlySavingsGross - estimatedPlanCostMonthly);
  const netRoiMultiplier = (monthlySavingsGross / estimatedPlanCostMonthly).toFixed(1);

  return (
    <section id="roi-calculator" className="py-24 bg-[#071226] text-white border-t border-white/10 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-white/5 border border-[#08B85C]/30 text-xs font-semibold text-[#08B85C] mb-4">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>INTERACTIVE ROI & EFFICIENCY CALCULATOR</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Berapa Banyak Operasional yang Bisa Dihemat dengan AI Workforce?
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-300">
            Gunakan kalkulator interaktif di bawah ini untuk menghitung jam kerja staf yang dapat dialihkan dari tugas repetitif ke inisiatif pertumbuhan strategis
          </p>
        </div>

        {/* Calculator Grid */}
        <div className="mt-14 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Col: Sliders */}
          <div className="lg:col-span-6 p-6 sm:p-8 rounded-3xl bg-white/[0.03] border border-white/10 space-y-6">
            <h3 className="text-lg font-bold text-white pb-3 border-b border-white/10">
              Parameter Organisasi Anda
            </h3>

            {/* Slider 1: Employee Count */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-300">Jumlah Karyawan Staf:</span>
                <span className="text-[#08B85C] font-mono font-bold text-sm">{employeeCount} Orang</span>
              </div>
              <input
                type="range"
                min={2}
                max={100}
                step={1}
                value={employeeCount}
                onChange={(e) => setEmployeeCount(Number(e.target.value))}
                className="w-full accent-[#08B85C] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>2 Staf</span>
                <span>50 Staf</span>
                <span>100+ Staf</span>
              </div>
            </div>

            {/* Slider 2: Average Salary */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-300">Rata-rata Gaji Staf per Bulan:</span>
                <span className="text-[#16B7D9] font-mono font-bold text-sm">
                  Rp {(avgSalaryIdr / 1000000).toFixed(1)} Juta
                </span>
              </div>
              <input
                type="range"
                min={3000000}
                max={25000000}
                step={500000}
                value={avgSalaryIdr}
                onChange={(e) => setAvgSalaryIdr(Number(e.target.value))}
                className="w-full accent-[#16B7D9] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>Rp 3 Juta</span>
                <span>Rp 12 Juta</span>
                <span>Rp 25 Juta</span>
              </div>
            </div>

            {/* Slider 3: Repetitive Tasks % */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-300">Porsi Tugas Repetitif / Admin:</span>
                <span className="text-amber-400 font-mono font-bold text-sm">{repetitivePct}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={60}
                step={5}
                value={repetitivePct}
                onChange={(e) => setRepetitivePct(Number(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>10% (Ringan)</span>
                <span>35% (Rata-rata)</span>
                <span>60% (Sangat Berat)</span>
              </div>
            </div>

            {/* Slider 4: Department Count */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-300">Jumlah Departemen Aktif:</span>
                <span className="text-purple-400 font-mono font-bold text-sm">{deptCount} Divisi</span>
              </div>
              <input
                type="range"
                min={1}
                max={8}
                step={1}
                value={deptCount}
                onChange={(e) => setDeptCount(Number(e.target.value))}
                className="w-full accent-purple-400 cursor-pointer"
              />
            </div>
          </div>

          {/* Right Col: Output Projection Card */}
          <div className="lg:col-span-6 p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-[#0B1835] via-[#071226] to-[#0B1835] border border-[#08B85C]/40 shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <span className="text-xs font-bold uppercase tracking-wider text-[#08B85C]">
                Hasil Proyeksi Efisiensi
              </span>
              <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-[#08B85C]/20 text-[#08B85C] font-bold">
                ROI Multiplier: {netRoiMultiplier}x
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                <span className="text-xs text-slate-400 block">Jam Kerja Dihemat</span>
                <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white mt-1">
                  {totalRepetitiveHours.toLocaleString('id-ID')} Jam
                </div>
                <span className="text-[10px] text-[#08B85C] mt-1 block">per bulan untuk seluruh tim</span>
              </div>

              <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                <span className="text-xs text-slate-400 block">Peningkatan Output</span>
                <div className="text-2xl sm:text-3xl font-extrabold font-mono text-[#16B7D9] mt-1">
                  +{(repetitivePct * 1.8).toFixed(0)}%
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">kecepatan throughput tugas</span>
              </div>
            </div>

            {/* Estimated Financial Savings */}
            <div className="p-5 rounded-2xl bg-[#08B85C]/10 border border-[#08B85C]/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">Estimasi Nilai Penghematan Bersih:</span>
                <span className="text-xs text-slate-400 font-mono">
                  (Biaya Paket Rp {(estimatedPlanCostMonthly / 1000).toLocaleString('id-ID')}rb)
                </span>
              </div>
              <div className="text-3xl sm:text-4xl font-extrabold text-[#08B85C] font-mono">
                Rp {monthlySavingsGross.toLocaleString('id-ID')}
                <span className="text-xs font-normal text-slate-400"> / bulan</span>
              </div>
              <div className="text-xs text-slate-300">
                Setara dengan <strong className="text-white font-bold">Rp {annualSavingsGross.toLocaleString('id-ID')}</strong> penghematan biaya operasional per tahun.
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#08B85C] via-[#16B7D9] to-[#1976E8] text-white font-bold text-sm shadow-xl hover:brightness-110 transition-all flex items-center justify-center space-x-2 cursor-pointer"
            >
              <span>Lihat Rincian Skema & Paket Investasi</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Disclaimer */}
            <div className="flex items-start space-x-2 text-[10px] text-slate-400 pt-2 border-t border-white/5">
              <Info className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
              <p>
                Kalkulator ini menyajikan simulasi estimasi rasional berdasarkan pengalihan jam kerja tugas administratif manual. Hasil aktual bervariasi bergantung pada intensitas pemanfaatan fitur di tiap organisasi.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
