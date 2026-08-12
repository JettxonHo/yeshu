from __future__ import annotations

import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

import analyze

SHANGHAI = ZoneInfo("Asia/Shanghai")
NOW = datetime(2026, 8, 12, 12, 0, tzinfo=SHANGHAI)


def _item(
    item_id: str,
    title: str,
    status: str,
    priority: str = "",
    updated_at: datetime = NOW,
    priority_updated_at: datetime | None = None,
) -> dict[str, object]:
    """构造分析层使用的规范化 item。"""
    return {
        "id": item_id,
        "title": title,
        "status": status,
        "priority": priority,
        "updated_at": updated_at.isoformat(),
        "priority_updated_at": (
            priority_updated_at.isoformat() if priority_updated_at else None
        ),
    }


class DailyAnalysisTests(unittest.TestCase):
    def test_p0_defers_sunday_value_and_prioritizes_it_before_current_week(
        self,
    ) -> None:
        sunday = datetime(2026, 8, 9, 23, 59, tzinfo=SHANGHAI)
        monday = datetime(2026, 8, 10, 0, 0, tzinfo=SHANGHAI)
        items = [
            _item("current-1", "本周 P0", "Next", "P0", NOW, monday),
            _item("delayed", "延期 P0", "Doing", "P0", NOW, sunday),
            _item("current-2", "本周 P0 2", "Backlog", "P0", NOW, monday),
            _item("current-3", "本周 P0 3", "Paused", "P0", NOW, monday),
        ]

        result = analyze.analyze_daily(items, now=NOW)

        self.assertEqual(
            [item["id"] for item in result["p0"]],
            ["delayed", "current-1", "current-2"],
        )
        self.assertTrue(result["p0"][0]["delayed"])
        self.assertFalse(result["p0"][1]["delayed"])
        self.assertEqual(result["active_p0_count"], 4)
        self.assertEqual(result["delayed_p0_count"], 1)
        self.assertTrue(result["review_required"])

    def test_stuck_requires_more_than_seven_whole_days_and_uses_weights(self) -> None:
        exactly_seven = NOW.replace(day=5)
        eight_days = NOW.replace(day=4)
        items = [
            _item("boundary", "刚好七天", "Doing", "P0", exactly_seven),
            _item("paused", "暂停 P1", "Paused", "P1", eight_days),
            _item("done", "终态旧卡", "Done", "P0", eight_days.replace(day=1)),
        ]

        result = analyze.analyze_daily(items, now=NOW)

        self.assertEqual(
            [item["id"] for item in result["stuck_candidates"]], ["paused"]
        )
        self.assertEqual(result["stuck"]["days_stuck"], 8)
        self.assertEqual(result["stuck"]["score"], 16.0)
        self.assertFalse(result["stuck"]["urgent"])

    def test_stuck_selects_highest_score_and_urgent_is_strictly_over_100(self) -> None:
        items = [
            _item(
                "p0",
                "高分 P0",
                "Doing",
                "P0",
                datetime(2026, 7, 17, 12, tzinfo=SHANGHAI),
            ),
            _item(
                "p0-boundary",
                "边界 P0",
                "Paused",
                "P0",
                datetime(2026, 7, 18, 12, tzinfo=SHANGHAI),
            ),
        ]

        result = analyze.analyze_daily(items, now=NOW)

        self.assertEqual(result["stuck"]["id"], "p0")
        self.assertEqual(result["stuck"]["score"], 104.0)
        self.assertTrue(result["stuck"]["urgent"])
        boundary = result["stuck_candidates"][1]
        self.assertEqual(boundary["score"], 100.0)
        self.assertFalse(boundary["urgent"])

    def test_equal_stuck_scores_keep_first_project_item(self) -> None:
        updated_at = datetime(2026, 8, 1, 12, tzinfo=SHANGHAI)
        items = [
            _item("first", "先出现", "Doing", "P2", updated_at),
            _item("second", "后出现", "Paused", "P2", updated_at),
        ]

        result = analyze.analyze_daily(items, now=NOW)

        self.assertEqual(result["stuck"]["id"], "first")
        self.assertEqual(
            [item["id"] for item in result["stuck_candidates"]],
            ["first", "second"],
        )

    def test_stuck_weights_cover_p0_p1_p2_p3_and_empty_priority(self) -> None:
        updated_at = datetime(2026, 8, 4, 12, tzinfo=SHANGHAI)
        items = [
            _item("p0", "P0", "Doing", "P0", updated_at),
            _item("p1", "P1", "Doing", "P1", updated_at),
            _item("p2", "P2", "Doing", "P2", updated_at),
            _item("p3", "P3", "Doing", "P3", updated_at),
            _item("empty", "空优先级", "Doing", "", updated_at),
        ]

        result = analyze.analyze_daily(items, now=NOW)

        self.assertEqual(
            {item["id"]: item["weight"] for item in result["stuck_candidates"]},
            {"p0": 4.0, "p1": 2.0, "p2": 1.0, "p3": 0.5, "empty": 0.5},
        )

    def test_three_delayed_p0_requires_review(self) -> None:
        sunday = datetime(2026, 8, 9, 23, 59, tzinfo=SHANGHAI)
        items = [
            _item(f"delayed-{index}", f"延期 {index}", "Backlog", "P0", NOW, sunday)
            for index in range(3)
        ]

        result = analyze.analyze_daily(items, now=NOW)

        self.assertEqual(result["active_p0_count"], 3)
        self.assertEqual(result["delayed_p0_count"], 3)
        self.assertTrue(result["review_required"])


class WednesdayAnalysisTests(unittest.TestCase):
    def test_counts_states_and_reminds_doing_items_after_three_whole_days(self) -> None:
        three_days = NOW.replace(day=9)
        items = [
            _item("doing-old", "老 Doing", "Doing", updated_at=three_days),
            _item("backlog", "收件箱", "Backlog"),
            _item("next", "待排", "Next"),
            _item("doing-new", "新 Doing", "Doing", updated_at=NOW),
            _item("paused", "暂停", "Paused"),
            _item("done", "完成", "Done"),
            _item("abandoned", "放弃", "Abandoned"),
        ]

        result = analyze.analyze_wednesday(items, now=NOW)

        self.assertEqual(
            result["status_counts"],
            {
                "Backlog": 1,
                "Next": 1,
                "Doing": 2,
                "Paused": 1,
                "Done": 1,
                "Abandoned": 1,
            },
        )
        self.assertEqual(
            [item["id"] for item in result["doing_reminders"]], ["doing-old"]
        )
        self.assertEqual(result["doing_reminders"][0]["days_stuck"], 3)


if __name__ == "__main__":
    unittest.main()
