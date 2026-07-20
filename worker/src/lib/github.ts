import type { Env, Todo } from "../types";

const GRAPHQL_URL = "https://api.github.com/graphql";
const ACTIVE_STATUSES = ["Todo", "In Progress"]; // V1-b 沿用字段简化(项目 #1 默认模板)

async function gql(env: Env, query: string, variables: Record<string, unknown> = {}): Promise<any> {
  const resp = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { Authorization: `bearer ${env.GITHUB_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) {
    throw new Error(`GitHub GraphQL ${resp.status}: ${await resp.text()}`);
  }
  const data: any = await resp.json();
  if (data.errors) {
    throw new Error(`GitHub GraphQL errors: ${JSON.stringify(data.errors)}`);
  }
  return data.data;
}

function projectNumber(env: Env): number {
  const n = parseInt(env.GITHUB_PROJECT_NUMBER, 10);
  if (!Number.isFinite(n)) throw new Error("GITHUB_PROJECT_NUMBER 非数字");
  return n;
}

/** 拉项目今日待办(Status ∈ Todo/In Progress,最多 5 张) */
export async function fetchTodos(env: Env): Promise<Todo[]> {
  const query = `
    query($login: String!, $number: Int!) {
      user(login: $login) {
        projectV2(number: $number) {
          items(first: 50) {
            nodes {
              content { ...on DraftIssue { title } ...on Issue { title } }
              fieldValues(first: 10) {
                nodes { ...on ProjectV2ItemFieldSingleSelectValue { name } }
              }
            }
          }
        }
      }
    }`;
  const data = await gql(env, query, { login: env.GITHUB_LOGIN, number: projectNumber(env) });
  const items = data.user.projectV2.items.nodes;
  const todos: Todo[] = [];
  for (const it of items) {
    const title = it.content?.title ?? "(无标题)";
    let status = "";
    for (const fv of it.fieldValues?.nodes ?? []) {
      if (fv.name) status = fv.name;
    }
    if (ACTIVE_STATUSES.includes(status)) todos.push({ title, status });
  }
  return todos.slice(0, 5);
}

/** 创建 Draft Issue(V1-b 简化:Status 默认 Todo;Type/Priority 留 V2-b 配项目字段后) */
export async function addDraftIssue(env: Env, title: string): Promise<string> {
  const q = `query($login:String!,$number:Int!){user(login:$login){projectV2(number:$number){id}}}`;
  const d = await gql(env, q, { login: env.GITHUB_LOGIN, number: projectNumber(env) });
  const projectId: string = d.user.projectV2.id;
  const m = `mutation($pid:ID!,$title:String!){addProjectV2DraftIssue(input:{projectId:$pid,title:$title}){projectItem{id}}}`;
  const r = await gql(env, m, { pid: projectId, title });
  return r.addProjectV2DraftIssue.projectItem.id as string;
}
