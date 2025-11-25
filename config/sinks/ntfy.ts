export default defineSink({
  id: "ntfy",
  type: "ntfy",
  name: "Ntfy Notifications",
  enabled: true,
  config: {
    endpoint: "https://ntfy.local.treecord.com",
    topic: "irc-notifications",
    token: "",
    priority: "default",
    tags: ["incoming_envelope"],
  },
  template: {
    title: "[{{server.displayName}}] {{sender.nickname}}",
    body: "{{message.content}}",
    format: "text",
  },
  rateLimit: {
    maxPerMinute: 10,
    maxPerHour: 100,
  },
  allowedMetadata: ["title", "body", "priority", "tags", "headers"],
  metadata: {
    description:
      "Send notifications to ntfy.sh or self-hosted ntfy server. Supports custom title, body, priority, tags, and headers via event metadata.",
  },
});
