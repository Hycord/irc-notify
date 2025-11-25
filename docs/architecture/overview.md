# System Architecture Overview

This document describes the high-level architecture of IRC Notify.

## Design Philosophy

IRC Notify follows these core principles:

1. **Configuration-Driven**: All behavior defined in config files, no hardcoded logic
2. **Type-Safe**: TypeScript types validate configs at load time
3. **Pipeline-Based**: Clear data flow through distinct stages
4. **Extensible**: Plugin-style architecture for clients and sinks
5. **Zero-Code Adapters**: New IRC clients require only config files

## System Components

### 4-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Log Files (Input)                        │
│          Textual, TheLounge, or other IRC clients            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Layer 1: Clients                           │
│              (GenericClientAdapter)                          │
│  • Discover log files using glob patterns                   │
│  • Parse lines using regex rules (priority-sorted)          │
│  • Extract: server, channel, sender, content                │
│  • Build MessageContext                                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Layer 2: Events                            │
│                (EventProcessor)                              │
│  • Enrich context with server/user metadata                 │
│  • Filter messages using FilterEngine                        │
│  • Match base event types (message, join, quit, etc.)       │
│  • Return matched event configs                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Layer 3: Sinks                            │
│       (ConsoleSink, NtfySink, WebhookSink, etc.)            │
│  • Process templates ({{field.path}} syntax)                │
│  • Merge event metadata                                      │
│  • Apply rate limits                                         │
│  • Deliver notifications                                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Notification Destinations (Output)              │
│      Console, Ntfy, Webhooks, Files, Custom                 │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

#### **IRCNotifyOrchestrator** (`src/index.ts`)
- **Role**: Main coordinator and entry point
- **Responsibilities**:
  - **Startup**: Ensure config directories exist, auto-import backup if no config found
  - Load and validate all configurations
  - Initialize clients, sinks, and event processor
  - Create LogWatchers for each client
  - Route messages from watchers to event processor
  - Dispatch matched events to sinks
  - Optionally start ConfigApiServer for runtime management

**Startup Behavior**:
- Creates config directories if they don't exist (`config/{clients,servers,events,sinks}`, `backups/`)
- If no config file is found, searches `/backups` for most recent backup (by metadata timestamp)
- Auto-imports and merges backup if found, otherwise fails with helpful error
- Removes root `config.ts`/`config.json` when importing backup to `config/` directory

#### **ConfigLoader** (`src/config/loader.ts`)
- **Role**: Configuration loading and validation
- **Responsibilities**:
  - Discover config files (TypeScript or JSON)
  - Load configs in dependency order
  - Apply environment variable substitution
  - Validate individual configs and cross-references
  - Register configs in ConfigRegistry

#### **ConfigRegistry** (`src/config/registry.ts`)
- **Role**: Runtime config tracking and validation
- **Responsibilities**:
  - Track loaded configs for cross-reference validation
  - Validate sink metadata keys against allowedMetadata
  - Provide config lookup during runtime

#### **LogWatcher** (`src/watcher/log-watcher.ts`)
- **Role**: File monitoring and line extraction
- **Responsibilities**:
  - Poll log files for new content
  - Track file positions (byte offsets)
  - Extract new lines
  - Pass lines to ClientAdapter for parsing

#### **GenericClientAdapter** (`src/adapters/generic.ts`)
- **Role**: Log file discovery and parsing
- **Responsibilities**:
  - Discover log files using glob patterns
  - Parse lines using priority-sorted regex rules
  - Extract server, channel, sender, content
  - Build MessageContext objects

#### **EventProcessor** (`src/events/processor.ts`)
- **Role**: Event matching and context enrichment
- **Responsibilities**:
  - Enrich MessageContext with server/user metadata
  - Match base event types
  - Filter using FilterEngine
  - Handle dev mode overrides
  - Return matched EventConfigs

#### **FilterEngine** (`src/utils/filters.ts`)
- **Role**: Message filtering logic
- **Responsibilities**:
  - Evaluate filter groups (AND/OR logic)
  - Support operators: equals, contains, matches, exists, in
  - Resolve template variables in filter values
  - Handle nested filter groups recursively

#### **TemplateEngine** (`src/utils/template.ts`)
- **Role**: Template variable resolution
- **Responsibilities**:
  - Process `{{field.path}}` syntax
  - Access nested MessageContext properties
  - Extract and validate variable names

#### **SinkFactory** (`src/sinks/factory.ts`)
- **Role**: Sink instantiation
- **Responsibilities**:
  - Maintain registry of sink types
  - Create sink instances based on config
  - Support custom sink registration

#### **BaseSink** (`src/sinks/base.ts`)
- **Role**: Common sink functionality
- **Responsibilities**:
  - Rate limit tracking and enforcement
  - Template processing with event metadata
  - Host metadata merging
  - Abstract sendNotification() for implementations

#### **ConfigApiServer** (`src/api/server.ts`)
- **Role**: HTTP API for runtime configuration management
- **Responsibilities**:
  - Expose REST endpoints for config operations
  - Handle config import/export via HTTP
  - Trigger orchestrator reloads
  - Watch config directory for changes
  - Authenticate requests (optional bearer token)
  - Manage individual config file CRUD operations
- **Integration**: Started optionally by IRCNotifyOrchestrator via `startApi()` method
- **Concurrency**: Runs alongside log watcher in same process

## Data Structures

### **MessageContext**
The central data structure flowing through the pipeline:

```typescript
interface MessageContext {
  raw: {
    line: string;
    timestamp: Date;
  };
  message?: {
    type: string;
    content: string;
  };
  sender?: {
    nickname: string;
    username?: string;
    hostname?: string;
    realName?: string;
  };
  target?: {
    name: string;
    type: 'channel' | 'query' | 'console';
  };
  client: {
    id: string;
    name: string;
    type: string;
  };
  server: {
    id: string;
    hostname?: string;
    displayName?: string;
    network?: string;
  };
  timestamp: Date;
  metadata: Record<string, any>;
}
```

## Configuration Registry

TypeScript configs auto-register during module load:

```typescript
// config/servers/libera.ts
export default defineServer({
  id: "libera",
  // ... config
}); // ← Automatically calls ConfigRegistry.registerServer()
```

**Registration Order** (enforced by loader):
1. Clients (no dependencies)
2. Sinks (no dependencies, needed by events)
3. Servers (no dependencies, needed by events)
4. Events (depend on servers and sinks)

**Validation Points**:
- During registration: Sink metadata keys validated
- After all loaded: Cross-reference validation (IDs exist)
- At runtime: Template variables, filter operators

## Execution Flow

### Startup Sequence

1. Load `config.ts` (main config)
2. Load referenced configs in dependency order
3. Validate all configs and cross-references
4. Initialize clients (discover log paths)
5. Initialize sinks
6. Create EventProcessor with events and servers
7. Start LogWatchers for each client
8. Enter main loop (polling)

### Message Processing Flow

1. **File Change Detected**
   - LogWatcher detects new content
   - Extract new lines from file

2. **Parse Line**
   - ClientAdapter applies parser rules (priority order)
   - First matching rule wins
   - Extract fields using regex groups
   - Build MessageContext

3. **Enrich Context**
   - EventProcessor matches server by identifier
   - Merge server config into context.server
   - If sender.nickname matches server.users, merge user data

4. **Match Events**
   - Filter by enabled events
   - Check base event type
   - Check server filter (* or specific IDs)
   - Apply custom filters using FilterEngine
   - Return matched events (all that match)

5. **Send Notifications**
   - For each matched event:
     - For each sink in event.sinkIds:
       - Check rate limits
       - Process title/body templates
       - Merge event metadata
       - Call sink.sendNotification()

### Configuration Hot-Reload

**Current State**: Supported via Config API

**Implementation**: 
- Config API server watches config directory using `fs.watch`
- File changes debounce (500ms) and trigger `reloadFull()`
- Orchestrator reloads all configs and reinitializes components
- Validation failures logged; last known good state preserved

**Manual Reload**:
- Code changes still require process restart
- Config changes auto-reload when Config API enabled
- Manual reload: `POST /api/config/reload`

## Design Decisions

### Why GenericClientAdapter?

**Problem**: Each IRC client has different log formats
**Solution**: Config-driven parsing rules

**Benefits**:
- Zero code for new IRC clients
- Parser rules are testable configs
- Priority system handles complex formats
- Skip rules filter unwanted messages

### Why MessageContext Enrichment?

**Problem**: Parser rules can't know all server/user metadata
**Solution**: Two-phase processing

**Benefits**:
- Parser focuses on extraction
- EventProcessor adds semantic context
- Templates access rich metadata
- Filters can use server/user fields

### Why TypeScript Configs?

**Problem**: JSON lacks validation and autocomplete
**Solution**: TypeScript with validation helpers

**Benefits**:
- Compile-time validation (catch errors early)
- Autocomplete for sink metadata (via defineStrictEvent)
- Environment variables without runtime parsing
- ConfigRegistry validates during import

### Why Priority-Based Matching?

**Problem**: Multiple rules might match a line
**Solution**: Priority field on rules and events

**Benefits**:
- More specific rules checked first
- Predictable behavior
- Explicit precedence
- No ambiguity

### Why Rate Limiting in Sinks?

**Problem**: Message floods could spam notifications
**Solution**: Per-sink rate limits

**Benefits**:
- Sink-specific limits (console vs push)
- Per-minute and per-hour limits
- Protects external services
- Configurable per sink

## Extension Points

### Adding a Custom Sink

1. Extend `BaseSink` class
2. Implement `initialize()` and `sendNotification()`
3. Register in `SinkFactory.sinks`
4. Create sink config file
5. Reference in events

Example:
```typescript
// src/sinks/telegram.ts
export class TelegramSink extends BaseSink {
  async initialize() { /* ... */ }
  async sendNotification(title, body, context, event) { /* ... */ }
}

// src/sinks/factory.ts
static sinks = new Map([
  // ...
  ['telegram', TelegramSink]
]);
```

### Adding a Custom Filter Operator

Modify `FilterEngine.evaluateFilter()`:

```typescript
case 'startsWith':
  return typeof fieldValue === 'string' && 
         fieldValue.startsWith(String(filterValue));
```

### Adding Custom Template Functions

Extend `TemplateEngine.process()` to support:
```
{{uppercase(sender.nickname)}}
{{date(timestamp, 'YYYY-MM-DD')}}
```

## Performance Considerations

### File Polling
- Default: 1000ms interval
- Configurable via `global.pollInterval`
- Uses byte offsets to avoid re-reading entire files

### Config Loading
- Configs loaded once at startup
- ConfigRegistry stores references
- No repeated parsing

### Filter Evaluation
- Short-circuit evaluation for AND/OR
- Priority sorting minimizes checks
- Template variables resolved only if needed

### Rate Limiting
- In-memory counters per sink
- Timestamps pruned on each check
- No persistence (resets on restart)

## Security Considerations

### Config Security
- TypeScript validation prevents code injection
- Environment variables support secrets
- No eval() or dynamic code execution

### Log Access
- Read-only access to log files
- No write operations on logs
- Paths validated during config load

### Network Security
- HTTPS enforced for webhooks (if configured)
- No credential storage in configs (use env vars)
- Rate limits prevent abuse

## Future Enhancements

### Planned Features
- Hot-reload configuration support
- SQLite log format support
- Plugin system for custom sink types
- Web UI for config management
- Metrics and monitoring

### Architecture Evolution
- Event-driven architecture (vs polling)
- Distributed deployment (multiple instances)
- Persistent rate limit state
- Message queue integration

## Related Documentation

- [Data Flow](./data-flow.md) - Detailed data pipeline
- [Type System](./type-system.md) - Complete type specifications
- [Configuration Registry](./registry.md) - Registry implementation details
