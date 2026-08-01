import { defineConfig } from "vitest/config";

/** Vitest 配置:只跑 node 环境下的纯函数单元测试,不触网络/生产数据。 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
