export default defineEvent({
  id: "phrase-alert",
  name: "Phrase Alert",
  enabled: true,
  baseEvent: "any",
  serverIds: ["*"],
  priority: 95,
  filters: {
    operator: "AND",
    filters: [
      {
        field: "message.content",
        operator: "contains",
        value: "testntfy",
      },
    ],
  },
  sinkIds: ["console", "ntfy"],
  metadata: {
    description:
      "Triggers when a specific phrase is found in any message content, regardless of author. Edit the pattern field to customize the phrase.",
    sink: {
      ntfy: {
        priority: "high",
        tags: ["bell", "mag"],
      },
    },
  },
});
