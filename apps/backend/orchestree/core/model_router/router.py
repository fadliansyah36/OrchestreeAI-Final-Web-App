"""Compatibility import for the canonical Model Router.

There is one Model Router implementation in app.core.model_router.router.
This module contains no provider logic.
"""

from app.core.model_router.router import (
    LLMProviderAdapter,
    ModelRouter,
    ModelRouterRequest,
    ModelRouterResponse,
    NvidiaNimAdapter,
    OpenAIAdapter,
    get_model_router,
)

__all__ = [
    "LLMProviderAdapter",
    "ModelRouter",
    "ModelRouterRequest",
    "ModelRouterResponse",
    "NvidiaNimAdapter",
    "OpenAIAdapter",
    "get_model_router",
]
