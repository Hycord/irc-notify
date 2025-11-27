# TemplateEngine API Reference

The `TemplateEngine` provides template variable substitution using `{{field.path}}` syntax throughout IRC Notify configurations.

## Overview

**Location**: `src/utils/template.ts`

**Purpose**: Process template strings and nested data structures, replacing `{{variables}}` with values from `MessageContext`.

**Key Features**:
- Simple `{{field.path}}` syntax
- Nested property access with dot notation
- Recursive deep processing for complex objects/arrays
- Preserves unknown variables for debugging

---

## Core Methods

### `process(template: string, context: MessageContext): string`

Process a single template string, replacing variables with context values.

**Parameters**:
- `template` - String containing `{{field.path}}` variables
- `context` - MessageContext with data to substitute

**Returns**: String with variables replaced

**Behavior**:
- Variables resolved using dot notation (e.g., `{{server.displayName}}`)
- Unknown variables left unchanged (e.g., `{{missing.field}}` stays as-is)
- `null` and `undefined` values left as original template text
- All resolved values converted to strings

**Example**:
```typescript
const context: MessageContext = {
  sender: { nickname: "alice" },
  server: { displayName: "Libera" },
  message: { content: "Hello" },
  // ... other fields
};

TemplateEngine.process("{{sender.nickname}} on {{server.displayName}}", context);
// Returns: "alice on Libera"

TemplateEngine.process("{{sender.missing}}", context);
// Returns: "{{sender.missing}}" (unchanged)
```

---

### `processDeep<T>(obj: T, context: MessageContext): T`

Recursively process all string values in an object or array through the template engine.

**Parameters**:
- `obj` - Object, array, or primitive value to process
- `context` - MessageContext with data to substitute

**Returns**: New structure with all template strings resolved

**Behavior**:
- Recursively traverses objects and arrays
- Processes all string values that contain `{{variables}}`
- Preserves non-string values (numbers, booleans, null)
- Maintains structure and types
- Skips strings without template variables for performance

**Example**:
```typescript
const metadata = {
  sink: {
    ntfy: {
      title: "Message from {{sender.nickname}}",
      tags: ["user:{{sender.nickname}}", "server:{{server.id}}"],
      priority: "high"  // Not a template, preserved as-is
    }
  },
  description: "Alert from {{server.displayName}}",
  count: 42  // Non-string, preserved
};

const processed = TemplateEngine.processDeep(metadata, context);
// Returns:
// {
//   sink: {
//     ntfy: {
//       title: "Message from alice",
//       tags: ["user:alice", "server:libera"],
//       priority: "high"
//     }
//   },
//   description: "Alert from Libera",
//   count: 42
// }
```

**Use Cases**:
- Processing event metadata before sending to sinks
- Resolving templates in nested configuration objects
- Bulk template processing for complex structures

---

### `hasVariables(template: string): boolean`

Check if a string contains template variables.

**Parameters**:
- `template` - String to check

**Returns**: `true` if string contains `{{...}}` patterns

**Example**:
```typescript
TemplateEngine.hasVariables("Hello {{name}}");  // true
TemplateEngine.hasVariables("Hello world");     // false
TemplateEngine.hasVariables("{{a}} and {{b}}"); // true
```

**Use Cases**:
- Performance optimization (skip processing if no variables)
- Validation of template strings
- Conditional processing logic

---

### `extractVariables(template: string): string[]`

Extract all variable paths from a template string.

**Parameters**:
- `template` - String to parse

**Returns**: Array of variable paths (without `{{` and `}}`)

**Example**:
```typescript
TemplateEngine.extractVariables("{{sender.nickname}} in {{target.name}}");
// Returns: ["sender.nickname", "target.name"]

TemplateEngine.extractVariables("No variables here");
// Returns: []
```

**Use Cases**:
- Template validation
- Dependency analysis
- Documentation generation
- Debugging template issues

---

## Template Syntax

### Basic Variables

Access top-level fields:
```
{{sender}}      - Entire sender object
{{message}}     - Entire message object
{{timestamp}}   - Timestamp Date object
```

### Nested Fields

Access nested properties with dot notation:
```
{{sender.nickname}}           - sender.nickname
{{server.displayName}}        - server.displayName
{{message.content}}           - message.content
{{metadata.customField}}      - metadata.customField
```

### Deep Nesting

Support for arbitrary nesting depth:
```
{{server.metadata.customKey}}
{{metadata.nested.deeply.value}}
```

---

## Context Structure

Templates have access to the entire `MessageContext`:

```typescript
interface MessageContext {
  raw: {
    line: string;              // {{raw.line}}
    timestamp: string;         // {{raw.timestamp}}
  };
  
  message?: {
    content: string;           // {{message.content}}
    type: string;              // {{message.type}}
  };
  
  sender?: {
    nickname: string;          // {{sender.nickname}}
    username?: string;         // {{sender.username}}
    hostname?: string;         // {{sender.hostname}}
    realname?: string;         // {{sender.realname}}
  };
  
  target?: {
    name: string;              // {{target.name}}
    type: string;              // {{target.type}}
  };
  
  client: {
    id: string;                // {{client.id}}
    type: string;              // {{client.type}}
    name: string;              // {{client.name}}
  };
  
  server: {
    id?: string;               // {{server.id}}
    hostname?: string;         // {{server.hostname}}
    displayName?: string;      // {{server.displayName}}
    clientNickname?: string;   // {{server.clientNickname}}
    network?: string;          // {{server.network}}
  };
  
  timestamp: Date;             // {{timestamp}}
  
  metadata: Record<string, any>;  // {{metadata.*}}
}
```

---

## Usage Locations

Templates are processed in multiple locations throughout the system:

### 1. Sink Templates

Defined in sink configuration:
```typescript
// config/sinks/ntfy.ts
{
  template: {
    title: "[{{server.displayName}}] {{sender.nickname}}",
    body: "{{message.content}}"
  }
}
```

### 2. Event Metadata

**All event metadata is processed recursively** before passing to sinks:
```typescript
// config/events/alert.ts
{
  metadata: {
    description: "Alert from {{server.displayName}}",
    sink: {
      ntfy: {
        title: "🔔 {{sender.nickname}}",
        tags: ["user:{{sender.nickname}}", "server:{{server.id}}"]
      }
    }
  }
}
```

### 3. Filter Values

Used in event filters:
```typescript
{
  filters: {
    operator: "AND",
    filters: [
      {
        field: "message.content",
        operator: "contains",
        value: "{{server.clientNickname}}"  // Dynamic value
      }
    ]
  }
}
```

### 4. Filter Patterns

Regex patterns support templates:
```typescript
{
  field: "message.content",
  operator: "matches",
  pattern: "@{{server.clientNickname}}\\b"
}
```

### 5. Array Elements

Templates work in arrays (e.g., filter value arrays):
```typescript
{
  field: "sender.nickname",
  operator: "in",
  value: ["{{server.clientNickname}}", "bot", "admin"]
}
```

---

## Processing Flow

### In EventProcessor

When an event matches, its metadata is processed:

```typescript
// src/events/processor.ts
const processedEvent = {
  ...event,
  metadata: event.metadata 
    ? TemplateEngine.processDeep(event.metadata, context) 
    : undefined
};
```

This ensures **all metadata fields**, no matter how deeply nested, have their template variables resolved before sinks receive the event.

### In Sinks

Individual template strings are processed:

```typescript
// src/sinks/base.ts
const title = TemplateEngine.process(titleTemplate, context);
const body = TemplateEngine.process(bodyTemplate, context);
```

### In Filters

Filter values and patterns are processed during evaluation:

```typescript
// src/utils/filters.ts
const filterValue = typeof filter.value === "string" && TemplateEngine.hasVariables(filter.value)
  ? TemplateEngine.process(filter.value, context)
  : filter.value;
```

---

## Best Practices

### 1. Use Descriptive Variable Names

```typescript
// ✓ Good - Clear what data is accessed
"{{sender.nickname}} sent: {{message.content}}"

// ✗ Bad - Generic or unclear
"{{data}} {{text}}"
```

### 2. Handle Missing Values

Templates preserve unknown variables for debugging:

```typescript
// If server.customField doesn't exist:
"{{server.customField}}" → "{{server.customField}}" (unchanged)

// This helps identify configuration issues
```

### 3. Validate Template Paths

Use `extractVariables()` to check what fields are referenced:

```typescript
const vars = TemplateEngine.extractVariables(template);
// Verify all variables exist in MessageContext
```

### 4. Use Deep Processing for Complex Objects

When dealing with nested event metadata:

```typescript
// ✓ Correct - Use processDeep for objects
const processed = TemplateEngine.processDeep(event.metadata, context);

// ✗ Wrong - process() only works on strings
const processed = TemplateEngine.process(event.metadata, context); // Type error
```

### 5. Consider Performance

- `hasVariables()` is fast - use it to skip unnecessary processing
- `processDeep()` is recursive - only use when needed
- Strings without `{{` are skipped automatically

---

## Error Handling

### Unknown Variables

Unknown variables are **preserved** in the output:

```typescript
TemplateEngine.process("{{unknown.field}}", context);
// Returns: "{{unknown.field}}"
```

**Rationale**: Helps debugging by making it obvious when variables don't resolve.

### Null/Undefined Values

Null and undefined values are treated as "not found":

```typescript
const context = { server: { id: null } };
TemplateEngine.process("{{server.id}}", context);
// Returns: "{{server.id}}" (unchanged)
```

### Invalid Paths

Invalid property access is handled gracefully:

```typescript
const context = { server: null };
TemplateEngine.process("{{server.id}}", context);
// Returns: "{{server.id}}" (no error thrown)
```

---

## Examples

### Simple Notification Title

```typescript
const template = "[{{server.displayName}}] {{sender.nickname}}";
const context = {
  server: { displayName: "Libera" },
  sender: { nickname: "alice" }
};

TemplateEngine.process(template, context);
// Returns: "[Libera] alice"
```

### Complex Metadata Processing

```typescript
const metadata = {
  sink: {
    ntfy: {
      title: "DM from {{sender.nickname}}",
      tags: ["dm", "user:{{sender.nickname}}"],
      headers: {
        "X-User": "{{sender.nickname}}",
        "X-Server": "{{server.id}}"
      }
    },
    discord: {
      embedTitle: "Message on {{server.displayName}}",
      embedColor: 3447003
    }
  }
};

const context = {
  sender: { nickname: "bob" },
  server: { id: "libera", displayName: "Libera" }
};

const result = TemplateEngine.processDeep(metadata, context);
// Returns:
// {
//   sink: {
//     ntfy: {
//       title: "DM from bob",
//       tags: ["dm", "user:bob"],
//       headers: {
//         "X-User": "bob",
//         "X-Server": "libera"
//       }
//     },
//     discord: {
//       embedTitle: "Message on Libera",
//       embedColor: 3447003
//     }
//   }
// }
```

### Dynamic Filter with Template

```typescript
const filter = {
  field: "sender.nickname",
  operator: "in",
  value: ["{{server.clientNickname}}", "admin", "bot"]
};

const context = {
  server: { clientNickname: "mybot" },
  sender: { nickname: "mybot" }
};

// During filter evaluation, the value array is processed:
// ["{{server.clientNickname}}", "admin", "bot"]
// becomes: ["mybot", "admin", "bot"]
// Then sender.nickname ("mybot") is checked against this array → match!
```

---

## Related

- [FilterEngine API](./filter-engine.md) - Uses templates in filter values
- [Type System](../architecture/type-system.md) - Complete MessageContext structure
- [Configuration Guide](../guides/configuration.md) - Template usage in configs
- [Webhook Transforms](../guides/webhook-transforms.md) - Advanced template usage

---

**Version**: 1.1  
**Last Updated**: November 25, 2025
