import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ExternalHttpError,
  externalErrorContext,
  fetchJsonWithPolicy,
} from "./http";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchJsonWithPolicy", () => {
  it("成功请求只调用一次", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchJsonWithPolicy<{ ok: boolean }>(
      "https://example.com",
      {},
      {
        service: "github",
        retry: "safe",
        retryDelayMs: 0,
      },
    );

    expect(response).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([408, 425, 429, 500, 502, 503, 504])(
    "safe 请求遇到可重试 HTTP %s 时只重试一次",
    async (status) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response("sensitive upstream body", { status }),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
      vi.stubGlobal("fetch", fetchMock);

      const response = await fetchJsonWithPolicy<{ ok: boolean }>(
        "https://example.com",
        {},
        {
          service: "github",
          retry: "safe",
          retryDelayMs: 0,
        },
      );

      expect(response).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it("mutation 策略遇到 503 不重试且错误不含响应体", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response("secret response detail", { status: 503 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchJsonWithPolicy(
      "https://example.com",
      {},
      {
        service: "feishu",
        retry: "none",
      },
    );

    await expect(promise).rejects.toMatchObject({
      name: "ExternalHttpError",
      kind: "http",
      status: 503,
      retryable: true,
    });
    await expect(promise).rejects.not.toThrow(/secret response detail/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("safe 请求网络失败后重试一次", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("socket with private endpoint"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchJsonWithPolicy(
        "https://example.com",
        {},
        {
          service: "github",
          retry: "safe",
          retryDelayMs: 0,
        },
      ),
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("超时会 abort;none 策略不重试", async () => {
    const fetchMock = vi.fn((_input: unknown, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("aborted with secret", "AbortError")),
          { once: true },
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchJsonWithPolicy(
        "https://example.com",
        {},
        {
          service: "ai",
          timeoutMs: 5,
          retry: "none",
        },
      ),
    ).rejects.toMatchObject({ kind: "timeout", retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("超时覆盖响应头之后的 JSON body 读取", async () => {
    const fetchMock = vi.fn((_input: unknown, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener(
            "abort",
            () =>
              controller.error(
                new DOMException("slow body aborted", "AbortError"),
              ),
            { once: true },
          );
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchJsonWithPolicy(
        "https://example.com",
        {},
        {
          service: "github",
          timeoutMs: 5,
          retry: "none",
        },
      ),
    ).rejects.toMatchObject({ kind: "timeout", retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("调用方主动 abort 不会被当成可重试网络错误", async () => {
    const caller = new AbortController();
    caller.abort();
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new DOMException("caller", "AbortError"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchJsonWithPolicy(
        "https://example.com",
        { signal: caller.signal },
        {
          service: "github",
          retry: "safe",
          retryDelayMs: 0,
        },
      ),
    ).rejects.toMatchObject({ kind: "network", retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("非法策略参数在访问网络前拒绝", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchJsonWithPolicy(
        "https://example.com",
        {},
        { service: "github", timeoutMs: 0 },
      ),
    ).rejects.toThrow(/timeoutMs/);
    await expect(
      fetchJsonWithPolicy(
        "https://example.com",
        {},
        {
          service: "github",
          retryDelayMs: -1,
        },
      ),
    ).rejects.toThrow(/retryDelayMs/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("JSON 与日志脱敏", () => {
  it("非法 JSON 转为稳定 invalid-response 错误", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("not-json secret"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchJsonWithPolicy("https://example.com", {}, { service: "github" }),
    ).rejects.toMatchObject({ kind: "invalid-response", service: "github" });
  });

  it("日志字段不包含原始 message", () => {
    const error = new ExternalHttpError({
      service: "github",
      kind: "http",
      status: 502,
      retryable: true,
    });
    const context = externalErrorContext(error);
    expect(context).toEqual({
      errorName: "ExternalHttpError",
      service: "github",
      kind: "http",
      status: 502,
      retryable: true,
    });
    expect(JSON.stringify(context)).not.toContain(error.message);
  });
});
