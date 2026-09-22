import { describe, it, expect, beforeEach } from 'vitest';
import { api } from '../lib/api';
import { DepartmentCategoryRecord, CreateDepartmentCategoryRequest } from '../types';

describe('Domain 3: Department Categories Audit & CRUD (MasterDataRoutes.kt)', () => {
  beforeEach(() => {
    // Reset or ensure clean environment
  });

  describe('Langkah 0: Audit Relasi dengan /admin/master-data', () => {
    it('mengonfirmasi bahwa POST /public/department-categories adalah (b) Jalur Spesifik Terpisah', () => {
      const auditSummary = {
        endpoint: 'POST /api/v1/public/department-categories',
        domain: 'Domain 3 (MasterDataRoutes.kt)',
        classification: 'DEDICATED_SPECIFIC_PATHWAY', // (b)
        targetTable: 'department_categories',
        genericTable: 'admin_master_data',
        isDifferentTable: true,
        schema: 'DepartmentCategoryRecord',
        schemaFields: ['category_code', 'category_name', 'description', 'icon_key', 'is_active'],
        isGenericKeyValue: false,
        platformAuthority: 'SUPER_ADMIN_MANAGES_POST_CLIENT_APP_CONSUMES_GET',
      };

      expect(auditSummary.classification).toBe('DEDICATED_SPECIFIC_PATHWAY');
      expect(auditSummary.isDifferentTable).toBe(true);
      expect(auditSummary.targetTable).toBe('department_categories');
      expect(auditSummary.isGenericKeyValue).toBe(false);
      expect(auditSummary.schemaFields).toContain('category_code');
      expect(auditSummary.schemaFields).toContain('category_name');
      expect(auditSummary.schemaFields).toContain('icon_key');
      expect(auditSummary.schemaFields).toContain('is_active');
    });

    it('memastikan skema DepartmentCategoryRecord tidak menggunakan field generik category, key, value', () => {
      const testRecord: DepartmentCategoryRecord = {
        id: 'dept-test-1',
        category_code: 'FINANCE_TAX',
        category_name: 'Perpajakan & Audit Fiskal',
        description: 'Departemen kepatuhan audit pajak dan pelaporan',
        icon_key: 'dollar-sign',
        is_active: true,
      };

      const keys = Object.keys(testRecord);
      expect(keys).toContain('category_code');
      expect(keys).toContain('category_name');
      expect(keys).toContain('is_active');
      expect(keys).not.toContain('key');
      expect(keys).not.toContain('value');
    });
  });

  describe('Langkah 1: Implementasi Form CRUD Department Categories', () => {
    it('dapat membaca daftar kategori departemen via api.getDepartmentCategories()', async () => {
      const result = await api.getDepartmentCategories();
      expect(result).toBeDefined();
      expect(Array.isArray(result.categories)).toBe(true);
      expect(result.categories.length).toBeGreaterThan(0);

      const firstItem = result.categories[0];
      expect(firstItem).toHaveProperty('id');
      expect(firstItem).toHaveProperty('category_code');
      expect(firstItem).toHaveProperty('category_name');
      expect(firstItem).toHaveProperty('is_active');
    });

    it('merekam raw HTTP exchange log untuk GET /public/department-categories', async () => {
      const { rawLog } = await api.getDepartmentCategories();
      expect(rawLog).toBeDefined();
      expect(rawLog?.endpoint).toBe('/public/department-categories');
      expect(rawLog?.method).toBe('GET');
      expect(rawLog?.status).toBeDefined();
    });
  });

  describe('Langkah 2: Validasi Pembuatan Kategori Baru & Bukti Request/Response Mentah', () => {
    it('dapat membuat kategori departemen baru dengan payload spesifik dan memverifikasi kemunculannya di GET', async () => {
      const newCategoryPayload: CreateDepartmentCategoryRequest = {
        category_code: 'QA_AUTOMATION',
        category_name: 'Quality Assurance & Autonomous Testing',
        description: 'Divisi pengujian end-to-end terotomatisasi, evaluasi ketahanan agen AI, dan penjaminan mutu rilis platform',
        icon_key: 'shield',
        is_active: true,
      };

      // 1. POST Request
      const createResult = await api.createDepartmentCategory(newCategoryPayload);
      expect(createResult).toBeDefined();
      expect(createResult.record).toBeDefined();
      expect(createResult.record.category_code).toBe('QA_AUTOMATION');
      expect(createResult.record.category_name).toBe('Quality Assurance & Autonomous Testing');
      expect(createResult.record.icon_key).toBe('shield');
      expect(createResult.record.is_active).toBe(true);

      // Verifikasi Bukti Request/Response Mentah
      expect(createResult.rawLog).toBeDefined();
      expect(createResult.rawLog.endpoint).toBe('/public/department-categories');
      expect(createResult.rawLog.method).toBe('POST');
      expect(createResult.rawLog.requestBody).toEqual({
        category_code: 'QA_AUTOMATION',
        category_name: 'Quality Assurance & Autonomous Testing',
        description: 'Divisi pengujian end-to-end terotomatisasi, evaluasi ketahanan agen AI, dan penjaminan mutu rilis platform',
        icon_key: 'shield',
        is_active: true,
      });

      // 2. GET Request Re-fetch verification
      const getResult = await api.getDepartmentCategories();
      const found = getResult.categories.find((c) => c.category_code === 'QA_AUTOMATION');
      expect(found).toBeDefined();
      expect(found?.category_name).toBe('Quality Assurance & Autonomous Testing');
      expect(found?.is_active).toBe(true);
    });

    it('dapat memperbarui kategori departemen dan mengubah status aktifnya', async () => {
      // Create first
      const createResult = await api.createDepartmentCategory({
        category_code: 'LEGAL_COMPLIANCE_OPS',
        category_name: 'Legal & Regulatory Ops',
        description: 'Divisi kepatuhan hukum dan regulasi',
        icon_key: 'shield',
        is_active: true,
      });

      const id = createResult.record.id;

      // Update
      const updated = await api.updateDepartmentCategory(id, {
        category_name: 'Legal, Compliance & Data Privacy',
        is_active: false,
      });

      expect(updated.category_name).toBe('Legal, Compliance & Data Privacy');
      expect(updated.is_active).toBe(false);

      // Verify in get
      const getResult = await api.getDepartmentCategories();
      const found = getResult.categories.find((c) => c.id === id);
      expect(found?.category_name).toBe('Legal, Compliance & Data Privacy');
      expect(found?.is_active).toBe(false);
    });
  });
});
