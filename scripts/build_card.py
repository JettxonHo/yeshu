#!/usr/bin/env python3
"""build_card.py · 把待办列表组装成飞书 interactive 卡片 JSON(野薯 V1-a,Phase 1)

从 stdin 读 fetch_data.py 输出的待办列表 JSON,构造飞书卡片 JSON 到 stdout。
卡片设计参考 Product-Spec.md §10(V1-a 简化版:header + 待办 div + 签名,无按钮)。
"""

from __future__ import annotations

import json
import sys

MAX_ITEMS = 5


def build_card(todos: list[dict]) -> dict:
    """构造飞书 interactive 卡片。无待办时返回"空待办"提示卡。"""
    if not todos:
        elements = [{
            "tag": "div",
            "text": {"tag": "lark_md", "content": "🌱 今天没有待办,享受一天 / 或去项目加几张"},
        }]
    else:
        elements = [{
            "tag": "div",
            "text": {"tag": "lark_md", "content": f"• {t['title']}"},
        } for t in todos[:MAX_ITEMS]]
    elements += [
        {"tag": "hr"},
        {"tag": "note", "elements": [{"tag": "plain_text", "content": "—— 野薯"}]},
    ]
    return {
        "config": {"wide_screen": True},
        "header": {
            "title": {"tag": "plain_text", "content": "今日待办"},
            "template": "orange",  # 薯橙,§10.1
        },
        "elements": elements,
    }


def main() -> None:
    try:
        todos = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(f"✗ stdin 不是合法 JSON:{e}", file=sys.stderr)
        sys.exit(1)
    if not isinstance(todos, list):
        print("✗ stdin 应为待办数组 JSON", file=sys.stderr)
        sys.exit(1)
    card = build_card(todos)
    json.dump(card, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
