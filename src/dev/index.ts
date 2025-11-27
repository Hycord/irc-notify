/**
 * Development testing utilities for generating and cleaning up test data
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface EventRule {
  id: string;
  name: string;
  targetType?: "channel" | "query";
  messageType?: string | string[];
  contentPattern?: RegExp;
  senderPattern?: string | string[];
  requireContent?: boolean;
  weight: number;
}

export interface GeneratedMessage {
  id: string;
  timestamp: number;
  server: string;
  channel?: string;
  from: string;
  to?: string;
  content: string;
  type: string;
  expectedEvents: string[];
}

export interface DevGeneratorOptions {
  numMessages?: number;
  configDir?: string;
  logsDir?: string;
  groundTruthLog?: string;
}

export interface DevCleanupOptions {
  configDir?: string;
  logsDir?: string;
  removeConfigDev?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const LOG_FORMATS = ["standard", "json", "pipe", "xml", "custom"];

const USERNAMES = [
  "Alice",
  "Bob",
  "Charlie",
  "Dave",
  "Eve",
  "Frank",
  "Grace",
  "Henry",
  "Iris",
  "Jack",
  "Kate",
  "Liam",
  "Mary",
  "Nick",
  "Olivia",
  "Paul",
  "Quinn",
  "Rachel",
  "Steve",
  "Tina",
  "Uma",
  "Victor",
  "Wendy",
  "Xavier",
  "Yolanda",
  "Zack",
  "ALLCAPS",
  "test_user_123",
  "MixedCase123",
  "user_host",
  "NickServ",
  "ChanServ",
  "BotServ",
  "Hermes",
];

const CHANNELS = [
  "#general",
  "#dev",
  "#ops",
  "#testing",
  "#random",
  "#café",
  "#____",
  "#admin",
  "#support",
  "#gaming",
];

const EVENT_RULES: EventRule[] = [
  {
    id: "dev-bot-message",
    name: "[DEV] Bot Communication",
    senderPattern: ["Hermes", "ChanServ", "NickServ", "BotServ"],
    messageType: ["privmsg", "notice"],
    targetType: "channel",
    weight: 15,
  },
  {
    id: "dev-phrase-alert",
    name: "[DEV] Phrase Alert",
    contentPattern: /\btestntfy\b/i,
    requireContent: true,
    weight: 20,
  },
  {
    id: "dev-direct-message",
    name: "[DEV] Direct Message Received",
    targetType: "query",
    messageType: ["privmsg", "notice"],
    weight: 15,
  },
  {
    id: "dev-channel-mention",
    name: "[DEV] Mentioned in Channel",
    targetType: "channel",
    contentPattern: /\b(ping|mention|alert|urgent)\b/i,
    requireContent: true,
    weight: 20,
  },
  {
    id: "dev-server-notice",
    name: "[DEV] Server Notice",
    contentPattern: /\b(connect|disconnect|timeout|error|killed)\b/i,
    requireContent: true,
    weight: 5,
  },
  {
    id: "dev-user-ping",
    name: "[DEV] User Mentioned/Pinged",
    senderPattern: "ChanServ",
    contentPattern: /testntfy/,
    messageType: "notice",
    requireContent: true,
    weight: 5,
  },
  {
    id: "dev-user-quit",
    name: "[DEV] User Disconnected",
    messageType: "quit",
    weight: 15,
  },
  {
    id: "dev-join-alert",
    name: "[DEV] User Joined Channel",
    targetType: "channel",
    messageType: "join",
    weight: 20,
  },
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ============================================================================
// MESSAGE GENERATION
// ============================================================================

function generateContentForPattern(eventRule: EventRule): string {
  const baseMessages = [
    "Hello everyone!",
    "Check this out",
    "Quick update here",
    "Just FYI",
    "Important information",
    "Please review this",
    "Can someone help?",
    "Thanks for the info",
  ];

  let content = randomElement(baseMessages);

  if (eventRule.contentPattern) {
    const pattern = eventRule.contentPattern.source;

    if (pattern.includes("testntfy")) {
      const variations = [
        "testntfy",
        "TESTNTFY urgent",
        "testntfy please check",
        "Hey testntfy are you there?",
        "Using testntfy for testing",
      ];
      content = randomElement(variations);
    } else if (pattern.includes("ping|mention|alert|urgent")) {
      const keywords = ["ping", "mention", "alert", "urgent"];
      const keyword = randomElement(keywords);
      const variations = [
        `${keyword} @Alice`,
        `URGENT: ${keyword} needed`,
        `Please ${keyword} the team`,
        `${keyword} everyone!`,
        `This is an ${keyword}`,
      ];
      content = randomElement(variations);
    } else if (pattern.includes("connect|disconnect|timeout|error|killed")) {
      const keywords = ["connect", "disconnect", "timeout", "error", "killed"];
      const keyword = randomElement(keywords);
      const variations = [
        `Connection ${keyword}`,
        `Server ${keyword} detected`,
        `${keyword}: Please check`,
        `Error: ${keyword} occurred`,
      ];
      content = randomElement(variations);
    }
  }

  if (Math.random() > 0.7) {
    const emojis = ["🔥", "✅", "⚠️", "💪", "🤔", "😂", "🎉", "💯"];
    content += ` ${randomElement(emojis)}`;
  }

  return content;
}

function generateMessageForEvent(
  eventRule: EventRule,
  msgId: string,
  timestamp: number,
  server: string,
): GeneratedMessage {
  const msg: GeneratedMessage = {
    id: msgId,
    timestamp,
    server,
    from: randomElement(USERNAMES),
    content: "",
    type: "privmsg",
    expectedEvents: [eventRule.id],
  };

  if (eventRule.messageType) {
    msg.type = Array.isArray(eventRule.messageType)
      ? randomElement(eventRule.messageType)
      : eventRule.messageType;
  }

  if (eventRule.targetType === "channel" || !eventRule.targetType) {
    msg.channel = randomElement(CHANNELS);
  } else if (eventRule.targetType === "query") {
    msg.to = randomElement(USERNAMES);
  }

  if (eventRule.senderPattern) {
    msg.from = Array.isArray(eventRule.senderPattern)
      ? randomElement(eventRule.senderPattern)
      : eventRule.senderPattern;
  }

  if (eventRule.contentPattern || eventRule.requireContent) {
    msg.content = generateContentForPattern(eventRule);
  } else if (msg.type === "quit") {
    msg.content = randomElement([
      "Quit: Connection closed",
      "Killed (timeout)",
      "Ping timeout",
      "Client quit",
    ]);
  } else if (msg.type === "join") {
    msg.content = "";
  } else if (msg.type === "topic") {
    msg.content = generateContentForPattern(eventRule);
  }

  return msg;
}

function generateNoiseMessage(msgId: string, timestamp: number, server: string): GeneratedMessage {
  return {
    id: msgId,
    timestamp,
    server,
    channel: randomElement(CHANNELS),
    from: randomElement(USERNAMES),
    content: randomElement([
      "Normal conversation here",
      "How is everyone doing?",
      "Great weather today",
      "Did you see the game?",
      "Working on the project",
      "Be back in 5 minutes",
      "Thanks!",
      "Sounds good to me",
      "I agree",
      "Let me check that",
    ]),
    type: randomElement(["privmsg", "notice"]),
    expectedEvents: [],
  };
}

function generateMessages(num: number, servers: any[]): GeneratedMessage[] {
  const messages: GeneratedMessage[] = [];
  const baseTimestamp = Date.now() - 7200000;

  const totalWeight = EVENT_RULES.reduce((sum, rule) => sum + rule.weight, 0);
  const noiseWeight = 30;
  const totalWithNoise = totalWeight + noiseWeight;

  let msgCounter = 0;

  for (const eventRule of EVENT_RULES) {
    const count = Math.floor((eventRule.weight / totalWithNoise) * num);

    for (let i = 0; i < count; i++) {
      const timestamp = baseTimestamp + msgCounter * 10000 + Math.floor(Math.random() * 5000);
      const server = randomElement(servers).id;
      const msg = generateMessageForEvent(eventRule, `msg-${msgCounter}`, timestamp, server);
      messages.push(msg);
      msgCounter++;
    }
  }

  const noiseCount = Math.floor((noiseWeight / totalWithNoise) * num);
  for (let i = 0; i < noiseCount; i++) {
    const timestamp = baseTimestamp + msgCounter * 10000 + Math.floor(Math.random() * 5000);
    const server = randomElement(servers).id;
    const msg = generateNoiseMessage(`msg-${msgCounter}`, timestamp, server);
    messages.push(msg);
    msgCounter++;
  }

  messages.sort((a, b) => a.timestamp - b.timestamp);

  messages.forEach((msg, idx) => {
    msg.id = `msg-${idx}`;
  });

  return messages;
}

// ============================================================================
// SERVER GENERATION
// ============================================================================

function generateServers(configDir: string): any[] {
  const servers = [];

  for (let i = 1; i <= 5; i++) {
    const server = {
      id: `dev-shared-server${i}`,
      hostname: `dev-shared-server${i}.irc.network`,
      displayName: `Shared Dev Server ${i}`,
      enabled: true,
      port: 6667,
      ssl: false,
      users: ["NickServ", "ChanServ", "BotServ"],
    };

    const serverPath = path.join(configDir, "servers", `${server.id}.json`);
    const content = JSON.stringify(server, null, 2);
    fs.writeFileSync(serverPath, content);
    servers.push(server);
  }

  for (let i = 1; i <= 5; i++) {
    const server = {
      id: `dev-unique-server${i}`,
      hostname: `dev-unique-server${i}.irc.network`,
      displayName: `Unique Dev Server ${i}`,
      enabled: true,
      port: 6667,
      ssl: false,
      users: ["NickServ", "ChanServ", "BotServ"],
    };

    const serverPath = path.join(configDir, "servers", `${server.id}.json`);
    const content = JSON.stringify(server, null, 2);
    fs.writeFileSync(serverPath, content);
    servers.push(server);
  }

  return servers;
}

// ============================================================================
// PARSER RULES GENERATION
// ============================================================================

function generateParserRules(format: string): any[] {
  const rules = [];

  switch (format) {
    case "standard":
      rules.push({
        pattern: "^\\[(?<timestamp>\\d+)\\] <(?<sender>[^>]+)> (?<content>.*)$",
        messageType: "privmsg",
        targetType: "channel",
        captures: { timestamp: "timestamp", nickname: "sender", content: "content" },
      });
      rules.push({
        pattern: "^\\[(?<timestamp>\\d+)\\] -(?<sender>[^-]+)- (?<content>.*)$",
        messageType: "notice",
        targetType: "channel",
        captures: { timestamp: "timestamp", nickname: "sender", content: "content" },
      });
      rules.push({
        pattern: "^\\[(?<timestamp>\\d+)\\] \\*\\*\\* (?<sender>\\S+) joined$",
        messageType: "join",
        targetType: "channel",
        captures: { timestamp: "timestamp", nickname: "sender" },
      });
      rules.push({
        pattern:
          "^\\[(?<timestamp>\\d+)\\] \\*\\*\\* (?<sender>\\S+) quit \\((?<content>[^)]+)\\)$",
        messageType: "quit",
        targetType: "channel",
        captures: { timestamp: "timestamp", nickname: "sender", content: "content" },
      });
      break;

    case "json":
      rules.push({
        pattern: "^(?<jsonData>\\{.+\\})$",
        messageType: "json",
        parseJson: true,
        captures: { jsonData: "jsonData" },
      });
      break;

    case "pipe":
      rules.push({
        pattern:
          "^(?<timestamp>\\d+)\\|(?<type>[^|]+)\\|(?<sender>[^|]+)\\|(?<target>[^|]+)\\|(?<content>.*)$",
        messageType: "privmsg",
        captures: {
          timestamp: "timestamp",
          nickname: "sender",
          target: "target",
          content: "content",
        },
      });
      break;

    case "xml":
      rules.push({
        pattern:
          '^<msg timestamp="(?<timestamp>\\d+)" type="(?<type>[^"]+)" sender="(?<sender>[^"]*)" target="(?<target>[^"]+)">(?<content>.*?)</msg>$',
        messageType: "privmsg",
        captures: {
          timestamp: "timestamp",
          nickname: "sender",
          target: "target",
          content: "content",
        },
      });
      break;

    case "custom":
      rules.push({
        pattern:
          "^\\[(?<timestamp>\\d+)\\]\\{(?<type>[^}]+)\\}<(?<sender>[^>]*)>@(?<target>[^:]+):(?<content>.*)$",
        messageType: "privmsg",
        captures: {
          timestamp: "timestamp",
          nickname: "sender",
          target: "target",
          content: "content",
        },
      });
      break;
  }

  return rules;
}

// ============================================================================
// LOG FORMATTING
// ============================================================================

function formatMessage(msg: GeneratedMessage, format: string): string {
  switch (format) {
    case "standard":
      if (msg.type === "join") {
        return `[${msg.timestamp}] *** ${msg.from} joined`;
      } else if (msg.type === "quit") {
        return `[${msg.timestamp}] *** ${msg.from} quit (${msg.content})`;
      } else if (msg.type === "notice") {
        return `[${msg.timestamp}] -${msg.from}- ${msg.content}`;
      } else {
        return `[${msg.timestamp}] <${msg.from}> ${msg.content}`;
      }

    case "json":
      return JSON.stringify({
        timestamp: msg.timestamp,
        type: msg.type,
        sender: msg.from,
        target: msg.channel || msg.to || "",
        content: msg.content,
      });

    case "pipe":
      return `${msg.timestamp}|${msg.type}|${msg.from}|${msg.channel || msg.to || ""}|${msg.content}`;

    case "xml":
      return `<msg timestamp="${msg.timestamp}" type="${msg.type}" sender="${msg.from}" target="${msg.channel || msg.to || ""}">${escapeXml(msg.content)}</msg>`;

    case "custom":
      return `[${msg.timestamp}]{${msg.type}}<${msg.from}>@${msg.channel || msg.to || ""}:${msg.content}`;

    default:
      return `[${msg.timestamp}] <${msg.from}> ${msg.content}`;
  }
}

// ============================================================================
// CLIENT LOG GENERATION
// ============================================================================

function generateClientLogs(
  client: any,
  messages: GeneratedMessage[],
  servers: any[],
  logsDir: string,
): void {
  const format = client.type.replace("-client", "");
  const clientLogDir = path.join(logsDir, client.id);

  for (const serverId of client.servers) {
    const serverLogDir = path.join(clientLogDir, `server_${serverId}`);
    const channelsDir = path.join(serverLogDir, "channels");
    const queriesDir = path.join(serverLogDir, "queries");
    const consoleDir = path.join(serverLogDir, "console");

    ensureDir(channelsDir);
    ensureDir(queriesDir);
    ensureDir(consoleDir);

    const consolePath = path.join(consoleDir, "2025-11-24.log");
    fs.writeFileSync(consolePath, "");

    const serverMessages = messages.filter((m) => m.server === serverId);

    const channelMessages: Record<string, GeneratedMessage[]> = {};
    const queryMessages: Record<string, GeneratedMessage[]> = {};

    for (const msg of serverMessages) {
      if (msg.channel) {
        const channelFile = msg.channel.replace("#", "_").replace("&", "_");
        if (!channelMessages[channelFile]) {
          channelMessages[channelFile] = [];
        }
        channelMessages[channelFile].push(msg);
      } else if (msg.to) {
        if (!queryMessages[msg.to]) {
          queryMessages[msg.to] = [];
        }
        queryMessages[msg.to].push(msg);
      }
    }

    for (const [channelFile, msgs] of Object.entries(channelMessages)) {
      const logPath = path.join(channelsDir, `${channelFile}.log`);
      const logContent = msgs.map((m) => formatMessage(m, format)).join("\n");
      fs.writeFileSync(logPath, logContent + "\n");
    }

    for (const [user, msgs] of Object.entries(queryMessages)) {
      const logPath = path.join(queriesDir, `${user}.log`);
      const logContent = msgs.map((m) => formatMessage(m, format)).join("\n");
      fs.writeFileSync(logPath, logContent + "\n");
    }
  }
}

function generateClients(
  messages: GeneratedMessage[],
  servers: any[],
  configDir: string,
  logsDir: string,
): any[] {
  const clients = [];

  for (let i = 1; i <= 5; i++) {
    const format = LOG_FORMATS[i - 1];
    const client = {
      id: `dev-client${i}`,
      type: `${format}-client`,
      name: `Dev Client ${i} (${format} format)`,
      enabled: true,
      logDirectory: `${logsDir}/dev-client${i}`,
      discovery: {
        patterns: {
          console: "**/console/*.log",
          channels: "**/channels/*.log",
          queries: "**/queries/*.log",
        },
        pathExtraction: {
          serverPattern: "/server_([^/]+)/",
          serverGroup: 1,
          channelPattern: "/channels/([^/]+)\\.log$",
          channelGroup: 1,
          queryPattern: "/queries/([^/]+)\\.log$",
          queryGroup: 1,
          consolePattern: "/console/",
        },
      },
      parserRules: generateParserRules(format),
      servers:
        i <= 5
          ? [
              ...servers.filter((s) => s.id.includes("shared")).map((s) => s.id),
              `dev-unique-server${i}`,
            ]
          : servers.filter((s) => s.id.includes("shared")).map((s) => s.id),
    };

    const clientPath = path.join(configDir, "clients", `${client.id}.json`);
    const content = JSON.stringify(client, null, 2);
    fs.writeFileSync(clientPath, content);

    generateClientLogs(client, messages, servers, logsDir);

    clients.push(client);
  }

  return clients;
}

// ============================================================================
// EVENT CLONING
// ============================================================================

function cloneEvents(configDir: string): string[] {
  const originalEvents = [
    "bot-message",
    "phrase-alert",
    "direct-message",
    "server-notice",
    "user-quit",
  ];

  const clonedEvents = [];

  for (const eventId of originalEvents) {
    const originalPath = path.join(configDir, "events", `${eventId}.json`);
    if (!fs.existsSync(originalPath)) continue;

    const content = fs.readFileSync(originalPath, "utf-8");

    try {
      const originalEvent = JSON.parse(content);
      const devEvent = {
        ...originalEvent,
        id: `dev-${eventId}`,
        name: `[DEV] ${originalEvent.name.replace(/^\[.*?\]\s*/, "")}`,
        sinkIds: ["dev-sink"],
        metadata: {
          ...originalEvent.metadata,
          clonedFrom: eventId,
          development: true,
        },
      };

      const devPath = path.join(configDir, "events", `dev-${eventId}.json`);
      const devContent = JSON.stringify(devEvent, null, 2);
      fs.writeFileSync(devPath, devContent);
      clonedEvents.push(`dev-${eventId}`);
    } catch (error) {
      console.warn(`Could not clone event ${eventId}:`, error);
    }
  }

  return clonedEvents;
}

// ============================================================================
// SINK CREATION
// ============================================================================

function createDevSink(configDir: string, logsDir: string): void {
  const sink = {
    id: "dev-sink",
    type: "file",
    name: "Development Log Sink",
    enabled: true,
    config: {
      filePath: `${logsDir}/dev-notifications.log`,
      format: "json",
      append: true,
    },
    template: {
      format: "json",
    },
    metadata: {
      description: "Logs all development notifications to a file for testing",
      development: true,
    },
  };

  const sinkPath = path.join(configDir, "sinks", "dev-sink.json");
  const content = JSON.stringify(sink, null, 2);
  fs.writeFileSync(sinkPath, content);
}

// ============================================================================
// GROUND TRUTH EXPORT
// ============================================================================

function exportGroundTruth(messages: GeneratedMessage[], groundTruthLog: string): void {
  const lines = messages.map((msg) =>
    JSON.stringify({
      messageId: msg.id,
      timestamp: msg.timestamp,
      server: msg.server,
      channel: msg.channel,
      from: msg.from,
      to: msg.to,
      content: msg.content,
      type: msg.type,
      expectedEvents: msg.expectedEvents,
    }),
  );

  fs.writeFileSync(groundTruthLog, lines.join("\n") + "\n");
}

// ============================================================================
// CONFIG UPDATE
// ============================================================================

function updateDevConfig(
  clients: any[],
  servers: any[],
  events: string[],
  configDir: string,
): void {
  const config = {
    global: {
      configDirectory: configDir,
      debug: true,
      rescanLogsOnStartup: true,
    },
    clients: clients.map((c) => c.id),
    servers: servers.map((s) => s.id),
    events: events,
    sinks: ["dev-sink"],
  };

  fs.writeFileSync("./config.dev.json", JSON.stringify(config, null, 2));
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Generate development test data
 */
export async function generateDevData(options: DevGeneratorOptions = {}): Promise<void> {
  const {
    numMessages = 400,
    configDir = "./config",
    logsDir = "./logs/dev",
    groundTruthLog = "./logs/dev-ground-truth.log",
  } = options;

  console.log("🎯 Development Test Data Generator");
  console.log("=====================================\n");

  ensureDir(path.join(configDir, "clients"));
  ensureDir(path.join(configDir, "servers"));
  ensureDir(path.join(configDir, "events"));
  ensureDir(path.join(configDir, "sinks"));
  ensureDir(logsDir);

  console.log("📡 Generating servers...");
  const servers = generateServers(configDir);
  console.log(`  ✓ Created ${servers.length} servers`);

  console.log("\n💬 Generating messages based on event rules...");
  const messages = generateMessages(numMessages, servers);
  console.log(`  ✓ Generated ${messages.length} messages`);

  const eventCounts: Record<string, number> = {};
  messages.forEach((msg) => {
    msg.expectedEvents.forEach((event) => {
      eventCounts[event] = (eventCounts[event] || 0) + 1;
    });
  });
  console.log("\n  Expected event distribution:");
  Object.entries(eventCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([event, count]) => {
      console.log(`    ${event}: ${count}`);
    });

  console.log("\n👥 Generating clients and logs...");
  const clients = generateClients(messages, servers, configDir, logsDir);
  console.log(`  ✓ Created ${clients.length} clients with logs`);

  console.log("\n⚡ Cloning events...");
  const events = cloneEvents(configDir);
  console.log(`  ✓ Cloned ${events.length} events`);

  console.log("\n💾 Creating dev sink...");
  createDevSink(configDir, logsDir);
  console.log("  ✓ Dev sink created");

  console.log("\n📋 Exporting ground truth...");
  exportGroundTruth(messages, groundTruthLog);
  console.log(`  ✓ Ground truth exported (${messages.length} entries)`);

  console.log("\n⚙️  Updating config.dev.json...");
  updateDevConfig(clients, servers, events, configDir);
  console.log("  ✓ Config updated");

  console.log("\n✨ Development data generation complete!\n");
  console.log("📊 Summary:");
  console.log(`  Servers: ${servers.length} (5 shared, 5 unique)`);
  console.log(`  Clients: ${clients.length}`);
  console.log(`  Messages: ${messages.length}`);
  console.log(`  Events: ${events.length}`);
  console.log(`  Ground truth entries: ${messages.length}`);
  console.log(
    `  Total expected event triggers: ${Object.values(eventCounts).reduce((a, b) => a + b, 0)}`,
  );
}

/**
 * Clean up development test data
 */
export async function cleanupDevData(options: DevCleanupOptions = {}): Promise<void> {
  const { configDir = "./config", logsDir = "./logs", removeConfigDev = true } = options;

  console.log("🧹 Starting cleanup of development test data...\n");

  // Remove dev client configs
  console.log("Removing dev client configs...");
  const clientsDir = path.join(configDir, "clients");
  if (fs.existsSync(clientsDir)) {
    const clientFiles = fs
      .readdirSync(clientsDir)
      .filter((f) => f.startsWith("dev-") && f.endsWith(".json"));
    for (const file of clientFiles) {
      const filePath = path.join(clientsDir, file);
      fs.unlinkSync(filePath);
      console.log(`  ✓ Removed ${filePath}`);
    }
  }

  // Remove dev server configs
  console.log("\nRemoving dev server configs...");
  const serversDir = path.join(configDir, "servers");
  if (fs.existsSync(serversDir)) {
    const serverFiles = fs
      .readdirSync(serversDir)
      .filter((f) => f.startsWith("dev-") && f.endsWith(".json"));
    for (const file of serverFiles) {
      const filePath = path.join(serversDir, file);
      fs.unlinkSync(filePath);
      console.log(`  ✓ Removed ${filePath}`);
    }
  }

  // Remove dev event configs
  console.log("\nRemoving dev event configs...");
  const eventsDir = path.join(configDir, "events");
  if (fs.existsSync(eventsDir)) {
    const eventFiles = fs
      .readdirSync(eventsDir)
      .filter((f) => f.startsWith("dev-") && f.endsWith(".json"));
    for (const file of eventFiles) {
      const filePath = path.join(eventsDir, file);
      fs.unlinkSync(filePath);
      console.log(`  ✓ Removed ${filePath}`);
    }
  }

  // Remove dev sink configs
  console.log("\nRemoving dev sink configs...");
  const sinksDir = path.join(configDir, "sinks");
  if (fs.existsSync(sinksDir)) {
    const sinkFiles = fs
      .readdirSync(sinksDir)
      .filter((f) => f.startsWith("dev-") && f.endsWith(".json"));
    for (const file of sinkFiles) {
      const filePath = path.join(sinksDir, file);
      fs.unlinkSync(filePath);
      console.log(`  ✓ Removed ${filePath}`);
    }
  }

  // Remove dev log directory
  console.log("\nRemoving dev log directory...");
  const devLogsPath = path.join(logsDir, "dev");
  if (fs.existsSync(devLogsPath)) {
    fs.rmSync(devLogsPath, { recursive: true, force: true });
    console.log(`  ✓ Removed ${devLogsPath}`);
  }

  // Remove dev notification logs
  console.log("\nRemoving dev notification logs...");
  const devNotificationsPath = path.join(logsDir, "dev-notifications.log");
  if (fs.existsSync(devNotificationsPath)) {
    fs.unlinkSync(devNotificationsPath);
    console.log(`  ✓ Removed ${devNotificationsPath}`);
  }

  // Remove dev ground truth log
  const devGroundTruthPath = path.join(logsDir, "dev-ground-truth.log");
  if (fs.existsSync(devGroundTruthPath)) {
    fs.unlinkSync(devGroundTruthPath);
    console.log(`  ✓ Removed ${devGroundTruthPath}`);
  }

  // Remove dev test summary
  const devTestSummaryPath = path.join(logsDir, "dev-test-summary.md");
  if (fs.existsSync(devTestSummaryPath)) {
    fs.unlinkSync(devTestSummaryPath);
    console.log(`  ✓ Removed ${devTestSummaryPath}`);
  }

  // Remove config.dev files
  if (removeConfigDev) {
    console.log("\nRemoving config.dev files...");
    for (const ext of [".json"]) {
      const configDevPath = `./config.dev${ext}`;
      if (fs.existsSync(configDevPath)) {
        fs.rmSync(configDevPath);
        console.log(`  ✓ Removed ${configDevPath}`);
      }
    }
  }

  console.log("\n✨ Cleanup complete! All development test data has been removed.\n");
}
