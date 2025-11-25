export default defineEvent({
  id: "direct-message",
  name: "Direct Message Received",
  enabled: true,
  baseEvent: "message",
  serverIds: ["*"],
  priority: 100,
  filters: {
    operator: "AND",
    filters: [
      {
        field: "target.type",
        operator: "equals",
        value: "query",
      },
      {
        field: "message.type",
        operator: "in",
        value: ["privmsg", "notice"],
      },
    ],
  },
  sinkIds: ["ntfy", "console"],
  metadata: {
    description: "Triggers when you receive a direct message",
    sink: {
      ntfy: {
        priority: "urgent",
        tags: ["envelope", "incoming_envelope"],
      },
    },
  },
});
