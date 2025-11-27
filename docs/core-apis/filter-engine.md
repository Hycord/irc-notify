# FilterEngine API

The `FilterEngine` provides powerful message filtering capabilities with support for multiple operators, nested groups, and template variable resolution.

## Location

`src/utils/filters.ts`

## Class: FilterEngine

Static utility class for evaluating filter configurations against message contexts.

### Methods

#### `evaluate(filterGroup, context): boolean`

Evaluate a filter group against a message context.

**Parameters:**
- `filterGroup: FilterGroup` - The filter group to evaluate
- `context: MessageContext` - The message context to check

**Returns:** `boolean` - `true` if the filter group matches, `false` otherwise

**Example:**
```typescript
const filterGroup = {
  operator: "AND",
  filters: [
    { field: "message.content", operator: "contains", value: "hello" },
    { field: "sender.nickname", operator: "equals", value: "alice" }
  ]
};

const matches = FilterEngine.evaluate(filterGroup, context);
// Returns true if message contains "hello" AND sender is "alice"
```

## Types

### FilterGroup

Logical grouping of filters with AND/OR operators.

```typescript
interface FilterGroup {
  operator: 'AND' | 'OR';
  filters: Array<FilterConfig | FilterGroup>;  // Supports nesting
}
```

**Example - Nested Groups:**
```typescript
{
  operator: "AND",
  filters: [
    {
      field: "target.type",
      operator: "equals",
      value: "channel"
    },
    {
      operator: "OR",  // Nested group
      filters: [
        { field: "message.content", operator: "contains", value: "urgent" },
        { field: "message.content", operator: "contains", value: "important" }
      ]
    }
  ]
}
// Matches: channel messages containing "urgent" OR "important"
```

### FilterConfig

Individual filter rule.

```typescript
interface FilterConfig {
  field: string;          // Dot-notation path to field (e.g., "sender.nickname")
  operator: FilterOperator;
  value?: any;            // For comparison operators
  pattern?: string;       // For regex operators
  flags?: string;         // Regex flags (e.g., "i", "gi")
}
```

### FilterOperator

Supported filter operators:

#### Equality Operators

**`equals`** - Exact match
```typescript
{ field: "sender.nickname", operator: "equals", value: "alice" }
// Matches: sender.nickname === "alice"
```

**`notEquals`** - Not equal
```typescript
{ field: "message.type", operator: "notEquals", value: "system" }
// Matches: message.type !== "system"
```

#### String Operators

**`contains`** - Substring match (string or array)
```typescript
{ field: "message.content", operator: "contains", value: "test" }
// Matches: message.content includes "test"

{ field: "tags", operator: "contains", value: "important" }
// Matches: tags array contains "important"
```

**`notContains`** - Substring not present
```typescript
{ field: "message.content", operator: "notContains", value: "spam" }
// Matches: message.content does not include "spam"
```

#### Regex Operators

**`matches`** - Regex pattern match
```typescript
{ 
  field: "sender.nickname", 
  operator: "matches", 
  pattern: "^bot_.*",
  flags: "i"
}
// Matches: sender.nickname matches /^bot_.*/i
```

**`notMatches`** - Regex pattern doesn't match
```typescript
{ 
  field: "message.content", 
  operator: "notMatches", 
  pattern: "\\[SPAM\\]"
}
// Matches: message.content doesn't match /\[SPAM\]/
```

#### Existence Operators

**`exists`** - Field is defined and not null
```typescript
{ field: "sender.realName", operator: "exists" }
// Matches: sender.realName !== undefined && sender.realName !== null
```

**`notExists`** - Field is undefined or null
```typescript
{ field: "target.name", operator: "notExists" }
// Matches: target.name === undefined || target.name === null
```

#### Array Operators

**`in`** - Value is in array
```typescript
{ 
  field: "server.id", 
  operator: "in", 
  value: ["libera", "freenode", "oftc"]
}
// Matches: ["libera", "freenode", "oftc"].includes(server.id)
```

**`notIn`** - Value is not in array
```typescript
{ 
  field: "message.type", 
  operator: "notIn", 
  value: ["system", "error"]
}
// Matches: !["system", "error"].includes(message.type)
```

## Template Variables in Filters

Filter values, patterns, and array elements all support template variable resolution:

### String Values

```typescript
{
  field: "message.content",
  operator: "contains",
  value: "{{server.clientNickname}}"  // Resolved at runtime
}
```

### Array Values

Template variables in array elements are processed individually:

```typescript
{
  field: "sender.nickname",
  operator: "in",
  value: ["{{server.clientNickname}}", "bot", "admin"]
  // If server.clientNickname = "alice", resolves to: ["alice", "bot", "admin"]
}
```

### Patterns

Regex patterns support template variables:

```typescript
{
  field: "message.content",
  operator: "matches",
  pattern: "@{{server.clientNickname}}\\b"
  // If server.clientNickname = "mybot", pattern becomes: @mybot\b
}
```

**Use cases:**
- Match mentions of the client's nickname
- Filter by dynamic server identifiers
- Compare against enriched metadata
- Create dynamic filter lists

**Example - Dynamic nickname filtering:**
```typescript
// Match direct messages or mentions
{
  operator: "OR",
  filters: [
    {
      field: "target.nickname",
      operator: "equals",
      value: "{{server.clientNickname}}"
    },
    {
      field: "message.content",
      operator: "matches",
      pattern: "@{{server.clientNickname}}\\b"
    }
  ]
}
```

## Field Paths

Access nested properties using dot notation:

```typescript
// MessageContext structure
{
  message: {
    type: "privmsg",
    content: "Hello world"
  },
  sender: {
    nickname: "alice",
    hostname: "user@host.com"
  },
  target: {
    name: "#general",
    type: "channel"
  },
  server: {
    id: "libera",
    displayName: "Libera",
    network: "Libera.Chat"
  },
  metadata: {
    serverIdentifier: "Libera",
    customField: "value"
  }
}

// Field paths:
"message.type"           → "privmsg"
"message.content"        → "Hello world"
"sender.nickname"        → "alice"
"sender.hostname"        → "user@host.com"
"target.name"            → "#general"
"target.type"            → "channel"
"server.id"              → "libera"
"server.displayName"     → "Libera"
"metadata.customField"   → "value"
```

## Common Patterns

### Mention Detection
```typescript
{
  operator: "OR",
  filters: [
    {
      field: "message.content",
      operator: "contains",
      value: "{{server.clientNickname}}"
    },
    {
      field: "message.content",
      operator: "matches",
      pattern: "@{{server.clientNickname}}\\b"
    }
  ]
}
```

### Channel-Specific Rules
```typescript
{
  operator: "AND",
  filters: [
    {
      field: "target.type",
      operator: "equals",
      value: "channel"
    },
    {
      field: "target.name",
      operator: "in",
      value: ["#general", "#ops", "#staff"]
    }
  ]
}
```

### Bot Detection
```typescript
{
  operator: "OR",
  filters: [
    {
      field: "sender.nickname",
      operator: "matches",
      pattern: "^bot[_-]",
      flags: "i"
    },
    {
      field: "sender.nickname",
      operator: "matches",
      pattern: "bot$",
      flags: "i"
    }
  ]
}
```

### Keyword Alerts
```typescript
{
  operator: "AND",
  filters: [
    {
      field: "message.type",
      operator: "equals",
      value: "privmsg"
    },
    {
      operator: "OR",
      filters: [
        { field: "message.content", operator: "contains", value: "urgent" },
        { field: "message.content", operator: "contains", value: "emergency" },
        { field: "message.content", operator: "contains", value: "critical" }
      ]
    }
  ]
}
```

### Direct Message Filter
```typescript
{
  operator: "AND",
  filters: [
    {
      field: "target.type",
      operator: "equals",
      value: "query"
    },
    {
      field: "message.type",
      operator: "equals",
      value: "privmsg"
    }
  ]
}
```

### Exclude System Messages
```typescript
{
  operator: "AND",
  filters: [
    {
      field: "message.type",
      operator: "notEquals",
      value: "system"
    },
    {
      field: "sender.nickname",
      operator: "exists"
    }
  ]
}
```

## Performance Considerations

### Short-Circuit Evaluation

**AND groups**: Stop at first `false`
```typescript
{
  operator: "AND",
  filters: [
    { /* cheap check */ },
    { /* expensive check */ }  // Not evaluated if first is false
  ]
}
```

**OR groups**: Stop at first `true`
```typescript
{
  operator: "OR",
  filters: [
    { /* likely match */ },
    { /* fallback */ }  // Not evaluated if first is true
  ]
}
```

### Order Filters by Cost

Place cheaper filters first:
```typescript
{
  operator: "AND",
  filters: [
    { field: "message.type", operator: "equals", value: "privmsg" },  // Fast
    { field: "message.content", operator: "matches", pattern: "..." }  // Slower
  ]
}
```

### Avoid Deep Nesting

Deeply nested groups are harder to understand and debug:
```typescript
// ❌ Avoid
{ operator: "AND", filters: [
  { operator: "OR", filters: [
    { operator: "AND", filters: [ /* ... */ ] }
  ]}
]}

// ✅ Prefer flatter structure
{ operator: "AND", filters: [ /* ... */ ] }
```

## Debugging

Enable debug mode to see filter evaluation:

```typescript
// config.ts
{
  global: {
    debug: true  // Enables filter debugging
  }
}
```

**Debug output:**
```
[DEBUG] Evaluating filter group (AND):
[DEBUG]   Filter: message.content contains "test" → true
[DEBUG]   Filter: sender.nickname equals "alice" → false
[DEBUG] Result: false (AND requires all true)
```

## Error Handling

Invalid operators log warnings but don't throw:

```typescript
{ field: "message.content", operator: "invalid" }
// Logs: "Unknown filter operator: invalid"
// Returns: false
```

Invalid regex patterns throw during config validation:
```typescript
{ 
  field: "message.content", 
  operator: "matches", 
  pattern: "[invalid("  // ✗ Caught by ConfigValidator
}
```

## Related Documentation

- [Filter System Guide](../guides/filters.md) - Complete filter guide
- [EventProcessor API](./event-processor.md) - Event matching logic
- [TemplateEngine API](./template-engine.md) - Template variable resolution
- [Configuration Type System](../architecture/type-system.md) - Filter types
