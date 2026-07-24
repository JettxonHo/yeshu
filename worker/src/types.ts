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
}
