export default defineClient({
  id: "textual",
  type: "textual",
  name: "Textual IRC Client",
  enabled: true,
  logDirectory: "./logs/textual",
  discovery: {
    patterns: {
      console: "**/Console/*.txt",
      channels: "**/Channels/**/*.txt",
      queries: "**/Queries/**/*.txt",
    },
    pathExtraction: {
      serverPattern: "/([^/]+)\\s+\\([^)]+\\)/",
      serverGroup: 1,
      channelPattern: "/Channels/([^/]+)/",
      channelGroup: 1,
      queryPattern: "/Queries/([^/]+)/",
      queryGroup: 1,
      consolePattern: "/Console/",
    },
  },
  serverDiscovery: {
    type: "filesystem",
    searchPattern: "**/Console/*.txt",
    hostnamePattern: "Connecting to \\[([^\\]]+)\\]",
    hostnameGroup: 1,
  },
  fileType: {
    type: "text",
    encoding: "utf-8",
  },
  parserRules: [
    {
      name: "skip-session-markers",
      pattern: "^\\[([^\\]]+)\\]\\s+(Begin Session|End Session)",
      skip: true,
      priority: 100,
    },
    {
      name: "service-message",
      pattern: "^\\[(?<timestamp>[^\\]]+)\\]\\s+-(?<nickname>[^-]+)-\\s+(?<content>.+)$",
      messageType: "notice",
      priority: 90,
      captures: {
        timestamp: "timestamp",
        nickname: "nickname",
        content: "content",
      },
    },
    {
      name: "user-joined",
      pattern:
        "^\\[(?<timestamp>[^\\]]+)\\]\\s+(?<nickname>\\S+)\\s+\\((?<username>[^@]+)@(?<hostname>[^)]+)\\)\\s+joined the channel$",
      messageType: "join",
      priority: 90,
      captures: {
        timestamp: "timestamp",
        nickname: "nickname",
        username: "username",
        hostname: "hostname",
      },
    },
    {
      name: "user-left",
      pattern:
        "^\\[(?<timestamp>[^\\]]+)\\]\\s+(?<nickname>\\S+)\\s+\\((?<username>[^@]+)@(?<hostname>[^)]+)\\)\\s+left IRC\\s+\\((?<content>[^)]+)\\)$",
      messageType: "quit",
      priority: 90,
      captures: {
        timestamp: "timestamp",
        nickname: "nickname",
        username: "username",
        hostname: "hostname",
        content: "content",
      },
    },
    {
      name: "topic",
      pattern: "^\\[(?<timestamp>[^\\]]+)\\]\\s+Topic is\\s+(?<content>.+)$",
      messageType: "topic",
      priority: 80,
      captures: {
        timestamp: "timestamp",
        content: "content",
      },
    },
    {
      name: "mode",
      pattern: "^\\[(?<timestamp>[^\\]]+)\\]\\s+Mode is\\s+(?<content>.+)$",
      messageType: "mode",
      priority: 80,
      captures: {
        timestamp: "timestamp",
        content: "content",
      },
    },
    {
      name: "privmsg",
      pattern: "^\\[(?<timestamp>[^\\]]+)\\]\\s+<(?<nickname>[^>]+)>\\s+(?<content>.+)$",
      messageType: "privmsg",
      priority: 85,
      captures: {
        timestamp: "timestamp",
        nickname: "nickname",
        content: "content",
      },
    },
    {
      name: "system-message",
      pattern: "^\\[(?<timestamp>[^\\]]+)\\]\\s+(?<content>.+)$",
      messageType: "system",
      priority: 1,
      captures: {
        timestamp: "timestamp",
        content: "content",
      },
    },
  ],
});
