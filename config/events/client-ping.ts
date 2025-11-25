export default defineEvent({
  id: "client-ping",
  name: "Client Pinged",
  enabled: true,
  baseEvent: "any",
  serverIds: ["*"],
  priority: 70,
  filters: {
    operator: "AND",
    filters: [
      {
        field: "message.content",
        operator: "contains",
        value: "{{server.metadata.clientNickname}}",
      },
      {
        field: "target.type",
        operator: "equals",
        value: "channel",
      },
    ],
  },
  sinkIds: ["ntfy", "console"],
  metadata: {
    description: "Triggers when the client's nickname is mentioned in a channel message",
    sink: {
      ntfy: {
        title: "🔔 You were mentioned!",
        body: "{{sender.nickname}} mentioned you in {{target.name}} on {{server.displayName}}: {{message.content}}",
        priority: "urgent",
        tags: ["rotating_light", "bell", "eyes"],
      },
      console: {
        title: "[PING] {{sender.nickname}} mentioned you in {{target.name}}",
      },
    },
  },
});
