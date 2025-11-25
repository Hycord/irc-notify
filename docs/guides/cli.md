# Command Line Interface (CLI)

IRC Notify provides a comprehensive CLI for configuration management, validation, and development testing.

## Basic Usage

```bash
bun src/cli.ts <command> [options]
```

Or use npm scripts:
```bash
bun run <script>
```

## Commands

### start / dev

Run the notification system.

**start**: Run once
```bash
bun start
# or
bun src/index.ts
```

**dev**: Watch mode (auto-reload on code changes)
```bash
bun dev
# or
bun --watch src/index.ts
```

**Note**: Config changes still require manual restart (no hot-reload for configs).

---

### config:validate

Validate all configuration files without running the system.

```bash
bun run config:validate

# With custom config path
bun src/cli.ts validate -c config/config.ts
```

**What it validates**:
- TypeScript/JSON syntax
- Required fields present
- Field types correct
- Regex patterns valid
- URL formats correct
- Port numbers in range (1-65535)
- Cross-references (IDs exist)
- Sink metadata keys allowed

**Example output**:
```
✓ Configuration is valid
  - 2 clients
  - 3 servers
  - 8 events
  - 4 sinks
```

**Error example**:
```
✗ Configuration validation failed:
[EventConfig:phrase-alert.serverIds] references non-existent server: invalid-id
```

---

### config:export

Export all configurations to a compressed JSON bundle.

```bash
bun run config:export

# With custom output path
bun run config:export -- -o backup-2025-11-24.json.gz

# With custom config source
bun src/cli.ts export -o backup.json.gz -c config/config.ts
```

**Options**:
- `-o, --output <path>` - Output file path (default: `config-export-<date>.json.gz`)
- `-c, --config <path>` - Config file to export from (default: auto-detect)

**What it exports**:
- Main config (config/config.ts)
- All client configs
- All server configs
- All event configs
- All sink configs
- Metadata (version, timestamp, paths)

**Export format**:
```json
{
  "version": "1.0",
  "timestamp": "2025-11-24T10:42:13.000Z",
  "metadata": {
    "sourceConfigPath": "/path/to/config.ts",
    "configDirectory": "./config",
    "unpackConfigDir": "./config"
  },
  "config": { /* main config */ },
  "clients": [ /* all clients */ ],
  "servers": [ /* all servers */ ],
  "events": [ /* all events */ ],
  "sinks": [ /* all sinks */ ]
}
```

**Use cases**:
- Backup before changes
- Share configs between instances
- Version control
- Deployment packages

---

### config:import

Import configurations from a JSON bundle (replace mode).

```bash
bun run config:import -- -i backup.json.gz

# With options
bun src/cli.ts import \
  -i backup.json.gz \
  -t ./config \
  --overwrite \
  --adjust-path \
  --reload
```

**Options**:
- `-i, --input <path>` - Input file path (required)
- `-t, --target <dir>` - Target directory (default: auto-detect from existing config)
- `--overwrite` - Overwrite existing files (default: false)
- `--adjust-path` - Adjust configDirectory to match existing structure (default: true)
- `--reload` - Reload configuration after import (default: false)

**Behavior**:
1. Auto-detects target directory from existing config
2. Adjusts imported config's `configDirectory` to match
3. Creates directory structure if needed
4. Writes all config files (as JSON)
5. **Automatically migrates all JSON configs to TypeScript**
6. **Removes root `config.ts`/`config.json` if importing to `config/` directory**
7. Optionally reloads config

**Smart path adjustment**:
```typescript
// Existing config has: configDirectory: "./config"
// Import bundle has: configDirectory: "../myconfigs"
// Result: Adjusts to use "./config" (preserves existing structure)
```

**Example output**:
```
Importing configuration from backup.json.gz...
Auto-detected target directory from existing config: ./config
  Version: 1.0
  Timestamp: 2025-11-24T10:42:13.000Z
  Source: /original/path/config.ts
Adjusted configDirectory: "../myconfigs" → "./config"
Writing configuration files to ./config
  ✓ Main config written
  ✓ 2 clients written
  ✓ 3 servers written
  ✓ 8 events written
  ✓ 4 sinks written
✓ Import complete
  Target: ./config
  Imported: 18 files
```

---

### config:merge

Merge configurations from a JSON bundle (prefer existing by default).

```bash
bun run config:merge -- -i new-configs.json.gz

# Prefer incoming over existing
bun src/cli.ts merge -i new-configs.json.gz --overwrite
```

**Options**:
- `-i, --input <path>` - Input file path (required)
- `-t, --target <dir>` - Target directory (default: auto-detect)
- `--overwrite` - Prefer incoming over existing (default: prefer existing)

**Merge behavior**:

**Without `--overwrite`** (default - prefer existing):
```
Existing config: libera.ts exists → KEEP existing
New config: orpheus.ts new → ADD new config
```

**With `--overwrite`** (prefer incoming):
```
Existing config: libera.ts exists → REPLACE with incoming
New config: orpheus.ts new → ADD new config
```

**Use cases**:
- Add new configs without affecting existing ones
- Update configs from another instance
- Selective config updates

**Example output**:
```
Merging configuration from new-configs.json.gz...
  Strategy: Prefer existing (use --overwrite to prefer incoming)
  
Merge summary:
  Clients: 1 added, 1 kept existing
  Servers: 2 added, 1 kept existing
  Events: 3 added, 5 kept existing
  Sinks: 0 added, 4 kept existing

✓ Merge complete
  Target: ./config
  Added: 6 files
  Kept: 11 files
```

---

### config:migrate

Migrate JSON configs to TypeScript format.

```bash
bun run config:migrate

# With custom directory
bun src/cli.ts migrate -d ./config
```

**Options**:
- `-d, --dir <path>` - Config directory (default: `./config`)

**What it does**:
1. Migrates main config files (`config.json`, `config/config.json`) to TypeScript
2. Scans for `.json` files in `clients/`, `servers/`, `events/`, `sinks/`
3. Converts each to TypeScript with proper `define*()` wrapper
4. Preserves formatting (2-space indent)
5. Deletes original `.json` file after successful conversion
6. Skips files that already have a `.ts` version

**Conversion example**:
```json
// config/servers/libera.json
{
  "id": "libera",
  "hostname": "irc.libera.chat",
  "displayName": "Libera"
}
```

Becomes:
```typescript
// config/servers/libera.ts
import { defineServer } from '../../src/config/types';

export default defineServer({
  "id": "libera",
  "hostname": "irc.libera.chat",
  "displayName": "Libera"
});
```

**Example output**:
```
Migrating JSON configs to TypeScript...
Config directory: ./config

Migrating clients...
  ✓ textual.json → textual.ts
  
Migrating servers...
  ✓ libera.json → libera.ts
  ⊘ orpheus.ts already exists, skipping orpheus.json
  
Migrating events...
  ✓ phrase-alert.json → phrase-alert.ts
  ✗ direct-message.json failed: Invalid JSON
  
Migrating sinks...
  ✓ console.json → console.ts

Migration complete:
  Converted: 4 files
  Skipped: 1 file (already migrated)
  Failed: 1 file
```

---

### dev:gen

Generate development test data (500 messages, dev configs).

```bash
bun run dev:gen

# With custom options
bun src/cli.ts gen-dev -n 1000
```

**Options**:
- `-n, --num <count>` - Number of messages to generate (default: 400)

**What it generates**:
- **10 servers**: 5 shared across clients, 5 unique
- **5 IRC clients**: Different log formats (textual, thelounge, etc.)
- **Dev event configs**: Cloned from production events with `dev-` prefix
- **Dev sink**: Captures all notifications to file
- **Log files**: Messages matching event filter rules
- **Ground truth log**: Expected notifications for validation
- **config.dev.ts**: Main dev config

**Directory structure**:
```
config/
  clients/
    dev-textual.ts
    dev-thelounge.ts
    ...
  servers/
    dev-server-1.ts
    dev-server-2.ts
    ...
  events/
    dev-phrase-alert.ts
    dev-direct-message.ts
    ...
  sinks/
    dev-sink-override.ts
logs/
  dev/
    textual/
      Server1/Channels/#general/2025-11-24.txt
      Server2/Channels/#linux/2025-11-24.txt
      ...
config.dev.ts
logs/dev-ground-truth.log
logs/dev-notifications.log
```

**Ground truth format**:
```json
{
  "id": "msg-1",
  "timestamp": 1732448533000,
  "server": "Server1",
  "channel": "#general",
  "from": "alice",
  "content": "Test message",
  "type": "privmsg",
  "expectedEvents": ["dev-phrase-alert"]
}
```

**Use cases**:
- Test filter rules
- Validate parser rules
- Benchmark performance
- Debug event matching

---

### dev:cleanup

Remove all development test data.

```bash
bun run dev:cleanup

# Keep config.dev.ts
bun src/cli.ts cleanup-dev --no-config
```

**Options**:
- `--no-config` - Don't remove `config.dev.ts` file

**What it removes**:
- All `dev-*` config files in `clients/`, `servers/`, `events/`, `sinks/`
- `logs/dev/` directory
- `logs/dev-notifications.log`
- `logs/dev-ground-truth.log`
- `config.dev.ts` (unless `--no-config`)

**Example output**:
```
Cleaning up development data...
  ✓ Removed 5 dev client configs
  ✓ Removed 10 dev server configs
  ✓ Removed 8 dev event configs
  ✓ Removed 1 dev sink config
  ✓ Removed logs/dev/ directory
  ✓ Removed logs/dev-notifications.log
  ✓ Removed logs/dev-ground-truth.log
  ✓ Removed config.dev.ts

✓ Cleanup complete
```

---

## Common Workflows

### Backup and Restore
```bash
# Backup current config
bun run config:export -- -o backup-$(date +%Y%m%d).json.gz

# Restore from backup
bun run config:import -- -i backup-20251124.json.gz
```

### Testing Changes
```bash
# Export current config
bun run config:export -- -o before-changes.json.gz

# Make changes...

# Validate
bun run config:validate

# Test
bun dev

# Rollback if needed
bun run config:import -- -i before-changes.json.gz --overwrite
```

### Sharing Configs
```bash
# On source machine
bun run config:export -- -o shared-config.json.gz

# Transfer file to target machine

# On target machine (merge with existing)
bun run config:merge -- -i shared-config.json.gz

# Or replace entirely
bun run config:import -- -i shared-config.json.gz --overwrite
```

### Development Testing
```bash
# Generate test data
bun run dev:gen -n 500

# Run with dev config
bun start -c config.dev.ts

# Analyze results
diff logs/dev-ground-truth.log logs/dev-notifications.log

# Clean up
bun run dev:cleanup
```

### JSON to TypeScript Migration
```bash
# Migrate all JSON configs
bun run config:migrate

# Validate TypeScript configs
bun run config:validate

# Test
bun dev

# Remove remaining JSON files if everything works
find config -name "*.json" -delete
```

## Environment Variables

Set environment variables before running commands:

```bash
# Use custom config location
CONFIG_PATH=/etc/irc-notify/config.ts bun start

# Set log directory
LOG_DIR=/var/log/irc bun start

# Debug mode
DEBUG=true bun start

# Enable Config API (runs concurrently with log watcher)
ENABLE_API=true bun start

# Config API with custom settings
ENABLE_API=true API_PORT=3000 API_HOST=0.0.0.0 API_TOKEN=secret bun start

# API-only settings (auto-enables API if API_PORT is set)
API_PORT=8080 API_TOKEN=mytoken bun start
```

### API Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_API` | `false` | Enable Config API server |
| `API_PORT` | `3000` | API server port (setting this auto-enables API) |
| `API_HOST` | `0.0.0.0` | API server host |
| `API_TOKEN` | - | Bearer token for authentication (optional) |
| `API_ENABLE_FILE_OPS` | `true` | Allow direct file operations via API |

Or use in config files:
```typescript
{
  logDirectory: "${LOG_DIR:-./logs}",  // Default to ./logs
  endpoint: "${NTFY_ENDPOINT}",        // Required
}
```

## Exit Codes

- `0` - Success
- `1` - Configuration error
- `2` - File I/O error
- `3` - Validation error
- `4` - Runtime error

## Related Documentation

- [Configuration Overview](./configuration.md)
- [TypeScript Configuration](./typescript-config.md)
- [Testing Guide](./testing.md)
