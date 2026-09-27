import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendUrl = env.VITE_BACKEND_URL;
  // Matches "/split-and-pay" and "/split-and-pay/...", but not "/split-and-pay-something".
  // Only the dev server needs it; tests and builds may run without a frontend/.env.
  const backendUrlPattern = backendUrl && `^${backendUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=/|$)`;
  return {
    plugins: [react(), tailwindcss()],
    base: env.VITE_BASE_URL,
    server: {
      port: Number(env.VITE_PORT),
      // Mirrors the nginx VITE_BACKEND_URL → /api proxy used in docker, so the app is
      // same-origin locally too (no CORS, and auth cookies behave the same in dev and prod).
      proxy: backendUrlPattern && {
        [backendUrlPattern]: {
          target: env.VITE_DEV_PROXY_TARGET,
          rewrite: (path) => path.replace(new RegExp(backendUrlPattern), "/api"),
        },
      },
    },
    test: {
      environment: "jsdom",
      include: ["src/__tests__/**/*.test.{js,jsx}"],
      setupFiles: ["src/__tests__/setup.js"],
    },
  };
});
