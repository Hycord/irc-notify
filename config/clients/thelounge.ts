export default defineClient({
  id: "thelounge",
  type: "thelounge",
  name: "The Lounge IRC Client",
  enabled: true,
  logDirectory: "./logs/thelounge",
  discovery: {
    patterns: {
      console: "**/logs/**/*.sqlite3",
    },
    pathExtraction: {
      consolePattern: "/logs/",
    },
  },
  serverDiscovery: {
    type: "json",
    jsonPath: "users/admin.json",
    hostnameField: "networks.host",
  },
  fileType: {
    type: "sqlite",
    query: "SELECT * FROM messages ORDER BY time DESC LIMIT 100",
    pollInterval: 5000,
  },
  parserRules: [
    {
      name: "sqlite-message",
      pattern: "^(?<content>.+)$",
      messageType: "privmsg",
      priority: 1,
      captures: {
        content: "content",
      },
    },
  ],
});
