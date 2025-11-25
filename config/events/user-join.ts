export default defineEvent({
  id: "user-join",
  name: "User Joined Channel",
  enabled: true,
  baseEvent: "join",
  serverIds: ["*"],
  priority: 5,
  filters: {
    operator: "AND",
    filters: [
      {
        field: "target.type",
        operator: "equals",
        value: "channel",
      },
    ],
  },
  sinkIds: ["console"],
  metadata: {
    description: "Alerts when any user joins a channel",
  },
});
