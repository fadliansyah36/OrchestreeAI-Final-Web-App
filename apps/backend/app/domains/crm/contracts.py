"""
Kontrak publik Domain CRM (Customer Relationship Management).
"""

from typing import Optional
from pydantic import BaseModel


class CustomerReference(BaseModel):
    customer_id: str
    tenant_id: str
    display_name: str
    contact_channel: str
