from __future__ import annotations

import io
import sys
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest.mock import patch

import build_card


def _texts(value: object) -> list[str]:
    """递归提取卡片中的文案,只用于锁定核心语义。"""
    texts: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            if key in {"content", "text"} and isinstance(child, str):
                texts.append(child)
            texts.extend(_texts(child))
    elif isinstance(value, list):
        for child in value:
            texts.extend(_texts(child))
    return texts


def _assert_v1_card_schema(test_case: unittest.TestCase, card: object) -> None:
    """锁定飞书 V1 卡片的稳定外壳与签名 note。"""
    test_case.assertIsInstance(card, dict)
    assert isinstance(card, dict)
    test_case.assertTrue({"config", "header", "elements"}.issubset(card))
    test_case.assertIsInstance(card["elements"], list)
    note_contents = [
        child.get("content")
        for element in card["elements"]
        if isinstance(element, dict)
        and element.get("tag") == "note"
        and isinstance(element.get("elements"), list)
        for child in element["elements"]
        if isinstance(child, dict) and child.get("tag") == "plain_text"
    ]
    test_case.assertIn(
        "—— 野薯",
        note_contents,
        "卡片必须包含固定签名 plain_text: —— 野薯",
    )


def _assert_workflow_contract(
    test_case: unittest.TestCase,
    filename: str,
    mode: str,
    cron: str,
) -> None:
    """校验 workflow 的触发、Secret 与 fetch→analyze→build→push 链路。"""
    workflow_path = (
        Path(__file__).resolve().parents[1] / ".github" / "workflows" / filename
    )
    workflow = workflow_path.read_text(encoding="utf-8")
    test_case.assertIn(f'- cron: "{cron}"', workflow)
    test_case.assertIn("workflow_dispatch:", workflow)
    for secret in (
        "GH_PAT",
        "YESHU_LOGIN",
        "YESHU_PROJECT_NUMBER",
        "LARK_APP_ID",
        "LARK_APP_SECRET",
        "LARK_OPEN_ID",
    ):
        test_case.assertIn(f"secrets.{secret}", workflow)

    commands = (
        "python scripts/fetch_data.py",
        f"python scripts/analyze.py --mode {mode}",
        f"python scripts/build_card.py --mode {mode}",
        "python scripts/push_lark.py",
    )
    positions = []
    for command in commands:
        position = workflow.find(command)
        test_case.assertGreaterEqual(position, 0, f"缺少 workflow 命令:{command}")
        positions.append(position)
    test_case.assertEqual(positions, sorted(positions))


class DailyCardTests(unittest.TestCase):
    def test_daily_card_shows_delayed_p0_stuck_urgent_and_review(self) -> None:
        analysis = {
            "mode": "daily",
            "p0": [
                {
                    "id": "delayed",
                    "title": "延期 P0",
                    "status": "Doing",
                    "delayed": True,
                },
                {"id": "fresh", "title": "本周 P0", "status": "Next", "delayed": False},
            ],
            "stuck": {
                "id": "stuck",
                "title": "卡住任务",
                "status": "Paused",
                "days_stuck": 26,
                "score": 104.0,
                "urgent": True,
            },
            "review_required": True,
            "active_p0_count": 4,
            "delayed_p0_count": 1,
        }

        card = build_card.build_card(analysis, mode="daily")
        _assert_v1_card_schema(self, card)
        text = "\n".join(_texts(card))

        self.assertIn("今日 P0", text)
        self.assertIn("延期 P0", text)
        self.assertIn("本周 P0", text)
        self.assertIn("卡住任务", text)
        self.assertIn("紧急", text)
        self.assertIn("Review", text)

    def test_daily_card_has_friendly_empty_state(self) -> None:
        card = build_card.build_card(
            {
                "mode": "daily",
                "p0": [],
                "stuck": None,
                "review_required": False,
                "active_p0_count": 0,
                "delayed_p0_count": 0,
            },
            mode="daily",
        )

        _assert_v1_card_schema(self, card)
        self.assertIn("没有", "\n".join(_texts(card)))


class WednesdayCardTests(unittest.TestCase):
    def test_wednesday_card_shows_counts_and_doing_reminders(self) -> None:
        card = build_card.build_card(
            {
                "mode": "wednesday",
                "status_counts": {
                    "Backlog": 2,
                    "Next": 1,
                    "Doing": 2,
                    "Paused": 0,
                    "Done": 3,
                    "Abandoned": 1,
                },
                "doing_reminders": [
                    {"id": "doing-old", "title": "老 Doing", "days_stuck": 4}
                ],
            },
            mode="wednesday",
        )
        _assert_v1_card_schema(self, card)
        text = "\n".join(_texts(card))

        self.assertIn("周三体检", text)
        self.assertIn("Doing", text)
        self.assertIn("2", text)
        self.assertIn("老 Doing", text)
        self.assertIn("4 天", text)


class WorkflowContractTests(unittest.TestCase):
    def test_daily_workflow_runs_analysis_chain_and_keeps_secrets(self) -> None:
        _assert_workflow_contract(
            self,
            "daily-push.yml",
            mode="daily",
            cron="0 0 * * *",
        )

    def test_wednesday_workflow_runs_analysis_chain_and_keeps_secrets(self) -> None:
        _assert_workflow_contract(
            self,
            "wednesday-check.yml",
            mode="wednesday",
            cron="0 12 * * 3",
        )


class BuildCardInputTests(unittest.TestCase):
    def test_cli_rejects_raw_item_list_without_analysis(self) -> None:
        stderr = io.StringIO()
        with (
            patch.object(sys, "argv", ["build_card.py"]),
            patch.object(sys, "stdin", io.StringIO("[]")),
            redirect_stderr(stderr),
            self.assertRaises(SystemExit) as raised,
        ):
            build_card.main()

        self.assertEqual(raised.exception.code, 1)
        self.assertIn("分析结果对象", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
