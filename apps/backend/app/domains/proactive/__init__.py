"""
OrchestreeAI Proactive Communication Domain
"""

from app.domains.proactive.service import (
    request_whatsapp_otp,
    verify_whatsapp_otp,
    generate_telegram_deeplink,
    verify_telegram_start,
    handle_opt_out,
    handle_opt_in,
    update_subscription_preferences,
    get_subscriptions,
    get_message_logs,
    get_notifications,
    mark_notification_read,
    mark_all_notifications_read,
    register_push_subscription,
    send_whatsapp_message,
    send_telegram_message,
)
from app.domains.proactive.scheduler import (
    execute_proactive_dispatch_cycle,
    evaluate_risk_and_tone,
    compose_proactive_briefing,
)

__all__ = [
    "request_whatsapp_otp",
    "verify_whatsapp_otp",
    "generate_telegram_deeplink",
    "verify_telegram_start",
    "handle_opt_out",
    "handle_opt_in",
    "update_subscription_preferences",
    "get_subscriptions",
    "get_message_logs",
    "get_notifications",
    "mark_notification_read",
    "mark_all_notifications_read",
    "register_push_subscription",
    "send_whatsapp_message",
    "send_telegram_message",
    "execute_proactive_dispatch_cycle",
    "evaluate_risk_and_tone",
    "compose_proactive_briefing",
]
