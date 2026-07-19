#!/usr/bin/env python3
"""fetch_data.py · 从 GitHub Projects V2 拉今日待办(野薯 V1-a,Phase 1)

从环境变量读凭据,GraphQL 查项目卡片,筛 Status ∈ {Todo, InProgress},
输出待办列表 JSON 到 stdout,供下游 build_card.py 消费。

环境变量:GITHUB_TOKEN / GITHUB_LOGIN / GITHUB_PROJECT_NUMBER
"""

from __future__ import annotations

import json
import os
import sys

import requests

GRAPHQL_URL = "https://api.github.com/graphql"
# V1-a 沿用 V0 的字段简化(项目 #1 是 GitHub 默认模板);
# spec §4.3 的完整 6 状态 + Priority/Type/Effort 在 Phase 2(V1-b /add)时配置。
ACTIVE_STATUSES = ("Todo", "In Progress")


def read_env(key: str) -> str:
    """读环境变量,strip 行内注释与空白(兼容 .env 的 `KEY=value # 说明` 写法)。"""
    return os.environ.get(key, "").split("#")[0].strip()


def fetch_project_items(token: str, login: str, number: int) -> list[dict]:
    """GraphQL 查项目卡片 + Status 字段,返回 items 节点。失败则友好退出。"""
    query = """
    query($login: String!, $number: Int!) {
      user(login: $login) {
        projectV2(number: $number) {
          items(first: 50) {
            nodes {
              content { ...on DraftIssue { title } ...on Issue { title number url } }
              fieldValues(first: 10) {
                nodes { ...on ProjectV2ItemFieldSingleSelectValue { name } }
              }
            }
          }
        }
      }
    }
    """
    try:
        resp = requests.post(
            GRAPHQL_URL,
            json={"query": query, "variables": {"login": login, "number": number}},
            headers={"Authorization": f"bearer {token}"},
            timeout=30,
        )
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"✗ GitHub GraphQL 请求失败:{e}", file=sys.stderr)
        sys.exit(1)

    data = resp.json()
    if "errors" in data:
        print(f"✗ GitHub GraphQL 返回错误:{data['errors']}", file=sys.stderr)
        sys.exit(1)
    return data["data"]["user"]["projectV2"]["items"]["nodes"]


def extract_todos(items: list[dict]) -> list[dict]:
    """筛 ACTIVE_STATUSES 的待办,最多 5 张,返回 [{title, status}]。"""
    todos: list[dict] = []
    for it in items:
        content = it.get("content") or {}
        title = content.get("title") or "(无标题)"
        status = ""
        for fv in (it.get("fieldValues") or {}).get("nodes", []):
            if "name" in fv:
                status = fv["name"]
        if status in ACTIVE_STATUSES:
            todos.append({"title": title, "status": status})
    return todos[:5]


def main() -> None:
    token = read_env("GITHUB_TOKEN")
    login = read_env("GITHUB_LOGIN") or "JettxonHo"
    number_raw = read_env("GITHUB_PROJECT_NUMBER") or "1"
    if not token:
        print("✗ 缺 GITHUB_TOKEN 环境变量", file=sys.stderr)
        sys.exit(1)
    try:
        number = int(number_raw)
    except ValueError:
        print(f"✗ GITHUB_PROJECT_NUMBER 不是数字:{number_raw}", file=sys.stderr)
        sys.exit(1)

    items = fetch_project_items(token, login, number)
    todos = extract_todos(items)
    json.dump(todos, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
