# Configuration System

## Overview

IRC Notify uses a JSON-based configuration system with comprehensive validation. All configuration files are stored as JSON for portability and simplicity.

## Key Features

✅ **JSON-Based** - Simple, portable configuration files
✅ **Strong Validation** - Comprehensive validation with detailed error messages  
✅ **Import/Export** - Bundle configs to compressed `.json.gz` files
✅ **Merge Functionality** - Intelligently merge config bundles (prefers existing data by default)
✅ **Auto-Discovery** - Automatically discovers configs in directories (no need to list IDs in main config)

## Configuration Structure

```
config/                      # All configuration lives here
  config.json                # Main config
  clients/
    textual.json
    thelounge.json
  servers/
    libera.json
    mam.json
    orpheus.json
  events/
    phrase-alert.json
    bot-message.json
    ...
  sinks/
    ntfy.json
    console.json
    discord.json
    ...
```

## CLI Commands

### Validate Configuration
```bash
bun src/cli.ts validate
# or with custom config
bun src/cli.ts validate -c config.json
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

## JSON Config Example

```json
{
  "id": "phrase-alert",
  "name": "Phrase Alert",
  "enabled": true,
  "baseEvent": "any",
  "serverIds": ["*"],
  "priority": 95,
  "group": "alerts",
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
}
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

## Auto-Discovery

The system automatically discovers configuration files in each directory. You don't need to list config IDs in the main config file:

```json
{
  "global": {
    "defaultLogDirectory": "../logs",
    "pollInterval": 1000,
    "debug": false
  },
  "api": {
    "enabled": true,
    "port": 3001
  }
}
```

All JSON files in `config/clients/`, `config/servers/`, `config/events/`, and `config/sinks/` are automatically loaded based on their filenames.

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

## Configuration Types

All configuration schemas are defined in `src/types/index.ts`:
- `IRCNotifyConfig` - Main configuration
- `ClientConfig` - IRC client adapter configuration  
- `ServerConfig` - Server metadata and user information
- `EventConfig` - Event matching rules and filters
- `SinkConfig` - Notification destination settings
- `FilterConfig` / `FilterGroup` - Message filtering logic

The validator in `src/config/types.ts` provides comprehensive validation with detailed error messages for all configuration types.

## Environment Variables

Still supported via `${VAR}` syntax in config values (JSON or TS).

## File Resolution Order

The system looks for the main config file in this order:
1. `config/config.json` (preferred - in subdirectory)
2. `config.json` (in root directory)
3. `config.dev.json` (development override)

Custom path: `-c /path/to/config.json`

Individual config files (clients, servers, events, sinks) are automatically discovered by scanning their respective directories.
