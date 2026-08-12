#!/usr/bin/env python3
"""build_card.py · 把分析结果组装成飞书 interactive 卡片 JSON(野薯 V2-b,Phase 4)

从 stdin 读 analyze.py 输出的每日/周三分析 JSON,构造飞书卡片 JSON 到 stdout。
卡片设计参考 Product-Spec.md §10.2(头部 + 任务项 + 签名,无交互 mutation)。
"""

from __future__ import annotations

import json
import sys
from typing import Any


def markdown(content: str) -> dict[str, str]:
    """构造卡片 markdown 文本节点。"""
    return {"tag": "lark_md", "content": content}


def div(content: str) -> dict[str, Any]:
    """构造卡片 div 元素。"""
    return {"tag": "div", "text": markdown(content)}


def daily_elements(analysis: dict[str, Any]) -> list[dict[str, Any]]:
    """构造每日 P0 + Stuck 的核心元素。"""
    p0_items = analysis.get("p0", [])
    elements: list[dict[str, Any]] = [
        div(f"🎯 今日 P0 · {len(p0_items)}"),
    ]
    if p0_items:
        for item in p0_items[:3]:
            label = "↩️ 延期 P0" if item.get("delayed") else "🆕 本周 P0"
            elements.append(
                div(
                    f"• {label} · {item.get('title', '(无标题)')} · {item.get('status', '')}"
                )
            )
    else:
        elements.append(div("🌱 今天没有活跃 P0,先享受一天 / 或去项目加几张"))

    if analysis.get("review_required"):
        elements.append(
            div(
                "⚠️ P0 超过 3 张或延期 P0 ≥ 3 张,建议 Review "
                f"(活跃 {analysis.get('active_p0_count', 0)}, 延期 {analysis.get('delayed_p0_count', 0)})"
            )
        )

    stuck = analysis.get("stuck")
    if stuck:
        urgent = " 🚨 紧急" if stuck.get("urgent") else ""
        elements.append(
            div(
                f"🧊 Stuck · {stuck.get('title', '(无标题)')} · "
                f"{stuck.get('status', '')} · 已卡 {stuck.get('days_stuck', 0)} 天 · "
                f"Score {stuck.get('score', 0)}{urgent}"
            )
        )
    else:
        elements.append(div("🌿 暂无 Stuck 提醒"))
    return elements


def wednesday_elements(analysis: dict[str, Any]) -> list[dict[str, Any]]:
    """构造周三状态进度与 Doing 提醒元素。"""
    status_counts = analysis.get("status_counts", {})
    statuses = ("Backlog", "Next", "Doing", "Paused", "Done", "Abandoned")
    progress = " · ".join(
        f"{status} {status_counts.get(status, 0)}" for status in statuses
    )
    elements: list[dict[str, Any]] = [div(f"📊 状态进度\n{progress}")]
    reminders = analysis.get("doing_reminders", [])
    if reminders:
        elements.append(div("⏰ Doing ≥3 天未更新"))
        for item in reminders:
            elements.append(
                div(
                    f"• {item.get('title', '(无标题)')} · "
                    f"已 {item.get('days_stuck', 0)} 天未更新"
                )
            )
    else:
        elements.append(div("🌿 暂无 Doing ≥3 天未更新提醒"))
    return elements


def build_card(data: dict[str, Any], mode: str | None = None) -> dict:
    """按 mode 构造飞书 interactive 卡片。"""
    analysis = data
    if mode is None:
        mode = analysis.get("mode", "daily")
    if mode == "wednesday":
        title = "周三体检"
        elements = wednesday_elements(analysis)
    else:
        title = "今日 P0 + Stuck"
        elements = daily_elements(analysis)
    elements += [
        {"tag": "hr"},
        {"tag": "note", "elements": [{"tag": "plain_text", "content": "—— 野薯"}]},
    ]
    return {
        "config": {"wide_screen": True},
        "header": {
            "title": {"tag": "plain_text", "content": title},
            "template": "orange",  # 薯橙,§10.1
        },
        "elements": elements,
    }


def main() -> None:
    mode: str | None = None
    if "--mode" in sys.argv:
        index = sys.argv.index("--mode")
        if index + 1 >= len(sys.argv) or sys.argv[index + 1] not in {
            "daily",
            "wednesday",
        }:
            print("✗ --mode 必须为 daily 或 wednesday", file=sys.stderr)
            sys.exit(1)
        mode = sys.argv[index + 1]
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(f"✗ stdin 不是合法 JSON:{e}", file=sys.stderr)
        sys.exit(1)
    if not isinstance(data, dict):
        print("✗ stdin 应为分析结果对象 JSON", file=sys.stderr)
        sys.exit(1)
    card = build_card(data, mode=mode)
    json.dump(card, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
