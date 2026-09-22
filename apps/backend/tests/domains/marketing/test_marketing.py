"""
Unit Test Suite: Marketing Campaigns, Commercial Intent, Marketplace Adapter, & F.01-SOCIAL
(PRD v2.2 Bagian 11.12.7, 12.6, 14)
"""

import unittest
from datetime import datetime, timezone

from orchestree.domains.marketing.campaign_engine import (
    SegmentCriteriaFilter,
    build_parameterized_query,
    render_campaign_message,
    resolve_segment,
    execute_campaign,
)
from orchestree.domains.marketing.commercial_intent import (
    CommercialIntentDetector,
    handle_social_comment_webhook,
    handle_social_dm_webhook,
)
from orchestree.domains.marketplace.transactional_adapter import (
    MarketplaceCoordinator,
    MarketplaceChannel,
    ShopeeTransactionalAdapter,
    TokopediaTransactionalAdapter,
    TikTokShopTransactionalAdapter,
    BlibliTransactionalAdapter,
)
from orchestree.skills.f01_social.skill import F01SocialSkill
from orchestree.skills.f01_social.metadata_scrubber import scrub_image_metadata


class TestCampaignEngine(unittest.TestCase):
    def test_parameterized_query_anti_sql_injection(self):
        # Memastikan tidak ada SQL bebas hasil LLM yang dieksekusi
        criteria = SegmentCriteriaFilter(
            tiers=["GOLD", "PLATINUM"],
            min_total_spent=500000.0,
            city="Jakarta",
            channel_preference="WHATSAPP",
        )
        sql, params = build_parameterized_query("tenant-alpha-001", criteria)

        self.assertIn("c.tenant_id = :tenant_id", sql)
        self.assertIn("c.tier = ANY(:tiers)", sql)
        self.assertIn("c.total_spent >= :min_total_spent", sql)
        self.assertIn("LOWER(c.city) = LOWER(:city)", sql)
        self.assertEqual(params["tenant_id"], "tenant-alpha-001")
        self.assertEqual(params["tiers"], ["GOLD", "PLATINUM"])
        self.assertEqual(params["min_total_spent"], 500000.0)
        self.assertEqual(params["city"], "Jakarta")

    def test_dynamic_variable_rendering(self):
        template = "Halo {customer_name}! Karena kamu member {tier}, gunakan kode {discount_code} untuk diskon spesial."
        variables = {
            "customer_name": "Budi Santoso",
            "tier": "PLATINUM",
            "discount_code": "PROMO-PLATINUM",
        }
        rendered = render_campaign_message(template, variables)
        self.assertEqual(
            rendered,
            "Halo Budi Santoso! Karena kamu member PLATINUM, gunakan kode PROMO-PLATINUM untuk diskon spesial."
        )


class TestCommercialIntent(unittest.TestCase):
    def test_detect_price_inquiry(self):
        result = CommercialIntentDetector.analyze("Halo kak, harganya berapa ya untuk ukuran L?", "rani_style")
        self.assertTrue(result.is_commercial)
        self.assertEqual(result.intent_type, "PRICE_INQUIRY")
        self.assertTrue(any("harga" in kw for kw in result.matched_keywords))
        self.assertIn("Direct Message (DM)", result.recommended_reply)
        self.assertIsNotNone(result.recommended_dm)

    def test_detect_stock_and_order(self):
        result = CommercialIntentDetector.analyze("Apakah masih ready stock kak? Mau order 2 pcs.", "doni_k")
        self.assertTrue(result.is_commercial)
        self.assertIn("ready", result.matched_keywords)

    def test_non_commercial_comment(self):
        result = CommercialIntentDetector.analyze("Bagus banget fotonya kak!", "user_casual")
        self.assertFalse(result.is_commercial)
        self.assertEqual(result.intent_type, "GENERAL_CHATTER")

    def test_social_comment_webhook_flow(self):
        webhook_res = handle_social_comment_webhook(
            tenant_id="tenant-001",
            platform="INSTAGRAM",
            comment_id="ig_cmt_1001",
            media_id="ig_media_5502",
            author_id="user_9921",
            author_username="melisa_shopping",
            comment_text="Bisa minta pricelist lengkapnya min?",
        )
        self.assertTrue(webhook_res["commercial_intent"]["is_commercial"])
        self.assertTrue(webhook_res["public_reply_dispatched"])
        self.assertTrue(webhook_res["private_dm_dispatched"])
        self.assertIsNotNone(webhook_res["conversation_id"])


class TestMarketplaceTransactional(unittest.TestCase):
    def test_all_channels_registered(self):
        channels = ["SHOPEE", "TOKOPEDIA", "TIKTOK_SHOP", "BLIBLI"]
        for ch in channels:
            adapter = MarketplaceCoordinator.get_adapter(ch)
            self.assertIsNotNone(adapter)

    def test_sync_order_two_way(self):
        shopee = ShopeeTransactionalAdapter()
        orders = shopee.fetch_orders("tenant-001", {})
        self.assertTrue(len(orders) > 0)
        first_order = orders[0]

        sync_result = shopee.sync_order_to_internal("tenant-001", first_order)
        self.assertTrue(sync_result["synced"])
        self.assertEqual(sync_result["channel"], "SHOPEE")
        self.assertEqual(sync_result["external_order_id"], first_order["external_order_id"])

    def test_fulfillment_write_back(self):
        fulfill_res = MarketplaceCoordinator.update_marketplace_fulfillment(
            tenant_id="tenant-001",
            channel="TOKOPEDIA",
            external_order_id="TKP-2026-88120",
            tracking_number="TKP-JNE-990011",
            courier="JNE",
        )
        self.assertTrue(fulfill_res["success"])
        self.assertEqual(fulfill_res["marketplace"], "TOKOPEDIA")
        self.assertEqual(fulfill_res["tracking_number"], "TKP-JNE-990011")


class TestF01SocialContentCalendar(unittest.TestCase):
    def setUp(self):
        self.skill = F01SocialSkill()

    def test_metadata_stripping(self):
        # Buat dummy JPEG bytes dengan marker APP1 EXIF
        fake_jpeg = b"\xff\xd8\xff\xe1\x00\x0aEXIF_TAGS\xff\xd9"
        clean_bytes, stripped_tags = scrub_image_metadata(fake_jpeg, "promo.jpg")
        self.assertTrue(len(stripped_tags) > 0)
        self.assertTrue(clean_bytes.startswith(b"\xff\xd8"))
        self.assertTrue(clean_bytes.endswith(b"\xff\xd9"))

    def test_publish_rejected_if_metadata_dirty(self):
        # PRD v2.2 Mandate: publish job WAJIB menolak item yang belum 'clean'
        res = self.skill.publish_post(
            tenant_id="tenant-001",
            item_id="item-dirty-001",
            current_scrub_status="dirty",
        )
        self.assertFalse(res["success"])
        self.assertEqual(res["error_code"], "METADATA_SCRUB_REJECTED")
        self.assertIn("DITOLAK", res["message"])

    def test_publish_allowed_if_metadata_clean(self):
        res = self.skill.publish_post(
            tenant_id="tenant-001",
            item_id="item-clean-002",
            current_scrub_status="clean",
        )
        self.assertTrue(res["success"])
        self.assertEqual(res["status"], "PUBLISHED")
        self.assertTrue(res["metadata_scrub_verified"])


if __name__ == "__main__":
    unittest.main()
