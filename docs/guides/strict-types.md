# Strict Type System Usage Guide

## Overview

The strict type system provides **compile-time validation** for:
- ✅ **Duplicate object keys** - TypeScript will error if you define the same key twice
- ✅ **Sink-specific metadata** - Only valid metadata keys for each sink type
- ✅ **Type-safe sink IDs** - Autocomplete for sink IDs and their metadata
- ✅ **Full nested validation** - Every property validated throughout the tree

## Migration Guide

### Standard vs Strict Helpers

| Standard Helper | Strict Helper | Difference |
|----------------|---------------|------------|
| `defineEvent()` | `defineStrictEvent()` | Validates sink metadata keys at compile + runtime |
| `defineConfig()` | `defineStrictConfig()` | Prevents duplicate keys |
| `defineClient()` | `defineStrictClient()` | Prevents duplicate keys |
| `defineServer()` | `defineStrictServer()` | Prevents duplicate keys |
| `defineSink()` | `defineStrictSink()` | Prevents duplicate keys |

## Using Strict Event Types

### Step 1: Define Sink Types

First, specify which sinks your event uses and their types:

```typescript
export default defineStrictEvent({
  sinks: {
    'ntfy': 'ntfy',
    'webhook-discord': 'webhook',
    'console': 'console'
  }
})
```

### Step 2: Define Event Configuration

Now TypeScript knows what metadata each sink accepts:

```typescript
export default defineStrictEvent({
  sinks: {
    'ntfy': 'ntfy',
    'console': 'console'
  }
})({
  id: 'phrase-alert',
  name: 'Phrase Alert',
  enabled: true,
  baseEvent: 'message',
  serverIds: ['*'],
  priority: 95,
  filters: {
    operator: 'AND',
    filters: [
      {
        field: 'message.content',
        operator: 'contains',
        value: 'test'
      }
    ]
  },
  sinkIds: ['ntfy', 'console'], // ✓ Type-safe - must be in sinks object
  metadata: {
    description: 'Test event',
    sink: {
      'ntfy': {
        priority: 'high',        // ✓ Valid - in NtfyMetadata
        tags: ['bell', 'test'],  // ✓ Valid - in NtfyMetadata
        // unknownKey: 'value'   // ✗ TypeScript ERROR - not in NtfyMetadata
      },
      'console': {
        // Empty object - console has no metadata
        // anyKey: 'value'       // ✗ TypeScript ERROR - console accepts no metadata
      }
    }
  }
});
```

## Autocomplete Support

With strict types, you get **full autocomplete**:

```typescript
metadata: {
  sink: {
    'ntfy': {
      // Press Ctrl+Space here to see:
      // - title?: string
      // - body?: string
      // - priority?: 'max' | 'urgent' | 'high' | 'default' | 'low' | 'min'
      // - tags?: string | string[]
      // - headers?: Record<string, string>
      |  // <-- cursor here
    }
  }
}
```

## Duplicate Key Prevention

TypeScript will catch duplicate keys:

```typescript
export default defineStrictEvent({
  sinks: { 'ntfy': 'ntfy' }
})({
  id: 'test',
  name: 'Test',
  baseEvent: 'message',
  serverIds: ['*'],
  sinkIds: ['ntfy'],
  filters: { operator: 'AND', filters: [] },
  priority: 100,
  priority: 200  // ✗ TypeScript ERROR: Duplicate identifier 'priority'
});
```

## Sink Type Metadata Reference

### Ntfy Sink (`'ntfy'`)

```typescript
interface NtfyMetadata {
  title?: string;                // Template override for title
  body?: string;                 // Template override for body
  priority?: 'max' | 'urgent' | 'high' | 'default' | 'low' | 'min';
  tags?: string | string[];      // Emoji tags (e.g., 'warning', 'bell')
  headers?: Record<string, string>;  // Additional HTTP headers
}
```

**Example:**
```typescript
'ntfy': {
  title: '🚨 Alert from {{sender.nickname}}',
  priority: 'urgent',
  tags: ['warning', 'bell']
}
```

### Webhook Sink (`'webhook'`)

```typescript
interface WebhookMetadata {
  title?: string;                // Template override for title
  body?: string;                 // Template override for body
  fields?: Record<string, any>;  // Additional JSON fields in payload
  headers?: Record<string, string>; // Additional HTTP headers
}
```

**Example:**
```typescript
'webhook-discord': {
  title: 'New message from {{sender.nickname}}',
  fields: {
    color: 0xFF0000,
    footer: { text: 'IRC Notify' }
  }
}
```

### Console Sink (`'console'`)

```typescript
interface ConsoleMetadata {
  title?: string;            // Template override for title
  body?: string;             // Template override for body
  format?: 'text' | 'json';  // Output format
  color?: string;            // Terminal color (if supported)
}
```

**Example:**
```typescript
'console': {
  title: '📝 {{event.name}}',
  format: 'json'
}
```

### File Sink (`'file'`)

```typescript
interface FileMetadata {
  title?: string;   // Template override for title
  body?: string;    // Template override for body
}
```

**Example:**
```typescript
'file-log': {
  title: '[{{timestamp}}] {{event.name}}',
  body: '{{sender.nickname}}: {{message.content}}'
}
```

### Custom Sink Types

If you create a custom sink type not in the list, any metadata is allowed:

```typescript
defineStrictEvent({
  sinks: {
    'my-custom-sink': 'custom'  // Any type not in ['ntfy', 'webhook', 'console', 'file']
  }
})({
  // ...
  metadata: {
    sink: {
      'my-custom-sink': {
        anyKey: 'any value',  // ✓ Allowed for custom sinks
        nested: { data: true }
      }
    }
  }
});
```

## Host Metadata

The `metadata.host` field allows you to override server-related display values in templates:

```typescript
export default defineStrictEvent({
  id: 'staff-alerts',
  name: 'Staff Alerts',
  enabled: true,
  baseEvent: 'notice',
  serverIds: ['*'],
  sinkIds: ['ntfy'] as const,
  metadata: {
    description: 'Important staff notices',
    // Override server display in templates
    host: {
      displayName: 'IRC Staff',
      network: 'Official Notices'
    },
    sink: {
      ntfy: {
        priority: 'urgent',
        tags: ['shield']
      }
    }
  }
});
```

**Available fields:**
- `hostname` - Override server hostname
- `displayName` - Override server display name
- `network` - Override network name
- `port` - Override port number
- Any custom fields

These values are **merged** into `context.server` before template processing, allowing templates like `[{{server.displayName}}]` to use overridden values.

**See [HOST_METADATA.md](./HOST_METADATA.md) for complete documentation.**

## Complete Example

Here's a complete event using strict types:

```typescript
export default defineStrictEvent({
  id: 'mention-alert',
  name: 'Mention Alert',
  enabled: true,
  baseEvent: 'message',
  serverIds: ['libera', 'orpheus'],
  priority: 90,
  filters: {
    operator: 'OR',
    filters: [
      {
        field: 'message.content',
        operator: 'contains',
        value: 'myNick'
      },
      {
        field: 'message.content',
        operator: 'matches',
        value: '@myNick\\b'
      }
    ]
  },
  sinkIds: ['ntfy', 'console'] as const,
  metadata: {
    description: 'Alert when someone mentions my nickname',
    host: {
      displayName: '{{server.displayName}} (Mentions)'
    },
    sink: {
      ntfy: {
        title: '💬 Mention in {{target.name}}',
        body: '{{sender.nickname}}: {{message.content}}',
        priority: 'high',
        tags: ['bell', 'speech_balloon']
      }
    }
  }
});
```

## Runtime Validation

Even with TypeScript validation, runtime checks still happen:

- ✅ **Sink existence** - Referenced sinks must exist in config
- ✅ **Server existence** - Referenced servers must exist in config
- ✅ **Metadata key validation** - Validates against `SinkConfig.allowedMetadata` if defined
- ✅ **Filter syntax** - Validates filter operators and structure
- ✅ **Required fields** - Ensures all required fields are present

## Gradual Migration

You can mix standard and strict helpers:

```typescript
// Use strict for new configs
export default defineStrictEvent({...})({...});

// Keep standard for existing configs (still works)
export default defineEvent({...});
```

Both produce the same runtime result, but strict provides better IDE support and compile-time safety.

## Troubleshooting

### "Property does not exist on type"

If you see this error for valid metadata keys, ensure:
1. You're using `defineStrictEvent` (not `defineEvent`)
2. The sink type is correctly specified in the `sinks` object
3. The sink ID in `metadata.sink` matches a key in `sinks`

### "Cannot find name 'defineStrictEvent'"

Ensure the preload script is loaded. Check that:
1. `tsconfig.json` includes `"./config/**/*"`
2. The triple-slash reference is at the top of the file
3. TypeScript server is restarted (Command Palette → "TypeScript: Restart TS Server")

### Autocomplete not working

Try:
1. Restart TypeScript server
2. Check that `config/globals.d.ts` exists
3. Verify the file has the triple-slash reference
4. Check VS Code's TypeScript version (should be workspace version)
