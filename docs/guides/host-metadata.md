# Host Metadata Feature

## Overview

The `metadata.host` field in event configurations allows you to override server-related display values used in templates. This is useful when you want to customize how server information appears in notifications without modifying the actual server configuration.

## Purpose

Server configurations (`config/servers/*.ts`) define the canonical information about IRC servers (hostname, display name, network, etc.). However, sometimes you want to display different values in notifications for specific events:

- Show a friendly alias instead of the actual hostname
- Indicate a specific network or service for context
- Customize display names for different notification types

The `metadata.host` field provides event-level overrides that are merged into the template context **only** for that event's notifications.

## Type Definition

```typescript
interface HostMetadata {
  /** Override server hostname */
  hostname?: string;
  /** Override server display name */
  displayName?: string;
  /** Override network name */
  network?: string;
  /** Override port number */
  port?: number;
  /** Additional custom metadata */
  [key: string]: any;
}
```

## How It Works

### Template Processing Flow

1. **Message arrives**: Client adapter parses log line into `MessageContext`
2. **Server enrichment**: `EventProcessor.enrichContext()` populates `context.server` from matched `ServerConfig`
3. **Event matching**: Events are checked against filters and base event types
4. **Sink processing**: For each matched sink, `BaseSink.processTemplate()` is called
5. **Host override**: If `event.metadata.host` exists, its fields are **merged** into `context.server`
6. **Template rendering**: `TemplateEngine.process()` renders templates using the merged context

### Merge Behavior

The host metadata is merged **on top of** the existing server context:

```typescript
// Original context from server config
context.server = {
  id: "libera",
  hostname: "irc.libera.chat",
  displayName: "Libera",
  network: "Libera.Chat"
}

// Event has metadata.host override
event.metadata.host = {
  displayName: "LiberaChat (Community)",
  network: "FOSS Network"
}

// Template sees merged context
merged.server = {
  id: "libera",                        // From original
  hostname: "irc.libera.chat",          // From original
  displayName: "LiberaChat (Community)", // OVERRIDDEN
  network: "FOSS Network"                // OVERRIDDEN
}
```

## Usage Examples

### Basic Override

Override just the display name:

```typescript
export default defineStrictEvent({
  id: "vip-alerts",
  name: "VIP User Alerts",
  enabled: true,
  baseEvent: "message",
  serverIds: ["libera"],
  sinkIds: ["ntfy"] as const,
  metadata: {
    host: {
      displayName: "Libera (VIP Channel)"
    },
    sink: {
      ntfy: {
        priority: "urgent"
      }
    }
  }
});
```

Template: `[{{server.displayName}}] {{sender.nickname}}`
Result: `[Libera (VIP Channel)] alice`

### Full Override

Override multiple fields:

```typescript
export default defineStrictEvent({
  id: "staff-notices",
  name: "Staff Notices",
  enabled: true,
  baseEvent: "notice",
  serverIds: ["*"],
  sinkIds: ["console", "ntfy"] as const,
  metadata: {
    host: {
      displayName: "IRC Network Staff",
      network: "Official Notices",
      hostname: "staff.network.local"
    },
    sink: {
      ntfy: {
        tags: ["shield", "warning"]
      }
    }
  }
});
```

Template: `[{{server.network}}] {{server.displayName}}: {{message.content}}`
Result: `[Official Notices] IRC Network Staff: Server maintenance in 1 hour`

### Conditional Display

Use host metadata for different contexts:

```typescript
// Event 1: Direct messages use friendly name
export default defineStrictEvent({
  id: "dm-alert",
  baseEvent: "message",
  serverIds: ["libera"],
  filters: {
    operator: "AND",
    filters: [
      { field: "target.type", operator: "equals", value: "query" }
    ]
  },
  sinkIds: ["ntfy"] as const,
  metadata: {
    host: {
      displayName: "Private Message"
    }
  }
});

// Event 2: Channel mentions use channel context
export default defineStrictEvent({
  id: "mention-alert",
  baseEvent: "message",
  serverIds: ["libera"],
  filters: {
    operator: "AND",
    filters: [
      { field: "message.content", operator: "contains", value: "{{metadata.clientNickname}}" }
    ]
  },
  sinkIds: ["ntfy"] as const,
  metadata: {
    host: {
      displayName: "{{target.name}} @ Libera"
    }
  }
});
```

## Available Template Variables

Within `metadata.host`, you can use template variables to create dynamic values:

```typescript
metadata: {
  host: {
    // Reference other context fields
    displayName: "{{target.name}} on {{server.network}}",
    
    // Use custom metadata
    network: "{{metadata.customNetworkName}}",
    
    // Combine multiple sources
    hostname: "{{client.name}} -> {{server.hostname}}"
  }
}
```

**Note**: Template variables in `metadata.host` are processed **after** the host metadata is merged, so you can reference both original and overridden values.

## Common Use Cases

### 1. Multi-Network Alerts

When monitoring multiple servers, clarify which network notifications come from:

```typescript
metadata: {
  host: {
    displayName: "{{server.displayName}} ({{server.network}})"
  }
}
```

### 2. Privacy-Conscious Notifications

Hide actual hostnames in notifications sent to third-party services:

```typescript
metadata: {
  host: {
    hostname: "irc-server",
    displayName: "IRC"
  }
}
```

### 3. Context-Specific Labels

Show different labels based on event type:

```typescript
// For join events
metadata: {
  host: {
    displayName: "New User on {{server.displayName}}"
  }
}

// For quit events
metadata: {
  host: {
    displayName: "User Left {{server.displayName}}"
  }
}
```

### 4. Testing and Development

Use different display names in dev environments:

```typescript
metadata: {
  host: {
    displayName: "[DEV] {{server.displayName}}",
    network: "Development"
  }
}
```

## Type Safety and Autocomplete

The `metadata.host` field has full TypeScript support:

```typescript
// ✅ Type-safe - autocomplete available
metadata: {
  host: {
    displayName: "Custom Name",
    hostname: "custom.host",
    network: "Custom Network",
    port: 6667
  }
}

// ✅ Custom fields allowed
metadata: {
  host: {
    displayName: "Name",
    customField: "anything"
  }
}

// ✅ Optional - can be omitted entirely
metadata: {
  sink: {
    ntfy: { priority: "high" }
  }
}
```

## Best Practices

### 1. Use Sparingly

Only override when necessary. Server configs should be the source of truth:

```typescript
// ❌ Avoid overriding in every event
metadata: {
  host: { displayName: "Libera" }  // Just use server config
}

// ✅ Override for specific context
metadata: {
  host: { displayName: "Libera Staff Channel" }  // Adds value
}
```

### 2. Keep It Simple

Avoid complex template logic in host metadata:

```typescript
// ❌ Too complex
metadata: {
  host: {
    displayName: "{{server.displayName}} {{target.type}} {{message.type}}"
  }
}

// ✅ Simple and clear
metadata: {
  host: {
    displayName: "Staff Notifications"
  }
}
```

### 3. Document Your Overrides

Add comments explaining why you're overriding:

```typescript
metadata: {
  // Override display name to indicate this is a bot-monitored channel
  host: {
    displayName: "{{server.displayName}} [Bot]"
  }
}
```

### 4. Test Your Templates

Verify that overrides appear correctly in notifications:

```bash
# Enable debug mode to see template resolution
bun dev
```

## Related Documentation

- **[STRICT_TYPES_GUIDE.md](./STRICT_TYPES_GUIDE.md)** - Full strict types system guide
- **[CONFIG_TYPE_SYSTEM.md](./CONFIG_TYPE_SYSTEM.md)** - Architecture and design docs
- **Template Engine** - `src/utils/template.ts` - Template variable processing
- **Base Sink** - `src/sinks/base.ts` - Where host merging happens

## Implementation Details

### Source Code Locations

1. **Type Definition**: `src/config/strict-types.ts` - `HostMetadata` interface
2. **Merge Logic**: `src/sinks/base.ts` - `processTemplate()` method
3. **Server Enrichment**: `src/events/processor.ts` - `enrichContext()` method
4. **Template Processing**: `src/utils/template.ts` - `TemplateEngine.process()`

### Validation

Host metadata is **not validated** against server configs - any fields are allowed. This provides flexibility for custom use cases but means typos won't be caught at build time.

```typescript
// All of these are valid (no type errors)
metadata: {
  host: {
    displayName: "Anything",
    customField: 123,
    nested: { data: true }
  }
}
```

To see available server fields, check your server config or `MessageContext.server` type definition.

## FAQ

**Q: Does `metadata.host` affect server matching?**
A: No. Event `serverIds` determines which servers trigger the event. Host metadata only affects template display.

**Q: Can I reference the original server values after overriding?**
A: No. Once merged, original values are replaced. Keep overrides minimal to avoid losing context.

**Q: Do host overrides affect all sinks?**
A: Yes. Host metadata merges into the context before sink processing, so all sinks see the same overridden values.

**Q: Can I use different host metadata per sink?**
A: No. Use `metadata.sink.{sinkId}.title` and `metadata.sink.{sinkId}.body` to override templates per sink instead.

**Q: Are host overrides persisted?**
A: No. They only exist during template processing for that specific event notification.
