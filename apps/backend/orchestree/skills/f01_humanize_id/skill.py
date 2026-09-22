"""
F.01-HUMANIZE-ID Skill (PRD v2.2 Bagian 11.9)

Post-processing pass akhir Output Validator khusus Bahasa Indonesia.
Prinsip Mutlak PRD v2.2:
- TIDAK PERNAH mengubah fakta, angka, harga, nomor resi, kode promo, atau kuantitas produk.
- HANYA menyesuaikan gaya bahasa (tone & voice) menjadi hangat, ramah, dan alami
  khas customer service Indonesia (menghilangkan translationese dan kaku AI).
- Divalidasi ulang oleh Grounding Enforcement setelah humanisasi.
  Bila terjadi deviasi fakta sekecil apa pun, sistem FAIL-SAFE kembali ke teks asli.
"""

from typing import Dict, Any, List, Optional, Tuple, Set
import re
import logging

logger = logging.getLogger("orchestree.skills.f01_humanize_id")

# Pola frasa robotik / translationese AI yang wajib dihaluskan
ROBOTIC_AI_PATTERNS: List[Tuple[str, str]] = [
    (r"(?i)\bsebagai asisten ai\b.*?,?\s*", ""),
    (r"(?i)\bsaya adalah ai\b.*?,?\s*", ""),
    (r"(?i)\bberdasarkan pengetahuan saya\b,?\s*", "Dari informasi kami, "),
    (r"(?i)\bberdasarkan sistem kami\b,?\s*", "Dari data pesanan kakak, "),
    (r"(?i)\bperlu dicatat bahwa\b,?\s*", "Catatan penting ya kak, "),
    (r"(?i)\bmohon dicatat bahwa\b,?\s*", "Sebagai informasi ya kak, "),
    (r"(?i)\bkami menginformasikan bahwa\b,?\s*", "Kami infokan ya kak, "),
    (r"(?i)\bapakah ada hal lain yang bisa saya bantu hari ini\?\b", "Ada yang ingin ditanyakan lagi kak?"),
    (r"(?i)\bapakah ada hal lain yang dapat saya bantu\?\b", "Ada yang bisa kami bantu lagi kak?"),
    (r"(?i)\bterima kasih telah menghubungi kami\.\b", "Terima kasih banyak ya kak."),
    (r"(?i)\bmohon maaf atas ketidaknyamanan ini\.\b", "Mohon maaf sekali atas kendala ini ya kak."),
    (r"(?i)\bsilakan hubungi kami kembali jika\b", "Bisa langsung hubungi kami lagi ya kak kalau"),
]

# Regex untuk ekstraksi fakta numerik & entitas sensitif
# Angka desimal, ribuan Indonesia/internasional, mata uang Rp, persen, kode promo/resi
NUMBER_REGEX = re.compile(r"\b\d+(?:[.,]\d+)*%?\b")
CURRENCY_REGEX = re.compile(r"(?i)\brp\.?\s*\d+(?:[.,]\d+)*\b")
PHONE_REGEX = re.compile(r"(?:\+62|62|08)[0-9]{8,13}\b")
CODE_REGEX = re.compile(r"\b[A-Z0-9_-]{4,20}\b")


def extract_factual_tokens(text: str) -> List[str]:
    """
    Mengekstrak seluruh token fakta numerik dari teks:
    - Angka murni & persentase
    - Nilai mata uang
    - Nomor telepon
    - Kode alfanumerik kapital (resi, kupon, SKU)
    """
    if not text:
        return []
    
    tokens: List[str] = []
    
    # 1. Nominal mata uang
    for m in CURRENCY_REGEX.finditer(text):
        normalized = re.sub(r"\s+", "", m.group(0).lower())
        tokens.append(normalized)
        
    # 2. Angka & persentase
    for m in NUMBER_REGEX.finditer(text):
        tokens.append(m.group(0))

    # 3. Nomor telepon
    for m in PHONE_REGEX.finditer(text):
        tokens.append(m.group(0))

    # 4. Kode unik (misal RESI, SKU, KUPON)
    for m in CODE_REGEX.finditer(text):
        val = m.group(0)
        # Abaikan kata umum bahasa Indonesia yang huruf kapital di awal kalimat
        if val not in ("KAMI", "ANDA", "INFO", "HALO", "ORDER", "CHAT", "TOTAL", "ITEM", "TIKTOK", "SHOPEE"):
            tokens.append(val)

    return sorted(tokens)


def verify_factual_invariance(original_text: str, humanized_text: str) -> Tuple[bool, str]:
    """
    Memverifikasi apakah teks hasil humanisasi 100% mempertahankan seluruh fakta & angka.
    Mengembalikan: (is_invariant, detail_pesan)
    """
    orig_tokens = extract_factual_tokens(original_text)
    human_tokens = extract_factual_tokens(humanized_text)

    # Seluruh token fakta di teks asli WAJIB ada di teks hasil humanisasi
    orig_set = set(orig_tokens)
    human_set = set(human_tokens)

    missing_tokens = orig_set - human_set
    if missing_tokens:
        return False, f"Token fakta hilang setelah humanisasi: {missing_tokens}"

    added_numeric_tokens = set(t for t in (human_set - orig_set) if any(c.isdigit() for c in t))
    if added_numeric_tokens:
        return False, f"Ditemukan angka baru yang tidak ada pada sumber: {added_numeric_tokens}"

    return True, "Fakta dan angka terverifikasi 100% invarian."


class F01HumanizeIdSkill:
    """Implementasi F.01-HUMANIZE-ID Output Validator."""

    def __init__(self, default_honorific: str = "Kak"):
        self.default_honorific = default_honorific

    def humanize(
        self,
        text_content: str,
        customer_name: Optional[str] = None,
        honorific: Optional[str] = None,
        enforce_grounding: bool = True,
    ) -> Dict[str, Any]:
        """
        Menghaluskan teks menjadi gaya bahasa customer service Indonesia yang ramah dan alami.
        Jika verifikasi fakta gagal, langsung fail-safe ke teks asli.
        """
        if not text_content or not text_content.strip():
            return {
                "original_text": text_content,
                "humanized_text": text_content,
                "is_modified": False,
                "factual_invariance_passed": True,
            }

        salutation = honorific or self.default_honorific
        if customer_name:
            # Gunakan nama depan saja agar terdengar akrab dan santun
            first_name = customer_name.strip().split()[0]
            display_greeting = f"{salutation} {first_name}"
        else:
            display_greeting = salutation

        processed = text_content

        # 1. Bersihkan frasa robotik AI
        for pattern, replacement in ROBOTIC_AI_PATTERNS:
            processed = re.sub(pattern, replacement, processed)

        # 2. Sisipkan sapaan ramah di awal jika belum ada
        greetings_pat = r"^(halo|hai|selamat (pagi|siang|sore|malam)|assalamu['a]?laikum)"
        if not re.search(greetings_pat, processed, flags=re.IGNORECASE):
            processed = f"Halo {display_greeting}, {processed.lstrip()}"
        else:
            # Pastikan sapaan menggunakan honorific yang santun
            processed = re.sub(r"(?i)\banda\b", display_greeting, processed)

        # 3. Rapikan whitespace berlebih
        processed = re.sub(r"[ \t]+", " ", processed)
        processed = re.sub(r"\n{3,}", "\n\n", processed).strip()

        # 4. Validasi Invarian Faktual (PRD v2.2 Bagian 11.9)
        is_invariant, detail = verify_factual_invariance(text_content, processed)

        if enforce_grounding and not is_invariant:
            logger.warning(
                f"[F.01-HUMANIZE-ID] Verifikasi invarian fakta gagal: {detail}. "
                f"Mengembalikan teks asli sesuai prinsip Fail-Safe Grounding."
            )
            return {
                "original_text": text_content,
                "humanized_text": text_content,
                "is_modified": False,
                "factual_invariance_passed": False,
                "rejection_reason": detail,
            }

        return {
            "original_text": text_content,
            "humanized_text": processed,
            "is_modified": processed != text_content,
            "factual_invariance_passed": True,
            "validation_note": detail,
        }


def humanize_indonesian_response(
    text_content: str,
    customer_name: Optional[str] = None,
    honorific: str = "Kak",
) -> str:
    """Fungsi pembantu cepat untuk post-processing teks Bahasa Indonesia."""
    skill = F01HumanizeIdSkill(default_honorific=honorific)
    result = skill.humanize(text_content, customer_name=customer_name)
    return result["humanized_text"]
