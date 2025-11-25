# Configuration Overview

This guide provides a comprehensive overview of the IRC Notify configuration system.

## Configuration Structure

IRC Notify uses a hierarchical configuration system with five main components:

```
config/                      # All configuration lives here
  config.ts                  # Main config (references other configs by ID)
  clients/                   # IRC client log adapters
    *.ts
  servers/                   # Server metadata and users
    *.ts
  events/                    # Event matching rules
    *.ts
  sinks/                     # Notification destinations
    *.ts
```

## Main Configuration

**File**: `config/config.ts` or `config.json`

Defines global settings and references all other configs by ID.

```typescript
import { defineStrictConfig } from '../src/config/strict-types';

export default defineStrictConfig({
  global: {
    pollInterval: 1000,           // File poll interval (ms)
    debug: false,                 // Enable debug logging
    defaultLogDirectory: "./logs", // Default log directory
    configDirectory: ".",          // Config directory path
    rescanLogsOnStartup: false    // Rescan logs on startup
  },
  clients: ["textual", "thelounge"],      // Client config IDs
  servers: ["libera", "oftc", "orpheus"], // Server config IDs
  events: ["phrase-alert", "dm-alert"],   // Event config IDs
  sinks: ["console", "ntfy", "webhook"]   // Sink config IDs
});
```

### Global Settings

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `pollInterval` | number | No | 1000 | File polling interval in milliseconds (minimum: 100) |
| `debug` | boolean | No | false | Enable debug logging throughout the system |
| `defaultLogDirectory` | string | No | "/logs" | Default directory for log files |
| `configDirectory` | string | No | "./config" | Directory containing config files |
| `rescanLogsOnStartup` | boolean | No | false | Re-read all logs from beginning on startup |

### Config Arrays

Each array contains IDs referencing config files:

- **`clients`** - References files in `config/clients/<id>.ts`
- **`servers`** - References files in `config/servers/<id>.ts`
- **`events`** - References files in `config/events/<id>.ts`
- **`sinks`** - References files in `config/sinks/<id>.ts`

**Important**: IDs must match the actual config file IDs. Cross-references are validated at load time.

## Config File Resolution

The system looks for config files in this order:

1. `config/config.ts` (TypeScript in subdirectory) ✓ **Preferred**
2. `config.ts` (TypeScript in root)
3. `config/config.json` (JSON in subdirectory)
4. `config.json` (JSON in root)
5. `config.dev.json` (Dev override)

**Custom path**:
```bash
bun start -c /path/to/config.ts
```

## Client Configuration

**File**: `config/clients/<id>.ts`

Defines how to discover and parse log files from IRC clients.

```typescript
import { defineClient } from '../../src/config/types';

export default defineClient({
  id: "textual",
  type: "textual",
  name: "Textual IRC Client",
  enabled: true,
  logDirectory: "../logs/textual",
  
  discovery: {
    patterns: {
      console: "**/Console/*.txt",
      channels: "**/Channels/**/*.txt",
      queries: "**/Queries/**/*.txt"
    },
    pathExtraction: {
      serverPattern: "/([^/]+)\\s*\\([A-F0-9]+\\)/",
      serverGroup: 1,
      channelPattern: "/(?:Channels|Queries)/([^/]+)/",
      channelGroup: 1
    }
  },

  serverDiscovery: {
    type: "static",
    servers: []
  },

  fileType: {
    type: "text",
    encoding: "utf-8"
  },

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
    }
  ]
});
```

**Key fields**:
- `logDirectory` - Base path to log files (supports `${ENV_VAR}`)
- `discovery.patterns` - Glob patterns for finding log files
- `pathExtraction` - Regex patterns to extract server/channel from path
- `parserRules` - Priority-sorted regex rules for parsing lines

See [Type System Documentation](../architecture/type-system.md) for complete client configuration reference.

## Server Configuration

**File**: `config/servers/<id>.ts`

Defines server metadata and known users.

```typescript
import { defineServer } from '../../src/config/types';

export default defineServer({
  id: "libera",
  hostname: "irc.libera.chat",
  displayName: "Libera",
  network: "Libera.Chat",
  port: 6697,
  tls: true,
  enabled: true,
  
  users: {
    "alice": {
      nickname: "alice",
      username: "~alice",
      hostname: "user/alice",
      realName: "Alice Smith",
      metadata: {
        role: "admin"
      }
    }
  },
  
  metadata: {
    timezone: "UTC",
    region: "US"
  }
});
```

**Key fields**:
- `id` - Unique identifier (used in events)
- `hostname` - IRC server hostname
- `displayName` - Human-readable name (used in templates)
- `users` - Map of known users (nickname → UserInfo)
- `metadata` - Custom metadata (merged into context)

See [Type System Documentation](../architecture/type-system.md) for complete reference.

## Event Configuration

**File**: `config/events/<id>.ts`

Defines filter rules for matching messages and routing to sinks.

```typescript
import { defineStrictEvent } from '../../src/config/strict-types';

export default defineStrictEvent({
  sinks: { 'ntfy': 'ntfy', 'console': 'console' }
})({
  id: "phrase-alert",
  name: "Phrase Alert",
  enabled: true,
  baseEvent: "message",
  serverIds: ["*"],
  priority: 90,
  
  filters: {
    operator: "OR",
    filters: [
      {
        field: "message.content",
        operator: "contains",
        value: "{{metadata.clientNickname}}"
      },
      {
        field: "message.content",
        operator: "matches",
        pattern: "@{{metadata.clientNickname}}\\b"
      }
    ]
  },
  
  sinkIds: ["ntfy", "console"],
  
  metadata: {
    description: "Alert on mentions",
    host: {
      displayName: "{{server.displayName}} (Mentions)"
    },
    sink: {
      ntfy: {
        priority: "high",
        tags: ["bell", "mention"]
      }
    }
  }
});
```

**Key fields**:
- `baseEvent` - Base event type (message, join, quit, etc.)
- `serverIds` - Server IDs to match (* = all)
- `filters` - Custom filter rules (AND/OR groups)
- `sinkIds` - Sink IDs to send notifications to
- `priority` - Processing priority (higher = first)
- `metadata.sink` - Per-sink metadata overrides

See [Type System Documentation](../architecture/type-system.md) for complete reference.

## Sink Configuration

**File**: `config/sinks/<id>.ts`

Defines notification destinations and formatting.

```typescript
import { defineSink } from '../../src/config/types';

export default defineSink({
  id: "ntfy",
  type: "ntfy",
  name: "Ntfy Push Notifications",
  enabled: true,
  
  config: {
    endpoint: "${NTFY_ENDPOINT:-https://ntfy.sh}",
    topic: "${NTFY_TOPIC}",
    priority: "default",
    tags: ["irc"]
  },
  
  template: {
    title: "[{{server.displayName}}] {{sender.nickname}}",
    body: "{{message.content}}",
    format: "text"
  },
  
  rateLimit: {
    maxPerMinute: 10,
    maxPerHour: 100
  },
  
  allowedMetadata: ["priority", "tags", "headers"]
});
```

**Key fields**:
- `type` - Sink type (ntfy, webhook, console, file, custom)
- `config` - Sink-specific configuration
- `template` - Default templates (can be overridden by events)
- `rateLimit` - Per-sink rate limiting
- `allowedMetadata` - Metadata keys events can override

See [Type System Documentation](../architecture/type-system.md) for complete reference.

## Configuration Validation

### Load-Time Validation

All configs are validated when loaded:

```bash
bun run config:validate
```

**Checks**:
- ✓ TypeScript/JSON syntax
- ✓ Required fields present
- ✓ Field types correct
- ✓ Enum values valid
- ✓ Regex patterns compile
- ✓ URLs formatted correctly
- ✓ Port numbers in range

### Cross-Reference Validation

After loading, the system validates:

- ✓ Event `serverIds` reference existing servers
- ✓ Event `sinkIds` reference existing sinks
- ✓ Event `metadata.sink` keys match existing sinks
- ✓ Sink metadata keys are in `allowedMetadata`

**Example error**:
```
[EventConfig:phrase-alert.serverIds] references non-existent server: invalid-id
```

### Runtime Validation

During execution:

- ✓ Template variables resolve to existing fields
- ✓ Filter operators are valid
- ✓ Rate limits enforced

## Environment Variables

All string values support environment variable substitution:

### Syntax

**Required variable**:
```typescript
{
  endpoint: "${NTFY_ENDPOINT}"
}
// Fails if NTFY_ENDPOINT not set
```

**With default value**:
```typescript
{
  endpoint: "${NTFY_ENDPOINT:-https://ntfy.sh}"
}
// Uses default if NTFY_ENDPOINT not set
```

**Legacy syntax**:
```typescript
{
  topic: "$NTFY_TOPIC"
}
// Also supported
```

### Common Use Cases

**API endpoints**:
```typescript
{
  endpoint: "${API_ENDPOINT:-https://api.example.com}"
}
```

**Credentials**:
```typescript
{
  headers: {
    "Authorization": "Bearer ${API_TOKEN}"
  }
}
```

**Paths**:
```typescript
{
  logDirectory: "${LOG_DIR:-./logs}"
}
```

**Note**: Environment variable substitution is handled by `EnvSubstitution` utility (`src/utils/env.ts`) during config load.

## Template System

All string configs support `{{field.path}}` syntax:

```typescript
{
  title: "[{{server.displayName}}] {{sender.nickname}}",
  body: "{{message.content}}"
}
```

**Accesses `MessageContext` fields**:
- `{{message.content}}` - Message text
- `{{sender.nickname}}` - Sender's nickname
- `{{target.name}}` - Channel or query name
- `{{server.displayName}}` - Server display name
- `{{metadata.customField}}` - Custom metadata

See [Type System Documentation](../architecture/type-system.md) and [Data Flow](../architecture/data-flow.md) for complete reference.

## Configuration Helpers

### Standard Helpers

Available for basic validation:

```typescript
defineConfig(config)   // Main config
defineClient(config)   // Client config
defineServer(config)   // Server config
defineEvent(config)    // Event config
defineSink(config)     // Sink config
```

### Strict Helpers

Available for compile-time validation:

```typescript
defineStrictConfig(config)  // Prevents duplicate keys
defineStrictEvent({         // Validates sink metadata
  sinks: { 'ntfy': 'ntfy' }
})({ /* event config */ })
```

**Benefits**:
- ✓ TypeScript error on duplicate keys
- ✓ Autocomplete for sink metadata
- ✓ Compile-time validation

See [Strict Types Guide](./strict-types.md) for complete reference.

## Configuration Registry

TypeScript configs auto-register during module load:

```typescript
// config/servers/libera.ts
export default defineServer({
  id: "libera",
  // ... config
}); // ← Automatically calls ConfigRegistry.registerServer()
```

**Benefits**:
- ✓ Validate references during import
- ✓ Catch errors before runtime
- ✓ Enable strict types

**Load order** (enforced by `ConfigLoader`):
1. Clients (no dependencies)
2. Sinks (no dependencies)
3. Servers (no dependencies)
4. Events (depend on servers and sinks)

## Best Practices

### Organization

**One config per file**:
```
config/
  servers/
    libera.ts
    oftc.ts
    orpheus.ts
```

**Related configs together**:
```
config/
  events/
    mentions/
      phrase-alert.ts
      direct-message.ts
    joins/
      user-join.ts
      user-quit.ts
```

### Naming

**Use descriptive IDs**:
```typescript
id: "phrase-alert"           // ✓ Clear
id: "pa"                     // ✗ Ambiguous
```

**Match file name to ID**:
```
config/events/phrase-alert.ts  ✓
  id: "phrase-alert"

config/events/alert.ts         ✗
  id: "phrase-alert"
```

### Documentation

**Add metadata descriptions**:
```typescript
{
  id: "phrase-alert",
  name: "Phrase Alert",
  metadata: {
    description: "Alerts when specific phrases are detected",
    author: "alice",
    lastModified: "2025-11-24"
  }
}
```

### Security

**Use environment variables for secrets**:
```typescript
{
  headers: {
    "Authorization": "Bearer ${API_TOKEN}"  // ✓ Secure
  }
}

// Not this:
{
  headers: {
    "Authorization": "Bearer abc123..."     // ✗ Hardcoded secret
  }
}
```

### Testing

**Validate before deploying**:
```bash
bun run config:validate
```

**Use dev configs for testing**:
```bash
bun run dev:gen
bun start -c config.dev.ts
bun run dev:cleanup
```

## Troubleshooting

### Config not found

**Error**: `No configuration file found`

**Solution**: Check file location and naming:
```bash
ls config/config.ts  # Should exist
```

### Validation fails

**Error**: `[ClientConfig:textual.logDirectory] Missing required field`

**Solution**: Add missing field:
```typescript
{
  id: "textual",
  logDirectory: "./logs/textual"  // Add this
}
```

### Invalid reference

**Error**: `[EventConfig:alert.serverIds] references non-existent server: libera`

**Solution**: Check server ID matches file:
```bash
ls config/servers/libera.ts  # Should exist
# And check ID inside matches:
# export default defineServer({ id: "libera" })
```

### TypeScript errors

**Error**: `Cannot find name 'defineClient'`

**Solution**: Ensure preload is loaded:
```typescript
/// <reference types="../src/types/globals.d.ts" />
import { defineClient } from '../../src/config/types';
```

## Related Documentation

- [TypeScript Config System](./typescript-config.md)
- [Strict Types Guide](./strict-types.md)
- [Type System Reference](../architecture/type-system.md)
- [Data Flow](../architecture/data-flow.md)
- [CLI Reference](./cli.md)
