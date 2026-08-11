from __future__ import annotations

import io
import unittest
from contextlib import redirect_stderr
from typing import Any
from unittest.mock import Mock, patch

import fetch_data


def _item(item_id: str, title: str, status: str) -> dict[str, Any]:
    """构造一个最小的 ProjectV2 item mock。"""
    return {
        "id": item_id,
        "content": {"title": title},
        "fieldValues": {
            "nodes": [{"name": status, "field": {"name": "Status"}}]
        },
    }


def _page(
    nodes: list[dict[str, Any]], has_next_page: bool, end_cursor: str | None
) -> dict[str, Any]:
    """构造 GitHub GraphQL items connection 的一页响应。"""
    return {
        "data": {
            "user": {
                "projectV2": {
                    "items": {
                        "nodes": nodes,
                        "pageInfo": {
                            "hasNextPage": has_next_page,
                            "endCursor": end_cursor,
                        },
                    }
                }
            }
        }
    }


def _response(payload: dict[str, Any]) -> Mock:
    """构造可供 requests mock 使用的响应对象。"""
    response = Mock()
    response.json.return_value = payload
    response.raise_for_status.return_value = None
    return response


class FetchProjectItemsTests(unittest.TestCase):
    def test_two_pages_pass_cursor_and_expose_second_page_active_item(self) -> None:
        """第二页使用第一页 cursor,且第二页活跃任务进入每日推送结果。"""
        first_page = [
            _item(f"item-{index}", f"历史任务 {index}", "Done")
            for index in range(49)
        ] + [_item("item-backlog", "首页 Backlog", "Backlog")]
        second_page = [_item("item-doing", "第二页 Doing", "Doing")]
        responses = [
            _response(_page(first_page, True, "cursor-page-1")),
            _response(_page(second_page, False, "cursor-page-2")),
        ]

        with patch.object(fetch_data.requests, "post", side_effect=responses) as post:
            items = fetch_data.fetch_project_items("token", "login", 1)

        self.assertEqual(len(items), 51)
        self.assertEqual(
            fetch_data.extract_todos(items),
            [
                {"title": "首页 Backlog", "status": "Backlog"},
                {"title": "第二页 Doing", "status": "Doing"},
            ],
        )
        self.assertEqual(post.call_count, 2)
        query = post.call_args_list[0].kwargs["json"]["query"]
        for fragment in (
            "$after: String",
            "after: $after",
            "pageInfo",
            "hasNextPage",
            "endCursor",
        ):
            self.assertIn(fragment, query)
        first_variables = post.call_args_list[0].kwargs["json"]["variables"]
        second_variables = post.call_args_list[1].kwargs["json"]["variables"]
        self.assertIsNone(first_variables["after"])
        self.assertEqual(second_variables["after"], "cursor-page-1")
        self.assertEqual(
            len({item["id"] for item in items}),
            len(items),
        )

    def test_has_next_page_false_stops_without_duplicate_nodes(self) -> None:
        """末页标记为 false 时停止请求,聚合结果不重复。"""
        page = [
            _item("item-one", "第一页", "Backlog"),
            _item("item-two", "第二张", "Next"),
        ]
        with patch.object(
            fetch_data.requests,
            "post",
            return_value=_response(_page(page, False, "cursor-last")),
        ) as post:
            items = fetch_data.fetch_project_items("token", "login", 1)

        self.assertEqual(items, page)
        self.assertEqual(post.call_count, 1)
        self.assertEqual(len({item["id"] for item in items}), len(items))

    def test_graphql_error_on_following_page_exits(self) -> None:
        """后续页 GraphQL error 继续以 SystemExit(1) 友好失败。"""
        responses = [
            _response(_page([_item("item-one", "第一页", "Backlog")], True, "cursor")),
            _response({"errors": [{"message": "private detail"}]}),
        ]
        stderr = io.StringIO()
        with (
            patch.object(fetch_data.requests, "post", side_effect=responses) as post,
            redirect_stderr(stderr),
            self.assertRaises(SystemExit) as raised,
        ):
            fetch_data.fetch_project_items("token", "login", 1)

        self.assertEqual(raised.exception.code, 1)
        self.assertEqual(post.call_count, 2)
        self.assertIn("GitHub GraphQL 返回错误", stderr.getvalue())

    def test_extract_todos_keeps_active_order_and_limit(self) -> None:
        """extract_todos 保持四活跃状态顺序与最多五张的既有契约。"""
        statuses = ["Backlog", "Next", "Doing", "Paused", "Backlog", "Done"]
        items = [
            _item(f"item-{index}", f"任务 {index}", status)
            for index, status in enumerate(statuses)
        ]

        self.assertEqual(
            fetch_data.extract_todos(items),
            [
                {"title": "任务 0", "status": "Backlog"},
                {"title": "任务 1", "status": "Next"},
                {"title": "任务 2", "status": "Doing"},
                {"title": "任务 3", "status": "Paused"},
                {"title": "任务 4", "status": "Backlog"},
            ],
        )


if __name__ == "__main__":
    unittest.main()
