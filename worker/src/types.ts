/** Worker 环境变量类型(secrets 用 wrangler secret 配) */
export interface Env {
  GITHUB_TOKEN: string;
  GITHUB_LOGIN: string;
  GITHUB_PROJECT_NUMBER: string;
  LARK_APP_ID: string;
  LARK_APP_SECRET: string;
  LARK_OPEN_ID: string;
  LARK_VERIFICATION_TOKEN: string;
  // AI(V1-b 留壳子,未配)
  AI_PROVIDER?: string;
  AI_BASE_URL?: string;
  AI_MODEL?: string;
  AI_API_KEY?: string;
}

export interface Todo {
  itemId: string; // Projects V2 item node id(PVTI_...),按钮 value 用
  title: string;
  status: string; // Backlog/Next/Doing/Paused/...
  type?: string; // Idea/Feature/Bug/Learn/Show
  effort?: string; // S/M/L/XL
  priority?: string; // P0/P1/P2/P3
}

/**
 * 飞书 webhook 事件体最小类型(只列 Worker 读取的字段)。
 * - header.event_id:卡片回调幂等去重键(card: 前缀);
 * - event.message.message_id:消息命令幂等去重键(message: 前缀)。
 */
export interface LarkWebhookBody {
  type?: string; // "url_verification"(challenge)
  challenge?: string;
  schema?: string;
  header?: {
    event_id?: string;
    event_type?: string; // im.message.receive_v1 / card.action.trigger
    token?: string;
  };
  event?: {
    sender?: { sender_id?: { open_id?: string } };
    message?: {
      message_id?: string;
      message_type?: string; // "text"
      content?: string; // JSON 字符串,如 {"text":"/add 买牛奶"}
    };
    action?: { value?: Record<string, unknown> };
  };
}
