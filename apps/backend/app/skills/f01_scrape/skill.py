"""
OrchestreeAI F.01-SCRAPE Skill (PRD v2.2 Bagian 11.4)

Pusat orkestrasi ekstraksi intelijen kompetitor & pasar publik beretika:
- Kepatuhan robots.txt & ToS
- Rate limiting & circuit breaker
- WebAdapter, MarketplaceAdapter, SocialAdapter berbasis LLM
- detectChange() & Scoring Gating (final_score, threshold SEND_IMMEDIATE/INCLUDE_DIGEST/DISCARD)
- Dispatching terjamin ke Proactive Agent tanpa duplikasi (idempotency_key)
"""

import logging
from typing import Optional, List, Dict, Any

from app.skills.f01_scrape.adapters import (
    RobotsTxtValidator,
    DomainRateLimiterAndCircuitBreaker,
)
from app.skills.f01_scrape.gating import (
    detect_changes,
    evaluate_scoring_gating,
)
from app.skills.f01_scrape.tools import (
    register_scrape_tools,
    tool_crawl_target,
)

logger = logging.getLogger("orchestree.skills.f01_scrape.skill")


class F01ScrapeSkill:
    """
    Skill F.01-SCRAPE:
    Mesin ekstraksi intelijen publik multi-adapter berstruktur LLM.
    """

    name: str = "f01_scrape"
    version: str = "1.0.0"
    description: str = (
        "Ekstraksi Data Publik & Intelijen Pasar Berbasis LLM (F.01-SCRAPE) "
        "dengan Kepatuhan Robots.txt, Circuit Breaker, dan Scoring Gating Terstandar"
    )

    def __init__(self):
        self.robots_validator = RobotsTxtValidator()
        self.rate_limiter = DomainRateLimiterAndCircuitBreaker()

    def register_tools(self) -> None:
        """Mendaftarkan perkakas ke ToolRegistry MCP global."""
        register_scrape_tools()
        logger.info("F01ScrapeSkill tools successfully registered.")
