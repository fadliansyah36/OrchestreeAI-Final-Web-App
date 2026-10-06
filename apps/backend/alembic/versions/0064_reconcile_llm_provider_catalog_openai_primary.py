"""Reconcile the persisted LLM provider catalog with the canonical OpenAI/NVIDIA policy.

Runtime Model Router policy is:
- OpenAI primary
- NVIDIA NIM fallback

This migration is intentionally non-destructive: retired provider/model rows are
deactivated rather than deleted so historical usage/audit references remain valid.
"""

from alembic import op


revision = "0064_reconcile_llm_provider_catalog_openai_primary"
down_revision = "0063_r1_b3_cross_tenant_analytics_security_boundary"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        UPDATE public.llm_providers
        SET is_active = false
        WHERE id IN ('openrouter', 'gemini');
        """
    )
    op.execute(
        """
        UPDATE public.llm_models
        SET is_active = false
        WHERE provider_id IN ('openrouter', 'gemini');
        """
    )
    op.execute(
        """
        UPDATE public.llm_providers
        SET display_name = 'OpenAI Generative + LLM API'
        WHERE id = 'openai';
        """
    )


def downgrade():
    op.execute(
        """
        UPDATE public.llm_providers
        SET is_active = true
        WHERE id IN ('openrouter', 'gemini');
        """
    )
    op.execute(
        """
        UPDATE public.llm_models
        SET is_active = true
        WHERE provider_id IN ('openrouter', 'gemini');
        """
    )
    op.execute(
        """
        UPDATE public.llm_providers
        SET display_name = 'GPT-Image-2 (APIMart / OpenAI)'
        WHERE id = 'openai';
        """
    )
