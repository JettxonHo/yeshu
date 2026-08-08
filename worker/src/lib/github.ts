import type { Env, Todo } from "../types";
import { ExternalHttpError, fetchJsonWithPolicy } from "./http";

const GRAPHQL_URL = "https://api.github.com/graphql";

type GqlOperation = "query" | "mutation";

async function gql(
  env: Env,
  operation: GqlOperation,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<any> {
  const payload = await fetchJsonWithPolicy<unknown>(
    GRAPHQL_URL,
    {
      method: "POST",
      headers: {
        Authorization: `bearer ${env.GITHUB_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    },
    {
      service: "github",
      // GraphQL query 可安全重放;mutation 不自动重试,避免重复副作用。
      retry: operation === "query" ? "safe" : "none",
    },
  );
  if (typeof payload !== "object" || payload === null || !("data" in payload)) {
    throw new ExternalHttpError({
      service: "github",
      kind: "invalid-response",
      retryable: false,
    });
  }
  const data = payload as { data: unknown; errors?: unknown };
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    // GraphQL error 的 path / node id / message 不进入异常文本或用户卡片。
    throw new ExternalHttpError({
      service: "github",
      kind: "remote-error",
      retryable: false,
    });
  }
  return data.data;
}

function projectNumber(env: Env): number {
  const n = parseInt(env.GITHUB_PROJECT_NUMBER, 10);
  if (!Number.isFinite(n)) throw new Error("GITHUB_PROJECT_NUMBER 非数字");
  return n;
}

/** 项目字段元数据:node id + 各 single-select 字段(fieldId + optionName→optionId) */
export interface ProjectMeta {
  projectId: string;
  fields: Record<string, { fieldId: string; options: Record<string, string> }>;
}

let cachedMeta: ProjectMeta | null = null;

/** 查字段元数据,模块级缓存(实例内复用;字段 id 稳定,冷启动重查一次即可) */
export async function fetchProjectMeta(env: Env): Promise<ProjectMeta> {
  if (cachedMeta) return cachedMeta;
  const query = `
    query($login: String!, $number: Int!) {
      user(login: $login) {
        projectV2(number: $number) {
          id
          fields(first: 30) {
            nodes { ...on ProjectV2SingleSelectField { id name options { id name } } }
          }
        }
      }
    }`;
  const data = await gql(env, "query", query, {
    login: env.GITHUB_LOGIN,
    number: projectNumber(env),
  });
  const proj = data.user.projectV2;
  const fields: ProjectMeta["fields"] = {};
  for (const f of proj.fields.nodes) {
    if (!f.name) continue;
    fields[f.name] = {
      fieldId: f.id,
      options: Object.fromEntries(f.options.map((o: any) => [o.name, o.id])),
    };
  }
  cachedMeta = { projectId: proj.id, fields };
  return cachedMeta;
}

/** /today 展示的非终态(带按钮可操作);Done/Abandoned 不展示 */
const VISIBLE_STATUSES = ["Backlog", "Next", "Doing", "Paused"];

/** 拉 /today 待办(非终态,带 itemId/status 供按钮用) */
export async function fetchTodos(env: Env): Promise<Todo[]> {
  const query = `
    query($login: String!, $number: Int!) {
      user(login: $login) {
        projectV2(number: $number) {
          items(first: 50) {
            nodes {
              id
              content { ...on DraftIssue { title } ...on Issue { title } }
              fieldValues(first: 20) {
                nodes {
                  ...on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field { ...on ProjectV2FieldCommon { name } }
                  }
                }
              }
            }
          }
        }
      }
    }`;
  const data = await gql(env, "query", query, {
    login: env.GITHUB_LOGIN,
    number: projectNumber(env),
  });
  const items = data.user.projectV2.items.nodes;
  const todos: Todo[] = [];
  for (const it of items) {
    const title = it.content?.title ?? "(无标题)";
    let status = "",
      type = "",
      effort = "",
      priority = "";
    for (const fv of it.fieldValues?.nodes ?? []) {
      const fn = fv.field?.name;
      if (fn === "Status") status = fv.name;
      else if (fn === "Type") type = fv.name;
      else if (fn === "Effort") effort = fv.name;
      else if (fn === "Priority") priority = fv.name;
    }
    if (VISIBLE_STATUSES.includes(status))
      todos.push({ itemId: it.id, title, status, type, effort, priority });
  }
  return todos;
}

/** 设某 item 的 single-select 字段(通用,供 Status/Type/Priority/Effort 复用) */
async function setItemField(
  env: Env,
  itemId: string,
  fieldName: string,
  optionName: string,
): Promise<void> {
  const meta = await fetchProjectMeta(env);
  const field = meta.fields[fieldName];
  if (!field) throw new Error(`未知字段:${fieldName}`);
  const optionId = field.options[optionName];
  if (!optionId) throw new Error(`未知 ${fieldName} 选项:${optionName}`);
  const m = `
    mutation($pid: ID!, $iid: ID!, $fid: ID!, $oid: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $pid, itemId: $iid, fieldId: $fid, value: { singleSelectOptionId: $oid }
      }) { projectV2Item { id } }
    }`;
  await gql(env, "mutation", m, {
    pid: meta.projectId,
    iid: itemId,
    fid: field.fieldId,
    oid: optionId,
  });
}

/** 状态转换:设 Status(按钮回调核心) */
export async function updateItemStatus(
  env: Env,
  itemId: string,
  statusName: string,
): Promise<void> {
  await setItemField(env, itemId, "Status", statusName);
}

/** 数某状态的 item 数(Slice 2 WIP 检查用) */
export async function countItemsByStatus(
  env: Env,
  statusName: string,
): Promise<number> {
  const query = `
    query($login: String!, $number: Int!) {
      user(login: $login) {
        projectV2(number: $number) {
          items(first: 100) {
            nodes {
              fieldValues(first: 20) {
                nodes {
                  ...on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field { ...on ProjectV2FieldCommon { name } }
                  }
                }
              }
            }
          }
        }
      }
    }`;
  const data = await gql(env, "query", query, {
    login: env.GITHUB_LOGIN,
    number: projectNumber(env),
  });
  let n = 0;
  for (const it of data.user.projectV2.items.nodes) {
    for (const fv of it.fieldValues?.nodes ?? []) {
      if (fv.field?.name === "Status" && fv.name === statusName) n++;
    }
  }
  return n;
}

/** 创建 Draft Issue + 设默认字段(Status=Backlog)。add 与 update 不能同一调用,分两次。 */
export async function addDraftIssue(env: Env, title: string): Promise<string> {
  const meta = await fetchProjectMeta(env);
  const m = `
    mutation($pid: ID!, $title: String!) {
      addProjectV2DraftIssue(input: { projectId: $pid, title: $title }) { projectItem { id } }
    }`;
  const r = await gql(env, "mutation", m, { pid: meta.projectId, title });
  const itemId: string = r.addProjectV2DraftIssue.projectItem.id;
  await setItemField(env, itemId, "Status", "Backlog"); // spec §4.3 默认
  return itemId;
}
