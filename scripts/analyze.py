#!/usr/bin/env python3
"""analyze.py · 计算每日 P0/Stuck 与周三体检数据。

从 stdin 读取 fetch_data.py 输出的规范化 item JSON,把分析结果写到 stdout。
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

SHANGHAI = ZoneInfo("Asia/Shanghai")
ACTIVE_STATUSES = ("Backlog", "Next", "Doing", "Paused")
ALL_STATUSES = ("Backlog", "Next", "Doing", "Paused", "Done", "Abandoned")
PRIORITY_WEIGHTS = {"P0": 4.0, "P1": 2.0, "P2": 1.0, "P3": 0.5}


def parse_timestamp(value: str | datetime | None) -> datetime | None:
    """解析 GitHub ISO 时间并转换到 Asia/Shanghai。"""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(SHANGHAI)


def as_shanghai(value: datetime) -> datetime:
    """保证分析基准时间带时区并位于 Asia/Shanghai。"""
    if value.tzinfo is None:
        return value.replace(tzinfo=SHANGHAI)
    return value.astimezone(SHANGHAI)


def whole_days_since(value: str | datetime | None, now: datetime) -> int | None:
    """计算从更新时间到基准时间经过的完整天数。"""
    updated_at = parse_timestamp(value)
    if updated_at is None:
        return None
    return int((as_shanghai(now) - updated_at).total_seconds() // 86400)


def week_start(now: datetime) -> datetime:
    """返回基准时间所在周的周一 00:00(Asia/Shanghai)。"""
    local_now = as_shanghai(now)
    monday = local_now.date() - timedelta(days=local_now.weekday())
    return datetime.combine(monday, datetime.min.time(), tzinfo=SHANGHAI)


def priority_weight(priority: str) -> float:
    """返回 Priority 对应权重,空值按最低档 0.5。"""
    return PRIORITY_WEIGHTS.get(priority, 0.5)


def analyze_daily(items: list[dict[str, Any]], now: datetime) -> dict[str, Any]:
    """计算延期 P0、最高 Stuck 与超限 Review 提醒。"""
    current_week_start = week_start(now)
    active_p0: list[dict[str, Any]] = []
    delayed_p0: list[dict[str, Any]] = []
    stuck_candidates: list[dict[str, Any]] = []

    for item in items:
        status = item.get("status", "")
        priority = item.get("priority", "")
        if status in ACTIVE_STATUSES and priority == "P0":
            priority_updated_at = parse_timestamp(item.get("priority_updated_at"))
            delayed = (
                priority_updated_at is not None
                and priority_updated_at < current_week_start
            )
            p0_item = dict(item)
            p0_item["delayed"] = delayed
            active_p0.append(p0_item)
            if delayed:
                delayed_p0.append(p0_item)

        if status in ("Doing", "Paused"):
            days_stuck = whole_days_since(item.get("updated_at"), now)
            if days_stuck is not None and days_stuck > 7:
                score = days_stuck * priority_weight(priority)
                stuck_item = dict(item)
                stuck_item.update(
                    {
                        "days_stuck": days_stuck,
                        "weight": priority_weight(priority),
                        "score": score,
                        "urgent": score > 100,
                    }
                )
                stuck_candidates.append(stuck_item)

    current_p0 = [item for item in active_p0 if not item["delayed"]]
    selected_p0 = (delayed_p0 + current_p0)[:3]
    highest_stuck = max(stuck_candidates, key=lambda item: item["score"], default=None)
    return {
        "mode": "daily",
        "p0": selected_p0,
        "active_p0_count": len(active_p0),
        "delayed_p0_count": len(delayed_p0),
        "review_required": len(active_p0) > 3 or len(delayed_p0) >= 3,
        "stuck": highest_stuck,
        "stuck_candidates": stuck_candidates,
    }


def analyze_wednesday(items: list[dict[str, Any]], now: datetime) -> dict[str, Any]:
    """计算六状态进度与 Doing 超过三整天的提醒。"""
    status_counts = {status: 0 for status in ALL_STATUSES}
    doing_reminders: list[dict[str, Any]] = []
    for item in items:
        status = item.get("status", "")
        if status in status_counts:
            status_counts[status] += 1
        if status == "Doing":
            days_stuck = whole_days_since(item.get("updated_at"), now)
            if days_stuck is not None and days_stuck >= 3:
                reminder = dict(item)
                reminder["days_stuck"] = days_stuck
                doing_reminders.append(reminder)
    return {
        "mode": "wednesday",
        "status_counts": status_counts,
        "doing_reminders": doing_reminders,
    }


def main(argv: list[str] | None = None) -> None:
    """读取 item JSON,按 mode 输出分析 JSON。"""
    parser = argparse.ArgumentParser(description="分析野薯每日/周三数据")
    parser.add_argument("--mode", choices=("daily", "wednesday"), required=True)
    args = parser.parse_args(argv)
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as error:
        print(f"✗ stdin 不是合法 JSON:{error}", file=sys.stderr)
        raise SystemExit(1) from error
    if not isinstance(payload, list):
        print("✗ stdin 应为 item 数组 JSON", file=sys.stderr)
        raise SystemExit(1)

    now = datetime.now(SHANGHAI)
    result = (
        analyze_daily(payload, now=now)
        if args.mode == "daily"
        else analyze_wednesday(payload, now=now)
    )
    json.dump(result, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
