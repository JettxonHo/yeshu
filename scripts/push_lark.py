#!/usr/bin/env python3
"""push_lark.py · 把卡片 JSON 推送到飞书私聊(野薯 V1-a,Phase 1)

从 stdin 读 build_card.py 输出的卡片 JSON,用 LARK_APP_ID/SECRET 换
tenant_access_token,调飞书发消息 API 推送到 LARK_OPEN_ID。

V0 用 lark-cli 本地登录推送;V1-a 跑在 GitHub Actions(无本地登录态),
改用飞书 OpenAPI 直连,凭证从环境变量读。

环境变量:LARK_APP_ID / LARK_APP_SECRET / LARK_OPEN_ID
"""

from __future__ import annotations

import json
import os
import sys

import requests

FEISHU_BASE = "https://open.feishu.cn"
TOKEN_URL = f"{FEISHU_BASE}/open-apis/auth/v3/tenant_access_token/internal"
MESSAGE_URL = f"{FEISHU_BASE}/open-apis/im/v1/messages"


def read_env(key: str) -> str:
    """读环境变量,strip 行内注释与空白。"""
    return os.environ.get(key, "").split("#")[0].strip()


def get_tenant_token(app_id: str, app_secret: str) -> str:
    """用 app_id/secret 换 tenant_access_token。失败则友好退出。"""
    try:
        resp = requests.post(
            TOKEN_URL,
            json={"app_id": app_id, "app_secret": app_secret},
            timeout=30,
        )
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"✗ 换 tenant_access_token 请求失败:{e}", file=sys.stderr)
        sys.exit(1)
    data = resp.json()
    if data.get("code") != 0:
        print(f"✗ 飞书拒绝发 token:{data.get('msg')}", file=sys.stderr)
        sys.exit(1)
    return data["tenant_access_token"]


def send_card(token: str, open_id: str, card_json: str) -> dict:
    """调发消息 API 推 interactive 卡片到 open_id,返回飞书响应。"""
    try:
        resp = requests.post(
            MESSAGE_URL,
            params={"receive_id_type": "open_id"},
            headers={"Authorization": f"Bearer {token}"},
            json={"receive_id": open_id, "msg_type": "interactive", "content": card_json},
            timeout=30,
        )
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"✗ 推送飞书消息请求失败:{e}", file=sys.stderr)
        sys.exit(1)
    return resp.json()


def main() -> None:
    app_id = read_env("LARK_APP_ID")
    app_secret = read_env("LARK_APP_SECRET")
    open_id = read_env("LARK_OPEN_ID")
    missing = [k for k, v in [
        ("LARK_APP_ID", app_id), ("LARK_APP_SECRET", app_secret), ("LARK_OPEN_ID", open_id)
    ] if not v]
    if missing:
        print(f"✗ 缺环境变量:{', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    try:
        card = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(f"✗ stdin 不是合法卡片 JSON:{e}", file=sys.stderr)
        sys.exit(1)
    card_json = json.dumps(card, ensure_ascii=False)

    token = get_tenant_token(app_id, app_secret)
    result = send_card(token, open_id, card_json)
    if result.get("code") != 0:
        print(f"✗ 飞书发消息失败:{result.get('msg')}", file=sys.stderr)
        sys.exit(1)
    message_id = result.get("data", {}).get("message_id", "?")
    print(f"✓ 推送成功 message_id={message_id}")


if __name__ == "__main__":
    main()
