/** Worker 外部 HTTP 边界的统一超时、重试与脱敏错误策略。 */

export type ExternalService = "github" | "feishu" | "ai";
export type RetryPolicy = "none" | "safe";
export type ExternalHttpErrorKind =
  "timeout" | "network" | "http" | "invalid-response" | "remote-error";

export interface FetchPolicy {
  service: ExternalService;
  /** 单次请求超时。Worker 默认 2 秒,为 FC 10 秒总时限留出收尾空间。 */
  timeoutMs?: number;
  /** safe 仅用于可安全重放的读取请求,最多额外尝试一次。 */
  retry?: RetryPolicy;
  /** 两次尝试之间的固定短退避。主要供测试注入 0。 */
  retryDelayMs?: number;
}

export const DEFAULT_HTTP_TIMEOUT_MS = 2_000;
export const DEFAULT_RETRY_DELAY_MS = 100;

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * 面向内部诊断的结构化错误。message 不包含 URL、响应体、凭证或 SDK 原始文本,
 * 即使被意外透传也只暴露稳定分类。
 */
export class ExternalHttpError extends Error {
  readonly service: ExternalService;
  readonly kind: ExternalHttpErrorKind;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(input: {
    service: ExternalService;
    kind: ExternalHttpErrorKind;
    status?: number;
    retryable: boolean;
  }) {
    const suffix = input.status === undefined ? "" : ` status=${input.status}`;
    super(`${input.service} request failed (${input.kind}${suffix})`);
    this.name = "ExternalHttpError";
    this.service = input.service;
    this.kind = input.kind;
    this.status = input.status;
    this.retryable = input.retryable;
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} 必须为正安全整数`);
  }
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} 必须为非负安全整数`);
  }
  return value;
}

async function wait(ms: number): Promise<void> {
  if (ms === 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // 释放失败不改变主错误分类;响应体内容也绝不进入日志或异常。
  }
}

async function fetchJsonOnce<T>(
  input: string | URL | Request,
  init: RequestInit,
  service: ExternalService,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  let callerAborted = init.signal?.aborted ?? false;
  const abortFromCaller = (): void => {
    callerAborted = true;
    controller.abort(init.signal?.reason);
  };
  if (init.signal && !init.signal.aborted) {
    init.signal.addEventListener("abort", abortFromCaller, { once: true });
  } else if (callerAborted) {
    controller.abort(init.signal?.reason);
  }
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    if (!response.ok) {
      const retryable = RETRYABLE_HTTP_STATUSES.has(response.status);
      await cancelBody(response);
      throw new ExternalHttpError({
        service,
        kind: "http",
        status: response.status,
        retryable,
      });
    }
    try {
      // JSON body 必须在同一个 timeout / caller abort 生命周期内读完。
      return (await response.json()) as T;
    } catch (error) {
      // abort 交给外层按 timeout / caller abort 分类;语法错误归为 invalid-response。
      if (timedOut || callerAborted || controller.signal.aborted) throw error;
      throw new ExternalHttpError({
        service,
        kind: "invalid-response",
        retryable: false,
      });
    }
  } catch (error) {
    if (error instanceof ExternalHttpError) throw error;
    if (timedOut) {
      throw new ExternalHttpError({
        service,
        kind: "timeout",
        retryable: true,
      });
    }
    throw new ExternalHttpError({
      service,
      kind: "network",
      retryable: !callerAborted,
    });
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }
}

/**
 * 发起带策略的请求。`safe` 最多两次尝试;`none` 永远只尝试一次。
 * 重试仅针对 timeout / network / 408 / 425 / 429 / 5xx。
 */
export async function fetchJsonWithPolicy<T>(
  input: string | URL | Request,
  init: RequestInit,
  policy: FetchPolicy,
): Promise<T> {
  const timeoutMs = positiveInteger(
    policy.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS,
    "FetchPolicy.timeoutMs",
  );
  const retryDelayMs = nonNegativeInteger(
    policy.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    "FetchPolicy.retryDelayMs",
  );
  const attempts = (policy.retry ?? "none") === "safe" ? 2 : 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchJsonOnce<T>(input, init, policy.service, timeoutMs);
    } catch (error) {
      const canRetry =
        error instanceof ExternalHttpError &&
        error.retryable &&
        attempt < attempts;
      if (!canRetry) throw error;
      await wait(retryDelayMs);
    }
  }
  throw new Error("fetchJsonWithPolicy: unreachable");
}

/** 结构化脱敏日志字段:不含 error.message / URL / response body。 */
export function externalErrorContext(error: unknown): Record<string, unknown> {
  if (error instanceof ExternalHttpError) {
    return {
      errorName: error.name,
      service: error.service,
      kind: error.kind,
      status: error.status,
      retryable: error.retryable,
    };
  }
  return { errorName: error instanceof Error ? error.name : "unknown" };
}
