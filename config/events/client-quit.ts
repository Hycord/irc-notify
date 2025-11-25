export default defineEvent({
  id: "client-quit",
  name: "Client Disconnected",
  enabled: true,
  baseEvent: "quit",
  serverIds: ["*"],
  priority: 50,
  filters: {
    operator: "AND",
    filters: [
      {
        field: "sender.nickname",
        operator: "equals",
        value: "{{server.metadata.clientNickname}}",
      },
    ],
  },
  sinkIds: ["ntfy", "console"],
  metadata: {
    description: "Triggers when the IRC client itself disconnects from a server",
    sink: {
      ntfy: {
        priority: "high",
        tags: ["red_circle", "broken_heart", "warning"],
      },
    },
  },
});
