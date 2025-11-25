import { defineConfig } from "../src/config/types";

export default defineConfig({
  global: {
    defaultLogDirectory: "../logs",
    pollInterval: 1000,
    debug: false,
    rescanLogsOnStartup: false,
    configDirectory: ".",
  },
  clients: ["thelounge"],
  servers: ["libera", "orpheus", "mam"],
  events: [
    "phrase-alert",
    "client-quit",
    "client-join",
    "user-join",
    "direct-message",
    "user-quit",
    "bot-message",
    "server-notice",
    "client-ping",
  ],
  sinks: ["file-log", "ntfy", "console"],
});
