"""
Kontrak publik Domain Finance (Keuangan dan Dompet Kredit).
"""

from decimal import Decimal

try:
    from pydantic import BaseModel

    class WalletBalance(BaseModel):
        wallet_id: str
        tenant_id: str
        balance_amount: Decimal
        currency: str = "IDR"
except ImportError:
    from dataclasses import dataclass

    @dataclass
    class WalletBalance:
        wallet_id: str
        tenant_id: str
        balance_amount: Decimal
        currency: str = "IDR"

