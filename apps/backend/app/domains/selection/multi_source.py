"""
Multi-Source Document Intake & Data Understanding (PRD v2.2 Bagian 13.1 & 17.5)
Mendukung ekstraksi dari berbagai saluran masukan:
- Berkas Spreadsheet/CSV/JSON/PDF/Teks
- Prompt Teks Bebas OrchestreeAI
- Pesan Omnichannel (WhatsApp / Telegram) yang diteruskan eksplisit
- Integrasi Fabric / API / Database Query / MCP Tools
- Automatic Schema & Field Detection
- Data Completeness & Quality Scoring
- Deteksi Duplikasi Antar-Dokumen
"""

import csv
import io
import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("orchestree.selection.multi_source")


class MultiSourceExtractor:
    """Mengekstraksi entitas terstruktur dan metadata dari berbagai format sumber."""

    @staticmethod
    def parse_csv_or_tsv(content: str) -> List[Dict[str, Any]]:
        """Mengekstrak baris dari teks berformat CSV/TSV."""
        records = []
        try:
            # Deteksi delimiter (koma atau tab)
            delimiter = "\t" if "\t" in content.splitlines()[0] else ","
            reader = csv.DictReader(io.StringIO(content.strip()), delimiter=delimiter)
            for row in reader:
                clean_row = {str(k).strip(): str(v).strip() for k, v in row.items() if k is not None}
                if clean_row:
                    records.append(clean_row)
        except Exception as e:
            logger.warning(f"Gagal mem-parse CSV secara langsung: {e}")
        return records

    @staticmethod
    def parse_json_content(content: str) -> List[Dict[str, Any]]:
        """Mengekstrak list objek dari JSON."""
        records = []
        try:
            parsed = json.loads(content)
            if isinstance(parsed, list):
                records = [item for item in parsed if isinstance(item, dict)]
            elif isinstance(parsed, dict):
                # Cari kunci berulang seperti 'candidates', 'items', 'rows', 'data'
                for key in ["candidates", "items", "data", "rows", "prospects", "vendors", "results"]:
                    if key in parsed and isinstance(parsed[key], list):
                        records = [item for item in parsed[key] if isinstance(item, dict)]
                        break
                if not records:
                    records = [parsed]
        except Exception as e:
            logger.warning(f"Gagal mem-parse JSON secara langsung: {e}")
        return records

    @staticmethod
    def parse_prompt_entities(prompt_text: str) -> List[Dict[str, Any]]:
        """
        Mengekstrak entitas dari teks instruksi/prompt yang memuat daftar berpoin/bernomor.
        Mendeteksi pola nama, skor/kualifikasi, peran, atau deskripsi.
        """
        records = []
        lines = prompt_text.strip().splitlines()
        current_entity: Optional[Dict[str, Any]] = None

        item_pattern = re.compile(r"^(?:\d+[\.\)]|[-*•])\s+(.+)$")

        for line in lines:
            line_str = line.strip()
            if not line_str:
                continue

            match = item_pattern.match(line_str)
            if match:
                if current_entity:
                    records.append(current_entity)
                item_text = match.group(1).strip()
                # Ekstrak nama atau label sebelum colon atau dash
                parts = re.split(r"[:\-–—]\s*", item_text, maxsplit=1)
                entity_name = parts[0].strip()
                description = parts[1].strip() if len(parts) > 1 else item_text
                current_entity = {
                    "entity_label": entity_name,
                    "description": description,
                    "raw_text": item_text,
                }
            elif current_entity:
                # Lampirkan ke entitas yang sedang dibaca
                current_entity["description"] += " " + line_str
                current_entity["raw_text"] += "\n" + line_str

        if current_entity:
            records.append(current_entity)

        return records

    @classmethod
    def extract_entities_from_raw(cls, raw_text: str) -> List[Dict[str, Any]]:
        """Mencoba parsing CSV -> JSON -> Prompt List bertahap."""
        trimmed = raw_text.strip()
        if trimmed.startswith("{") or trimmed.startswith("["):
            json_res = cls.parse_json_content(trimmed)
            if json_res:
                return json_res

        if "\n" in trimmed and ("," in trimmed.splitlines()[0] or "\t" in trimmed.splitlines()[0]):
            csv_res = cls.parse_csv_or_tsv(trimmed)
            if len(csv_res) > 0:
                return csv_res

        prompt_res = cls.parse_prompt_entities(trimmed)
        if prompt_res:
            return prompt_res

        # Bila tidak ada pola khusus, jadikan 1 entitas tunggal
        return [{
            "entity_label": trimmed[:60],
            "description": trimmed,
            "raw_text": trimmed,
        }]

    @staticmethod
    def detect_schema_and_classification(record: Dict[str, Any]) -> Tuple[Dict[str, str], str]:
        """
        Automatic Schema & Field Detection.
        Mendeteksi tipe setiap atribut dan klasifikasi data (recruitment, tender, finance, leads, general).
        """
        detected_schema = {}
        keys_lower = [k.lower() for k in record.keys()]

        for k, v in record.items():
            if isinstance(v, (int, float)):
                detected_schema[k] = "numeric"
            elif isinstance(v, bool):
                detected_schema[k] = "boolean"
            elif isinstance(v, dict):
                detected_schema[k] = "nested_object"
            elif isinstance(v, list):
                detected_schema[k] = "array"
            else:
                str_val = str(v).strip()
                if re.match(r"^-?\d+(?:\.\d+)?$", str_val):
                    detected_schema[k] = "numeric_string"
                elif "@" in str_val and "." in str_val:
                    detected_schema[k] = "email"
                else:
                    detected_schema[k] = "text"

        # Tentukan klasifikasi konten
        def matches_any(keywords: List[str]) -> bool:
            return any(any(w in k for k in keys_lower) for w in keywords)

        if matches_any(["resume", "cv", "skill", "education", "experience", "candidate", "gpa", "portfolio"]):
            classification = "recruitment_talent"
        elif matches_any(["vendor", "supplier", "tender", "bid", "quotation", "procurement", "sla"]):
            classification = "supplier_procurement"
        elif matches_any(["revenue", "ebitda", "cashflow", "debt", "margin", "asset", "liability", "audit"]):
            classification = "financial_underwriting"
        elif matches_any(["lead", "deal", "mrr", "arr", "prospect", "pipeline", "icp", "company_size"]):
            classification = "sales_lead"
        else:
            classification = "general_evaluation"

        return detected_schema, classification

    @staticmethod
    def calculate_quality_score(record: Dict[str, Any]) -> float:
        """
        Data Completeness & Quality Analysis (0.00 - 100.00).
        Menghitung proporsi kelengkapan data dan ketebalan informasi.
        """
        if not record:
            return 0.0

        total_fields = len(record)
        filled_fields = 0
        text_volume = 0

        for k, v in record.items():
            if v is not None:
                val_str = str(v).strip()
                if val_str and val_str.lower() not in ["null", "none", "n/a", "-", ""]:
                    filled_fields += 1
                    text_volume += len(val_str)

        completeness_ratio = filled_fields / max(1, total_fields)
        volume_factor = min(1.0, text_volume / 200.0)

        # Bobot: 70% kelengkapan kolom, 30% volume informasi
        score = (completeness_ratio * 70.0) + (volume_factor * 30.0)
        return round(min(100.0, max(10.0, score)), 2)

    @staticmethod
    def detect_duplicate(
        current_entity_label: str,
        current_text: str,
        existing_docs: List[Dict[str, Any]]
    ) -> Optional[str]:
        """
        Mendeteksi dokumen duplikat berdasarkan kesamaan nama entitas atau teks.
        Mengembalikan ID dokumen terdahulu jika terdeteksi duplikat.
        """
        label_norm = current_entity_label.strip().lower()
        if not label_norm:
            return None

        for doc in existing_docs:
            doc_id = doc.get("id")
            existing_label = (doc.get("entity_label") or doc.get("raw_text_ref") or "").strip().lower()
            if existing_label and (existing_label == label_norm or (len(label_norm) > 4 and label_norm in existing_label)):
                return doc_id

            # Bandingkan kemiripan teks mentah bila identik
            existing_raw = (doc.get("raw_text_ref") or "").strip().lower()
            if current_text and existing_raw and len(current_text) > 20 and current_text.strip().lower() == existing_raw:
                return doc_id

        return None
