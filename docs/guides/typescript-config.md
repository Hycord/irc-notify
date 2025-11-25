# TypeScript Configuration System

## Overview

The IRC Notify configuration system has been migrated from JSON to TypeScript with rigorous type checking and validation. The system supports both `.ts` and `.json` config files.

## Key Features

✅ **Strong Type Safety** - All configs validated with TypeScript types at load time
✅ **Rigorous Validation** - Comprehensive validation with detailed error messages  
✅ **Import/Export** - Bundle configs to compressed `.json.gz` files
✅ **Merge Functionality** - Intelligently merge config bundles (prefers existing data by default)
✅ **Auto-Cleanup** - Automatically removes duplicate `.json` files when `.ts` exists
✅ **Backwards Compatible** - Still loads `.json` files if needed

## Configuration Structure

```
config/                      # All configuration lives here
  config.ts                  # Main config
  clients/
    textual.ts
  servers/
    libera.ts
    mam.ts
    orpheus.ts
  events/
    phrase-alert.ts
    bot-message.ts
    ...
  sinks/
    ntfy.ts
    console.ts
    ...
```

## CLI Commands

### Validate Configuration
```bash
bun src/cli.ts validate
# or with custom config
bun src/cli.ts validate -c config.ts
# or via npm script
bun run config:validate
```

### Export Configuration
```bash
bun src/cli.ts export -o backup.json.gz
# or via npm script
bun run config:export -- -o backup.json.gz
```

### Import Configuration (Replace)
```bash
bun src/cli.ts import -i backup.json.gz
# or via npm script
bun run config:import -- -i backup.json.gz
```

### Merge Configuration (Prefer Existing)
```bash
# Merge new configs, keep existing on conflict
bun src/cli.ts merge -i new-config.json.gz

# Merge and overwrite existing with new data
bun src/cli.ts merge -i new-config.json.gz --overwrite

# or via npm script
bun run config:merge -- -i new-config.json.gz
```

## TypeScript Config Example

```typescript
import { defineEvent } from '../../src/config/types';

export default defineEvent({
  "id": "phrase-alert",
  "name": "Phrase Alert",
  "enabled": true,
  "baseEvent": "any",
  "serverIds": ["*"],
  "priority": 95,
  
  "filters": {
    "operator": "AND",
    "filters": [
      {
        "field": "message.content",
        "operator": "contains",
        "value": "testntfy"
      }
    ]
  },
  
  "sinkIds": ["console", "ntfy"],
  
  "metadata": {
    "description": "Triggers when a specific phrase is found",
    "sink": {
      "ntfy": {
        "priority": "high",
        "tags": ["bell", "mag"]
      }
    }
  }
});
```

## Validation Features

The new validator catches:
- ❌ Missing required fields
- ❌ Invalid field types
- ❌ Invalid enum values
- ❌ Malformed regex patterns
- ❌ Invalid URLs
- ❌ Port numbers out of range
- ❌ References to non-existent configs
- ❌ Type-specific requirements (e.g., webhook needs URL)

Example error:
```
[EventConfig:phrase-alert.filters[0].operator] Invalid operator: containz. 
Must be one of: equals, notEquals, contains, notContains, matches, 
notMatches, exists, notExists, in, notIn
```

## Migration Script

To convert remaining JSON files to TypeScript:

```bash
bun migrate-to-ts.ts
```

This will:
1. Find all `.json` config files
2. Convert them to `.ts` with proper imports
3. Apply validation wrappers (`defineClient`, `defineServer`, etc.)
4. Delete the original `.json` files

## Import/Export Workflow

### Backup Current Config
```bash
bun src/cli.ts export -o "config-$(date +%Y%m%d).json.gz"
```

### Share Config with Another Instance
```bash
# On source machine
bun src/cli.ts export -o shared-config.json.gz

# Transfer file to target machine

# On target machine (merge with existing)
bun src/cli.ts merge -i shared-config.json.gz

# Or replace entirely
bun src/cli.ts import -i shared-config.json.gz
```

### Merge Behavior

By default, `merge` prefers existing data (stale data):
- ✨ New configs (by ID) are **added**
- ⏭️ Existing configs are **kept** (incoming is skipped)
- ✏️ With `--overwrite`, existing configs are **replaced**

All items are indexed by their `id` field.

## Type Definitions

All types are in `src/types/index.ts`:
- `IRCNotifyConfig` - Main config
- `ClientConfig` - IRC client adapter config
- `ServerConfig` - Server metadata
- `EventConfig` - Event matching rules
- `SinkConfig` - Notification destinations
- `FilterConfig` / `FilterGroup` - Message filtering

Validation helpers in `src/config/types.ts`:
- `defineConfig()` - Main config wrapper
- `defineClient()` - Client config wrapper
- `defineServer()` - Server config wrapper
- `defineEvent()` - Event config wrapper
- `defineSink()` - Sink config wrapper

## Environment Variables

Still supported via `${VAR}` syntax in config values (JSON or TS).

## File Resolution Order

The system looks for config files in this order:
1. `config/config.ts` (preferred - TypeScript in subdirectory)
2. `config.ts` (TypeScript in root)
3. `config/config.json` (JSON in subdirectory)
4. `config.json` (JSON in root)
5. `config.dev.json` (Dev override)

Custom path: `-c /path/to/config.ts`
