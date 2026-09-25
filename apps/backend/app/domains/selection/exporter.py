"""
Universal AI Selection Report & Document Exporter (PRD v2.2 Bagian 13.1 & 17.5)
Menghasilkan dokumen laporan nyata dalam format CSV, Excel (.xlsx), dan PDF
tanpa dependensi eksternal, kompatibel penuh dengan standar dokumen internasional.
"""

import io
import csv
import json
import zipfile
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


class SelectionReportExporter:
    """Mesin pengekspor dokumen laporan seleksi cerdas."""

    @classmethod
    def generate_csv(
        cls,
        job_info: Dict[str, Any],
        results: List[Dict[str, Any]],
        report_type: str = "detailed_selection",
    ) -> bytes:
        """Menghasilkan berkas CSV standar RFC 4180 dengan UTF-8 BOM."""
        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

        # Header metadata pekerjaan
        writer.writerow(["LAPORAN SELEKSI CERDAS - ORCHESTREE.AI"])
        writer.writerow(["Judul Pekerjaan", job_info.get("title", "-")])
        writer.writerow(["Kategori Domain", job_info.get("domain_category", "general")])
        writer.writerow(["Status Pipeline", job_info.get("pipeline_stage", "completed")])
        writer.writerow(["Waktu Ekspor", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")])
        writer.writerow([])

        if report_type == "executive_summary":
            writer.writerow(["RINGKASAN EKSEKUTIF KANDIDAT"])
            writer.writerow(["Peringkat", "Nama Entitas", "Skor Akhir", "Rekomendasi", "Tingkat Risiko", "Keputusan Akhir"])
            for res in results:
                writer.writerow([
                    res.get("rank_position", "-"),
                    res.get("entity_label", "-"),
                    f"{res.get('total_score', 0):.2f}",
                    res.get("recommendation_classification", "-").upper(),
                    f"{res.get('risk_score', 0):.1f}%" if res.get("risk_score") is not None else "-",
                    res.get("decision_status", "pending").upper(),
                ])
        else:
            # Detailed selection & ranking analytics
            criteria = job_info.get("criteria", [])
            crit_headers = [c.get("label", c.get("key", "Kriteria")) for c in criteria]

            base_headers = [
                "Peringkat",
                "Nama Entitas / Dokumen",
                "Skor Total",
                "Klasifikasi Rekomendasi",
                "Prioritas",
                "Skor Risiko (%)",
                "Tingkat Keyakinan AI (%)",
                "Status Keputusan",
                "Catatan Tinjauan Manusia",
            ]
            all_headers = base_headers + crit_headers
            writer.writerow(all_headers)

            for res in results:
                breakdown = res.get("score_breakdown", {})
                crit_vals = [f"{breakdown.get(c.get('key'), 0):.1f}" for c in criteria]

                row_vals = [
                    res.get("rank_position", "-"),
                    res.get("entity_label", "-"),
                    f"{res.get('total_score', 0):.2f}",
                    res.get("recommendation_classification", "-").upper(),
                    res.get("priority_level", "-").upper(),
                    f"{res.get('risk_score', 0):.1f}" if res.get("risk_score") is not None else "-",
                    f"{res.get('confidence_score', 0):.1f}" if res.get("confidence_score") is not None else "-",
                    res.get("decision_status", "pending").upper(),
                    res.get("reviewer_notes", "-") or "-",
                ] + crit_vals
                writer.writerow(row_vals)

        # Encode with UTF-8 BOM so Excel opens cleanly
        return output.getvalue().encode("utf-8-sig")

    @classmethod
    def generate_excel_xlsx(
        cls,
        job_info: Dict[str, Any],
        results: List[Dict[str, Any]],
        report_type: str = "detailed_selection",
    ) -> bytes:
        """
        Menghasilkan berkas Excel (.xlsx) murni OpenXML tanpa dependensi eksternal.
        Mencakup metadata, tabel ringkasan, dan pemecahan skor per kriteria.
        """
        buf = io.BytesIO()

        # Bangun XML untuk sheet1
        rows_xml = []
        row_idx = 1

        def add_row(cells: List[str], bold: bool = False):
            nonlocal row_idx
            c_xml = []
            for col_idx, val in enumerate(cells, start=1):
                col_letter = chr(64 + col_idx) if col_idx <= 26 else f"A{chr(64 + col_idx - 26)}"
                cell_ref = f"{col_letter}{row_idx}"
                # Escape XML
                escaped = (
                    str(val)
                    .replace("&", "&amp;")
                    .replace("<", "&lt;")
                    .replace(">", "&gt;")
                )
                style_attr = ' s="1"' if bold else ''
                c_xml.append(f'<c r="{cell_ref}" t="inlineStr"{style_attr}><is><t>{escaped}</t></is></c>')
            rows_xml.append(f'<row r="{row_idx}">{"".join(c_xml)}</row>')
            row_idx += 1

        add_row(["LAPORAN SELEKSI CERDAS - ORCHESTREE.AI"], bold=True)
        add_row([f"Judul Pekerjaan: {job_info.get('title', '-')}"], bold=False)
        add_row([f"Kategori Domain: {job_info.get('domain_category', 'general')}"], bold=False)
        add_row([f"Tanggal Ekspor: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}"], bold=False)
        add_row([])

        # Header tabel
        criteria = job_info.get("criteria", [])
        crit_headers = [c.get("label", c.get("key", "Kriteria")) for c in criteria]
        headers = [
            "Peringkat",
            "Entitas / Kandidat",
            "Skor Total",
            "Rekomendasi",
            "Prioritas",
            "Risiko (%)",
            "Keyakinan AI (%)",
            "Status Tinjauan",
            "Catatan Reviewer",
        ] + crit_headers
        add_row(headers, bold=True)

        for res in results:
            breakdown = res.get("score_breakdown", {})
            crit_vals = [f"{breakdown.get(c.get('key'), 0):.1f}" for c in criteria]
            row_data = [
                str(res.get("rank_position", "-")),
                str(res.get("entity_label", "-")),
                f"{res.get('total_score', 0):.2f}",
                str(res.get("recommendation_classification", "-")).upper(),
                str(res.get("priority_level", "-")).upper(),
                f"{res.get('risk_score', 0):.1f}%" if res.get("risk_score") is not None else "-",
                f"{res.get('confidence_score', 0):.1f}%" if res.get("confidence_score") is not None else "-",
                str(res.get("decision_status", "pending")).upper(),
                str(res.get("reviewer_notes") or "-"),
            ] + crit_vals
            add_row(row_data, bold=False)

        sheet_xml = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\n'
            '<sheetData>\n'
            + "\n".join(rows_xml)
            + '\n</sheetData>\n'
            '</worksheet>'
        )

        content_types = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n'
            '<Default Extension="xml" ContentType="application/xml"/>\n'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>\n'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>\n'
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>\n'
            '</Types>'
        )

        root_rels = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>\n'
            '</Relationships>'
        )

        wb_xml = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n'
            '<sheets>\n'
            '<sheet name="Hasil Seleksi" sheetId="1" r:id="rId1"/>\n'
            '</sheets>\n'
            '</workbook>'
        )

        wb_rels = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>\n'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>\n'
            '</Relationships>'
        )

        styles_xml = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\n'
            '<fonts count="2">\n'
            '<font><sz val="11"/><name val="Calibri"/></font>\n'
            '<font><b/><sz val="11"/><name val="Calibri"/></font>\n'
            '</fonts>\n'
            '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>\n'
            '<borders count="1"><border/></borders>\n'
            '<cellXfs count="2">\n'
            '<xf fontId="0" fillId="0" borderId="0"/>\n'
            '<xf fontId="1" fillId="0" borderId="0" applyFont="1"/>\n'
            '</cellXfs>\n'
            '</styleSheet>'
        )

        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("[Content_Types].xml", content_types)
            z.writestr("_rels/.rels", root_rels)
            z.writestr("xl/workbook.xml", wb_xml)
            z.writestr("xl/_rels/workbook.xml.rels", wb_rels)
            z.writestr("xl/worksheets/sheet1.xml", sheet_xml)
            z.writestr("xl/styles.xml", styles_xml)

        return buf.getvalue()

    @classmethod
    def generate_pdf(
        cls,
        job_info: Dict[str, Any],
        results: List[Dict[str, Any]],
        insights: Optional[List[Dict[str, Any]]] = None,
        report_type: str = "detailed_selection",
    ) -> bytes:
        """
        Menghasilkan berkas PDF 1.4 standar yang valid tanpa pustaka eksternal.
        Mencakup Header Resmi, Ringkasan Eksekutif, Tabel Peringkat, dan Rekomendasi AI.
        """
        title = job_info.get("title", "Laporan Seleksi AI")
        domain = job_info.get("domain_category", "general").upper()
        now_str = datetime.now(timezone.utc).strftime("%d %b %Y %H:%M UTC")

        # Susun baris teks untuk stream PDF
        lines = [
            ("TITLE", f"ORCHESTREE.AI - LAPORAN SELEKSI CERDAS ({domain})"),
            ("TEXT", f"Judul Pekerjaan: {title}"),
            ("TEXT", f"Waktu Analisis: {now_str} | Status: {job_info.get('pipeline_stage', 'completed').upper()}"),
            ("TEXT", "-" * 85),
            ("SECTION", "1. RINGKASAN PERINGKAT DAN EVALUASI ENTITAS"),
        ]

        # Format tabel peringkat
        header_line = f"{'Rank':<6}{'Entitas / Kandidat':<28}{'Skor':<10}{'Rekomendasi':<16}{'Risiko':<10}{'Status':<12}"
        lines.append(("HEADER", header_line))
        lines.append(("TEXT", "-" * 85))

        for res in results[:20]:
            rank = f"#{res.get('rank_position', '-')}"
            name = (res.get("entity_label", "-"))[:26]
            score = f"{res.get('total_score', 0):.2f}"
            rec = str(res.get("recommendation_classification", "-")).upper()
            risk = f"{res.get('risk_score', 0):.1f}%" if res.get("risk_score") is not None else "-"
            status_text = str(res.get("decision_status", "pending")).upper()

            row_str = f"{rank:<6}{name:<28}{score:<10}{rec:<16}{risk:<10}{status_text:<12}"
            lines.append(("ROW", row_str))

        if insights:
            lines.append(("TEXT", "-" * 85))
            lines.append(("SECTION", "2. INSIGHT REKOMENDASI KECERDASAN BUATAN"))
            for ins in insights[:5]:
                itype = ins.get("insight_type", "").upper()
                content = ins.get("content", "")
                lines.append(("SUBSECTION", f"[{itype}]"))
                # Wrap long text
                words = content.split()
                cur_line = "  "
                for w in words:
                    if len(cur_line) + len(w) + 1 > 82:
                        lines.append(("TEXT", cur_line))
                        cur_line = "  " + w
                    else:
                        cur_line += " " + w
                if cur_line.strip():
                    lines.append(("TEXT", cur_line))

        # Buat stream PDF content
        stream_lines = []
        y_pos = 780
        line_height = 14

        stream_lines.append("BT")
        for kind, val in lines:
            safe_val = val.replace("(", "\\(").replace(")", "\\)")
            if kind == "TITLE":
                stream_lines.append(f"/F2 14 Tf 40 {y_pos} Td ({safe_val}) Tj")
                y_pos -= 22
                stream_lines.append(f"0 {-22} Td")
            elif kind == "SECTION":
                y_pos -= 10
                stream_lines.append(f"/F2 11 Tf 0 {-line_height - 6} Td ({safe_val}) Tj")
                y_pos -= (line_height + 6)
            elif kind == "SUBSECTION":
                stream_lines.append(f"/F2 9 Tf 0 {-line_height} Td ({safe_val}) Tj")
                y_pos -= line_height
            elif kind == "HEADER":
                stream_lines.append(f"/F2 9 Tf 0 {-line_height} Td ({safe_val}) Tj")
                y_pos -= line_height
            else:
                stream_lines.append(f"/F1 9 Tf 0 {-line_height} Td ({safe_val}) Tj")
                y_pos -= line_height

            if y_pos < 50:
                break
        stream_lines.append("ET")
        content_stream = "\n".join(stream_lines)

        # Rakit PDF 1.4 Object Structure
        stream_len = len(content_stream.encode("latin1", errors="replace"))

        obj1 = "<< /Type /Catalog /Pages 2 0 R >>"
        obj2 = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"
        obj3 = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] "
            f"/Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>"
        )
        obj4 = f"<< /Length {stream_len} >>\nstream\n{content_stream}\nendstream"
        obj5 = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"
        obj6 = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>"

        pdf_parts = [
            "%PDF-1.4\n",
            f"1 0 obj\n{obj1}\nendobj\n",
            f"2 0 obj\n{obj2}\nendobj\n",
            f"3 0 obj\n{obj3}\nendobj\n",
            f"4 0 obj\n{obj4}\nendobj\n",
            f"5 0 obj\n{obj5}\nendobj\n",
            f"6 0 obj\n{obj6}\nendobj\n",
        ]

        # Hitung xref offsets
        offsets = []
        cur_offset = 0
        for part in pdf_parts:
            offsets.append(cur_offset)
            cur_offset += len(part.encode("latin1"))

        xref = (
            "xref\n0 7\n"
            "0000000000 65535 f \n"
            + "".join(f"{off:010d} 00000 n \n" for off in offsets[1:])
        )
        trailer = (
            f"trailer\n<< /Size 7 /Root 1 0 R >>\n"
            f"startxref\n{cur_offset}\n%%EOF"
        )

        return "".join(pdf_parts).encode("latin1") + xref.encode("latin1") + trailer.encode("latin1")

    @classmethod
    def generate_csv_report(
        cls,
        job_info: Dict[str, Any],
        results: List[Dict[str, Any]],
        insights: Optional[List[Dict[str, Any]]] = None,
        report_type: str = "detailed_selection",
    ) -> bytes:
        return cls.generate_csv(job_info, results, report_type=report_type)

    @classmethod
    def generate_excel_report(
        cls,
        job_info: Dict[str, Any],
        results: List[Dict[str, Any]],
        insights: Optional[List[Dict[str, Any]]] = None,
        report_type: str = "detailed_selection",
    ) -> bytes:
        return cls.generate_excel_xlsx(job_info, results, report_type=report_type)

    @classmethod
    def generate_pdf_report(
        cls,
        job_info: Dict[str, Any],
        results: List[Dict[str, Any]],
        insights: Optional[List[Dict[str, Any]]] = None,
        report_type: str = "detailed_selection",
    ) -> bytes:
        return cls.generate_pdf(job_info, results, report_type=report_type)
