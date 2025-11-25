# Data Flow Documentation

This document traces the complete data flow through IRC Notify, from log file to notification delivery.

## Overview

```
[Log File] → [Discovery] → [Monitoring] → [Parsing] → [Enrichment] → [Matching] → [Delivery]
```

## Phase 1: Log File Discovery

**Component**: `GenericClientAdapter.getLogPaths()`

### Input
- `ClientConfig.logDirectory` (base path)
- `ClientConfig.discovery.patterns` (glob patterns)

### Process
```typescript
// Example patterns
{
  console: "**/Console/*.txt",
  channels: "**/Channels/**/*.txt",
  queries: "**/Queries/**/*.txt"
}

// Discovers files like:
// logs/textual/Libera (94B79)/Console/2025-11-24.txt
// logs/textual/Libera (94B79)/Channels/#linux-general/2025-11-24.txt
// logs/textual/Libera (94B79)/Queries/NickServ/2025-11-24.txt
```

### Path Extraction
```typescript
pathExtraction: {
  serverPattern: "/([^/]+)\\s*\\([A-F0-9]+\\)/",  // Matches "Libera (94B79)"
  serverGroup: 1,                                    // Captures "Libera"
  channelPattern: "/(?:Channels|Queries)/([^/]+)/", // Matches channel/user
  channelGroup: 1
}
```

### Output
Array of log file paths with extracted metadata:
```typescript
[
  {
    path: "/logs/textual/Libera (94B79)/Channels/#linux-general/2025-11-24.txt",
    serverIdentifier: "Libera",
    channelName: "#linux-general",
    targetType: "channel"
  }
]
```

## Phase 2: File Monitoring

**Component**: `LogWatcher` + `FileWatcher`

### Initialization
```typescript
// For each discovered log file:
new FileWatcher(filePath, adapter, onMessage, debug)
```

### Polling Mechanism
```typescript
// Every pollInterval ms (default: 1000ms):
1. Check if file exists
2. Get current file size
3. If size > lastPosition:
   - Read from lastPosition to end
   - Parse new lines
   - Update lastPosition = size
```

### Line Extraction
```typescript
// Read new content
const content = fs.readFileSync(filePath, 'utf-8');
const newContent = content.slice(lastPosition);

// Split into lines
const lines = newContent.split('\n');

// Process each complete line
lines.forEach(line => {
  if (line.trim()) {
    adapter.parseLine(line, metadata);
  }
});
```

### Output
Stream of raw log lines with file metadata

## Phase 3: Line Parsing

**Component**: `GenericClientAdapter.parseLine()`

### Input
```typescript
{
  line: "[10:42:13] <alice> Hello world!",
  metadata: {
    filePath: "/logs/textual/.../2025-11-24.txt",
    serverIdentifier: "Libera",
    channelName: "#linux-general",
    targetType: "channel"
  }
}
```

### Parser Rule Application
```typescript
// Rules sorted by priority (highest first)
parserRules: [
  {
    name: "privmsg",
    priority: 100,
    pattern: "^\\[(\\d{2}:\\d{2}:\\d{2})\\]\\s*<([^>]+)>\\s*(.+)$",
    messageType: "privmsg",
    groups: {
      timestamp: 1,
      sender: 2,
      content: 3
    }
  },
  {
    name: "join",
    priority: 90,
    pattern: "^\\[(\\d{2}:\\d{2}:\\d{2})\\]\\s*→\\s*([^\\s]+) joined",
    messageType: "join",
    // ...
  }
]

// Apply rules in order until one matches
for (const rule of sortedRules) {
  const regex = new RegExp(rule.pattern, rule.flags);
  const match = line.match(regex);
  
  if (match) {
    // Extract fields using groups
    return buildMessageContext(rule, match, metadata);
  }
}
```

### Field Extraction
```typescript
// Extract fields based on groups
{
  timestamp: match[groups.timestamp],  // "10:42:13"
  sender: match[groups.sender],        // "alice"
  content: match[groups.content]       // "Hello world!"
}
```

### MessageContext Construction
```typescript
{
  raw: {
    line: "[10:42:13] <alice> Hello world!",
    timestamp: new Date("2025-11-24T10:42:13Z")
  },
  message: {
    type: "privmsg",
    content: "Hello world!"
  },
  sender: {
    nickname: "alice"
  },
  target: {
    name: "#linux-general",
    type: "channel"
  },
  client: {
    id: "textual",
    name: "Textual IRC Client",
    type: "textual"
  },
  server: {
    id: "",  // Not yet enriched
    hostname: "",
    displayName: ""
  },
  timestamp: new Date("2025-11-24T10:42:13Z"),
  metadata: {
    serverIdentifier: "Libera",
    filePath: "/logs/..."
  }
}
```

### Skip Rules
```typescript
{
  name: "ignore-system",
  pattern: "^\\[\\d{2}:\\d{2}:\\d{2}\\]\\s*\\*\\*\\*",
  skip: true  // Don't create MessageContext
}
```

### Output
`MessageContext` object or `null` (if skip rule matched)

## Phase 4: Context Enrichment

**Component**: `EventProcessor.enrichContext()`

### Server Matching
```typescript
// Try matching by displayName first
let server = servers.find(s => 
  s.displayName.toLowerCase() === context.metadata.serverIdentifier.toLowerCase()
);

// Fallback to ID match
if (!server) {
  server = servers.find(s => 
    s.id.toLowerCase() === context.metadata.serverIdentifier.toLowerCase()
  );
}
```

### Server Data Merge
```typescript
if (server) {
  context.server = {
    id: server.id,
    hostname: server.hostname,
    displayName: server.displayName,
    network: server.network,
    port: server.port,
    tls: server.tls
  };
  
  // Merge server metadata
  context.metadata = {
    ...context.metadata,
    ...server.metadata
  };
}
```

### User Data Merge
```typescript
// Check if sender matches known user
if (server.users && context.sender?.nickname) {
  const user = server.users[context.sender.nickname];
  
  if (user) {
    context.sender = {
      ...context.sender,
      username: user.username,
      hostname: user.hostname,
      realName: user.realName
    };
    
    // Merge user metadata
    context.metadata = {
      ...context.metadata,
      ...user.metadata
    };
  }
}
```

### Output
Enriched `MessageContext` with complete server and user data

## Phase 5: Event Matching

**Component**: `EventProcessor.processMessage()`

### Event Filtering
```typescript
// Filter to enabled events, sorted by priority
const enabledEvents = events
  .filter(e => e.enabled)
  .sort((a, b) => (b.priority || 0) - (a.priority || 0));
```

### Base Event Type Matching
```typescript
// Map base event to message types
const typeMapping = {
  message: ['privmsg', 'notice'],
  join: ['join'],
  part: ['part'],
  quit: ['quit'],
  any: ['*']
};

// Check if message type matches event's base type
const matchesBase = event.baseEvent === 'any' || 
  typeMapping[event.baseEvent]?.includes(context.message?.type);
```

### Server Filter
```typescript
// Check if event applies to this server
const matchesServer = 
  event.serverIds.includes('*') ||
  event.serverIds.includes(context.server.id);
```

### Custom Filter Evaluation
```typescript
if (event.filters) {
  const matchesFilters = FilterEngine.evaluate(event.filters, context);
  
  if (!matchesFilters) {
    continue;  // Skip this event
  }
}
```

### Dev Mode Override
```typescript
if (context.client.id === 'dev-textual') {
  // Route all dev events to dev-sink-override
  return { ...event, sinkIds: ['dev-sink-override'] };
}
```

### Output
Array of matched `EventConfig` objects

## Phase 6: Notification Delivery

**Component**: `BaseSink.send()` → concrete sink implementations

### Rate Limit Check
```typescript
checkRateLimit(): boolean {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  const oneHourAgo = now - 3600000;
  
  // Count recent notifications
  const recentMinute = timestamps.filter(t => t > oneMinuteAgo).length;
  const recentHour = timestamps.filter(t => t > oneHourAgo).length;
  
  // Check against limits
  if (config.rateLimit?.maxPerMinute && recentMinute >= maxPerMinute) {
    return false;  // Rate limit exceeded
  }
  
  return true;
}
```

### Template Resolution
```typescript
// Get title template (event metadata > sink config > default)
const titleTemplate = 
  event.metadata?.sink?.[sinkId]?.title ||
  sink.template?.title ||
  '{{event.name}}';

// Get body template
const bodyTemplate = 
  event.metadata?.sink?.[sinkId]?.body ||
  sink.template?.body ||
  '{{message.content}}';
```

### Host Metadata Merge
```typescript
// Merge event.metadata.host into context.server
if (event.metadata?.host) {
  context.server = {
    ...context.server,
    ...event.metadata.host
  };
}
```

### Template Processing
```typescript
// Enhanced context with event info
const enhancedContext = {
  ...context,
  event: {
    id: event.id,
    name: event.name,
    baseEvent: event.baseEvent
  }
};

// Process templates
const title = TemplateEngine.process(titleTemplate, enhancedContext);
const body = TemplateEngine.process(bodyTemplate, enhancedContext);

// Example: "[{{server.displayName}}] {{sender.nickname}}"
// Becomes: "[Libera] alice"
```

### Sink-Specific Delivery

#### Console Sink
```typescript
console.log(`\n[${title}]`);
console.log(body);
```

#### Ntfy Sink
```typescript
await fetch(config.endpoint + '/' + config.topic, {
  method: 'POST',
  headers: {
    'Title': title,
    'Priority': metadata.priority || config.priority,
    'Tags': metadata.tags?.join(',') || config.tags
  },
  body: body
});
```

#### Webhook Sink
```typescript
const payload = config.template?.format === 'json'
  ? {
      title,
      body,
      context: {
        server: context.server,
        sender: context.sender,
        target: context.target
      },
      ...metadata.fields  // Additional fields from event
    }
  : body;

await fetch(config.url, {
  method: config.method || 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...config.headers,
    ...metadata.headers
  },
  body: JSON.stringify(payload)
});
```

#### File Sink
```typescript
const timestamp = new Date().toISOString();
const line = `[${timestamp}] [${title}] ${body}\n`;

fs.appendFileSync(config.path, line, 'utf-8');
```

### Rate Limit Tracking
```typescript
trackRateLimit(): void {
  this.rateLimitCounters.get(sinkId)?.push(Date.now());
}
```

### Output
Notification delivered to destination

## Complete Flow Example

### Input: New IRC Message
```
[10:42:13] <alice> Hey @bob, check this out!
```

### Step 1: Discovery
- File: `/logs/textual/Libera (94B79)/Channels/#general/2025-11-24.txt`
- Server: "Libera"
- Channel: "#general"

### Step 2: Monitoring
- LogWatcher detects new content
- Extracts line: `[10:42:13] <alice> Hey @bob, check this out!`

### Step 3: Parsing
- Matches "privmsg" parser rule
- Extracts: timestamp="10:42:13", sender="alice", content="Hey @bob, check this out!"

### Step 4: Enrichment
- Matches ServerConfig: id="libera", displayName="Libera"
- Merges server data into context
- Checks if "alice" is in server.users (no match)

### Step 5: Matching
- Event "phrase-alert" checks:
  - Base event: "message" ✓ (message type is "privmsg")
  - Server: "*" ✓ (applies to all)
  - Filter: content contains "@bob" ✓
- Event matched!

### Step 6: Delivery
- Sink: "ntfy"
- Title template: "[{{server.displayName}}] {{sender.nickname}}"
  - Renders: "[Libera] alice"
- Body template: "{{message.content}}"
  - Renders: "Hey @bob, check this out!"
- Send to ntfy.sh

### Output: Push Notification
```
Title: [Libera] alice
Body: Hey @bob, check this out!
Priority: high
Tags: bell, mention
```

## Performance Metrics

### Typical Processing Times
- Log file polling: 1-5ms per file
- Line parsing: <1ms per line
- Context enrichment: <1ms
- Filter evaluation: <1ms (simple filters)
- Template processing: <1ms
- Notification delivery: 50-200ms (network dependent)

### Bottlenecks
- Network latency (webhook/ntfy sinks)
- File I/O (reading large log files)
- Regex matching (complex parser rules)

### Optimization Strategies
- Increase pollInterval for less frequent checks
- Use skip rules to discard unwanted messages early
- Cache compiled regex patterns
- Batch notifications (future enhancement)

## Related Documentation

- [Architecture Overview](./overview.md) - High-level system design
- [FilterEngine API](../api/filter-engine.md) - Filter evaluation details
- [TemplateEngine API](../api/template-engine.md) - Template processing
- [EventProcessor API](../api/event-processor.md) - Matching logic
