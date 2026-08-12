#!/usr/bin/env python3
"""fetch_data.py · 从 GitHub Projects V2 拉今日待办(野薯 V1-a,Phase 1)

从环境变量读凭据,GraphQL 查项目卡片并按字段名解析 Status/Priority
(六状态模型的活跃状态与终态),
输出全部规范化 item JSON 到 stdout,供下游 analyze.py 消费。

环境变量:GITHUB_TOKEN / GITHUB_LOGIN / GITHUB_PROJECT_NUMBER
"""

from __future__ import annotations

import json
import os
import sys

import requests

GRAPHQL_URL = "https://api.github.com/graphql"
# 项目已迁移六状态模型(Backlog/Next/Doing/Paused/Done/Abandoned)。
# 每日推送的可见状态与 Worker /today 保持一致:四种活跃状态,Done/Abandoned 不推。
ACTIVE_STATUSES = (
    "Backlog",
    "Next",
    "Doing",
    "Paused",
)


def read_env(key: str) -> str:
    """读环境变量,strip 行内注释与空白(兼容 .env 的 `KEY=value # 说明` 写法)。"""
    return os.environ.get(key, "").split("#")[0].strip()


def fetch_project_items(token: str, login: str, number: int) -> list[dict]:
    """GraphQL 查项目卡片并返回全部规范化 item。失败则友好退出。"""
    query = """
    query($login: String!, $number: Int!, $after: String) {
      user(login: $login) {
        projectV2(number: $number) {
          items(first: 50, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              updatedAt
              content { ...on DraftIssue { title } ...on Issue { title number url } }
              fieldValues(first: 10) {
                nodes {
                  ...on ProjectV2ItemFieldSingleSelectValue {
                    name
                    updatedAt
                    field { ...on ProjectV2FieldCommon { name } }
                  }
                }
              }
            }
          }
        }
      }
    }
    """
    items: list[dict] = []
    after: str | None = None
    while True:
        try:
            resp = requests.post(
                GRAPHQL_URL,
                json={
                    "query": query,
                    "variables": {"login": login, "number": number, "after": after},
                },
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

        connection = data["data"]["user"]["projectV2"]["items"]
        items.extend(normalize_item(item) for item in connection["nodes"])
        if not connection["pageInfo"]["hasNextPage"]:
            return items
        after = connection["pageInfo"]["endCursor"]


def normalize_item(item: dict) -> dict:
    """把 GitHub item 转为分析层稳定使用的字段契约。"""
    content = item.get("content") or {}
    status = ""
    priority = ""
    priority_updated_at: str | None = None
    for field_value in (item.get("fieldValues") or {}).get("nodes", []):
        field = field_value.get("field") or {}
        field_name = field.get("name")
        if field_name == "Status":
            status = field_value.get("name") or ""
        elif field_name == "Priority":
            priority = field_value.get("name") or ""
            priority_updated_at = field_value.get("updatedAt")
    return {
        "id": item.get("id", ""),
        "title": content.get("title") or "(无标题)",
        "status": status,
        "priority": priority,
        "updated_at": item.get("updatedAt"),
        "priority_updated_at": priority_updated_at,
    }


def extract_todos(items: list[dict]) -> list[dict]:
    """筛 ACTIVE_STATUSES 的待办,最多 5 张,返回 [{title, status}]。"""
    todos: list[dict] = []
    for it in items:
        normalized = it if "status" in it else normalize_item(it)
        title = normalized.get("title") or "(无标题)"
        status = normalized.get("status") or ""
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
    json.dump(items, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
