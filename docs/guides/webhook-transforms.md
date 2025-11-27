# Webhook Payload Transforms

## Overview

Webhook sinks use a **configuration-driven payload transformation system** that removes all platform-specific code from the application. All webhook behavior is defined in config files via `payloadTransforms`, similar to how IRC client adapters use `parserRules`.

## Architecture

**Before (Hardcoded)**:
```typescript
// Platform logic in WebhookSink class
if (format === "discord") {
  payload = buildDiscordPayload(...);
} else if (format === "slack") {
  payload = buildSlackPayload(...);
}
```

**After (Config-Driven)**:
```json
{
  "payloadTransforms": [
    {
      "name": "discord",
      "bodyFormat": "json",
      "jsonTemplate": { "username": "{{username}}", ... }
    }
  ]
}
```

## Configuration Structure

### Complete Example

```json
{
  "id": "discord",
  "type": "webhook",
  "name": "Discord Notifications",
  "enabled": true,
  "config": {
    "url": "https://discord.com/api/webhooks/YOUR_WEBHOOK",
    "method": "POST"
  },
  "template": {
    "username": "IRC Notify",
    "embedTitle": "[{{server.displayName}}] {{event.name}}",
    "embedDescription": "**{{sender.nickname}}** in {{target.name}}:\n{{message.content}}",
    "color": "5814015"
  },
  "payloadTransforms": [
    {
      "name": "discord",
      "contentType": "application/json",
      "bodyFormat": "json",
      "jsonTemplate": {
        "username": "{{username}}",
        "embeds": [{
          "title": "{{embedTitle}}",
          "description": "{{embedDescription}}",
          "color": "{{color}}"
        }]
      },
      "priority": 100
    }
  ],
  "allowedMetadata": ["username", "embedTitle", "embedDescription", "color"]
}
```

## Template Processing Flow

1. **Sink Template**: Process `template` section with message context
   - Default values are defined here using template strings
   - Example: `"embedTitle": "[{{server.displayName}}] {{event.name}}"`
   
2. **Metadata Override**: Event metadata can override template values
   - Event specifies: `metadata: { sink: { discord: { embedTitle: "Custom Title" } } }`
   - Overrides the template default
   
3. **Payload Transform**: References processed template variables
   - `"title": "{{embedTitle}}"` uses the processed value
   - No platform-specific logic needed

### Example Flow

**Config Template**:
```json
{
  "template": {
    "embedTitle": "[{{server.displayName}}] New Message",
    "color": "5814015"
  }
}
```

**Event Metadata Override**:
```json
{
  "metadata": {
    "sink": {
      "discord": {
        "color": "16711680"
      }
    }
  }
}
```

**Result**:
- `embedTitle`: Processed from template → `"[Libera] New Message"`
- `color`: Overridden by metadata → `"16711680"`

## Payload Transform Types

### PayloadTransform Interface

```typescript
interface PayloadTransform {
  name: string;              // Transform identifier
  contentType?: string;      // Content-Type header
  method?: string;           // HTTP method override
  headers?: Record<string, string | { template: string }>;
  bodyFormat: "json" | "text" | "form" | "custom";
  jsonTemplate?: Record<string, any>;
  textTemplate?: string;
  formTemplate?: Record<string, string>;
  priority?: number;         // Higher = checked first
  condition?: FilterConfig;  // Optional filter condition
}
```

### Body Formats

#### JSON Format

Used for most modern APIs (Discord, Slack, Telegram).

```json
{
  "bodyFormat": "json",
  "jsonTemplate": {
    "username": "{{username}}",
    "text": "{{text}}",
    "nested": {
      "field": "{{value}}"
    },
    "array": ["{{item1}}", "{{item2}}"]
  }
}
```

All string values in the template are processed recursively.

#### Text Format

Used for simple text payloads (ntfy).

```json
{
  "bodyFormat": "text",
  "textTemplate": "{{body}}",
  "headers": {
    "Title": { "template": "{{title}}" },
    "Priority": { "template": "{{priority}}" }
  }
}
```

> Header Value Sanitization: The `WebhookSink` automatically strips non-ASCII characters (e.g. emojis) from header values to satisfy HTTP header encoding rules enforced by runtimes like Bun/Fetch. If you need rich Unicode content (emoji, non-Latin scripts), place it in the body payload instead of custom headers.

#### Form Format

URL-encoded form data.

```json
{
  "bodyFormat": "form",
  "formTemplate": {
    "message": "{{body}}",
    "priority": "{{priority}}"
  }
}
```

#### Custom Format

Allows event metadata to provide entire payload.

```json
{
  "bodyFormat": "custom"
}
```

Event must provide: `metadata: { payload: { custom: "data" } }`

## Platform Examples

### ntfy

```json
{
  "template": {
    "title": "[{{server.displayName}}] {{sender.nickname}}",
    "body": "{{message.content}}",
    "priority": "default",
    "tags": "incoming_envelope"
  },
  "payloadTransforms": [{
    "name": "ntfy",
    "contentType": "text/plain",
    "bodyFormat": "text",
    "textTemplate": "{{body}}",
    "headers": {
      "Title": { "template": "{{title}}" },
      "Priority": { "template": "{{priority}}" },
      "Tags": { "template": "{{tags}}" }
    }
  }]
}
```

**Event Override**:
```typescript
metadata: {
  sink: {
    ntfy: {
      priority: "urgent",
      tags: "warning,bell"
    }
  }
}
```

### Discord

```json
{
  "template": {
    "username": "IRC Notify",
    "embedTitle": "[{{server.displayName}}] {{event.name}}",
    "embedDescription": "**{{sender.nickname}}**: {{message.content}}",
    "color": "5814015"
  },
  "payloadTransforms": [{
    "name": "discord",
    "contentType": "application/json",
    "bodyFormat": "json",
    "jsonTemplate": {
      "username": "{{username}}",
      "embeds": [{
        "title": "{{embedTitle}}",
        "description": "{{embedDescription}}",
        "color": "{{color}}",
        "timestamp": "{{context.timestamp.toISOString()}}",
        "fields": [
          { "name": "Server", "value": "{{context.server.displayName}}", "inline": true },
          { "name": "Channel", "value": "{{context.target.name}}", "inline": true }
        ]
      }]
    }
  }]
}
```

### Slack

```json
{
  "template": {
    "username": "IRC Notify",
    "iconEmoji": ":speech_balloon:",
    "attachmentTitle": "[{{server.displayName}}] {{event.name}}",
    "attachmentText": "*{{sender.nickname}}*: {{message.content}}",
    "color": "#36a64f"
  },
  "payloadTransforms": [{
    "name": "slack",
    "contentType": "application/json",
    "bodyFormat": "json",
    "jsonTemplate": {
      "username": "{{username}}",
      "icon_emoji": "{{iconEmoji}}",
      "attachments": [{
        "title": "{{attachmentTitle}}",
        "text": "{{attachmentText}}",
        "color": "{{color}}",
        "ts": "{{context.timestamp.getTime() / 1000}}"
      }]
    }
  }]
}
```

### Telegram

```json
{
  "template": {
    "chatId": "YOUR_CHAT_ID",
    "text": "<b>[{{server.displayName}}]</b>\n\n{{sender.nickname}}: {{message.content}}",
    "parseMode": "HTML",
    "disableNotification": "false"
  },
  "payloadTransforms": [{
    "name": "telegram",
    "contentType": "application/json",
    "bodyFormat": "json",
    "jsonTemplate": {
      "chat_id": "{{chatId}}",
      "text": "{{text}}",
      "parse_mode": "{{parseMode}}",
      "disable_notification": "{{disableNotification}}"
    }
  }]
}
```

## Multiple Transforms & Conditions

Transforms can include filter conditions for dynamic routing:

```json
{
  "payloadTransforms": [
    {
      "name": "urgent",
      "condition": {
        "field": "metadata.urgency",
        "operator": "equals",
        "value": "high"
      },
      "jsonTemplate": {
        "priority": "urgent",
        "color": "16711680"
      },
      "priority": 100
    },
    {
      "name": "default",
      "jsonTemplate": {
        "priority": "normal",
        "color": "5814015"
      },
      "priority": 50
    }
  ]
}
```

Transforms are checked in priority order (highest first). First matching transform is used.

## Transform Selection

1. **Explicit Override**: Event metadata specifies `transform: "name"`
2. **Condition Match**: First transform with matching `condition` filter
3. **No Condition**: First transform without condition (catch-all)
4. **Error**: No matching transform found

## Template Variables

Available in all transform templates:

- `{{title}}` - Processed title from template
- `{{body}}` - Processed body from template
- `{{context.*}}` - Full MessageContext (server, sender, target, message, timestamp)
- `{{event.*}}` - EventConfig properties
- `{{metadata.*}}` - Event metadata overrides
- `{{config.*}}` - Sink config values
- Any custom template field

## Best Practices

### 1. Use Template Defaults

Define sensible defaults in `template` section:

```json
{
  "template": {
    "username": "IRC Notify",
    "priority": "default",
    "color": "5814015"
  }
}
```

### 2. Document Metadata Keys

Use `allowedMetadata` to document what events can override:

```json
{
  "allowedMetadata": [
    "username",
    "embedTitle",
    "embedDescription",
    "color",
    "priority"
  ]
}
```

### 3. Include Context Fields

Always include relevant context in payloads:

```json
{
  "jsonTemplate": {
    "message": "{{message.content}}",
    "server": "{{context.server.displayName}}",
    "channel": "{{context.target.name}}",
    "user": "{{context.sender.nickname}}"
  }
}
```

### 4. Use Priority for Fallbacks

Higher priority = more specific conditions:

```json
{
  "payloadTransforms": [
    { "name": "dm-format", "condition": {...}, "priority": 100 },
    { "name": "channel-format", "condition": {...}, "priority": 90 },
    { "name": "default", "priority": 50 }
  ]
}
```

## Adding New Platforms

To add support for a new webhook platform:

1. Create sink config file: `config/sinks/<platform>.json`
2. Define `template` section with defaults
3. Add `payloadTransforms` with platform-specific structure
4. Document in `metadata.setup` field
5. Test with `bun run config:validate`

**No code changes needed** - the WebhookSink class is fully generic.

## Migration from Old Format

Old configs used `payloadFormat` field with hardcoded logic:

```json
{
  "config": {
    "payloadFormat": "discord",
    "username": "IRC Notify"
  }
}
```

New configs use `payloadTransforms`:

```json
{
  "template": {
    "username": "IRC Notify"
  },
  "payloadTransforms": [{
    "name": "discord",
    "bodyFormat": "json",
    "jsonTemplate": {...}
  }]
}
```

All platform-specific code has been removed from WebhookSink class.
