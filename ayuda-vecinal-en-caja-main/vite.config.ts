import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  envDefine: false,
  vite: { envDir: false, server: { cors: false, host: "localhost", port: 3000, strictPort: true } },
  tanstackStart: { server: { entry: "server" } },
  nitro: { preset: "node-server" },
});
