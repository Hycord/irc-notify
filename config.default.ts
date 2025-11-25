export default defineConfig({
  global: {
    defaultLogDirectory: "../logs",
    pollInterval: 1000,
    debug: false,
    rescanLogsOnStartup: false,
    configDirectory: ".",
  },
  api: {
    enabled: true,
    port: 3001,
    host: "127.0.0.1",
    enableFileOps: true,
  },
  clients: [],
  servers: [],
  events: [],
  sinks: [],
});
