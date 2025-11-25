export default defineEvent({
  id: "bot-message",
  name: "Bot Communication",
  enabled: true,
  baseEvent: "any",
  serverIds: ["*"],
  priority: 80,
  filters: {
    operator: "OR",
    filters: [
      {
        field: "sender.nickname",
        operator: "in",
        value: ["Hermes", "ChanServ", "NickServ", "BotServ"],
      },
      {
        field: "sender.modes",
        operator: "contains",
        value: "bot",
      },
    ],
  },
  sinkIds: ["ntfy"],
  metadata: {
    description: "Triggers on messages from known bots",
    sink: {
      ntfy: {
        priority: "default",
      },
    },
  },
});
