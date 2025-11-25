export default defineEvent({
  id: "server-notice",
  name: "Server Notice",
  enabled: true,
  baseEvent: "any",
  serverIds: ["*"],
  priority: 70,
  filters: {
    operator: "AND",
    filters: [
      {
        field: "message.content",
        operator: "matches",
        pattern: "(connect|disconnect|timeout|error|killed)",
      },
    ],
  },
  sinkIds: ["file-log", "console"],
  metadata: {
    description: "Logs important server notices",
  },
});
