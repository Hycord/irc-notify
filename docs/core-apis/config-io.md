# ConfigIO API

This document describes the ConfigIO API for configuration management, including import/export, format transcoding, and file operations.

**Location**: `src/config/import-export.ts`

## Configuration Import/Export

### Export Configuration

```typescript
import { ConfigIO } from './config/import-export';

// Simple export
await ConfigIO.exportConfig('backup.json.gz');

// Export with options
await ConfigIO.exportConfigWithOptions({
  outputPath: 'backup.json.gz',
  configPath: './config/config.json'  // Optional, auto-detects if not provided
});
```

## Config File Operations

### Read Config File

```typescript
import { ConfigIO } from './config/import-export';

const { content, sourceFormat } = ConfigIO.readConfigFile(
  '/path/to/config/events/my-event.json',
  'events',
  'json'
);
```

**Features:**
- Reads JSON configuration files
- Returns parsed configuration object
- Validates configuration structure

### Write Config File

```typescript
import { ConfigIO } from './config/import-export';

const config = { id: "my-event", enabled: true };
const result = ConfigIO.writeConfigFile(
  '/path/to/config/events/my-event.json',
  JSON.stringify(config),
  'events'
);
```

**Features:**
- Accepts JSON configuration objects
- Stores as `.json` files
- Uses atomic write (temp file + rename)
- Cleans up temp file on error

### Delete Config File

```typescript
import { ConfigIO } from './config/import-export';

const deleted = ConfigIO.deleteConfigFile('/path/to/config/events/my-event.json');
// Returns: true if file was deleted, false otherwise
```

**Features:**
- Removes JSON configuration file
- Returns boolean indicating if file was deleted

### Import Configuration

The import API intelligently detects the target config directory from existing configuration and adjusts paths automatically.

```typescript
import { ConfigIO } from './config/import-export';

// Simple import (auto-detects target from existing config)
await ConfigIO.importConfig('backup.json.gz');

// Import with options
const result = await ConfigIO.importConfigWithOptions({
  inputPath: 'backup.json.gz',
  targetDir: './config',          // Optional, auto-detects if not provided
  overwrite: false,                // Don't overwrite existing files
  replace: false,                  // If true, wipe existing config set first
  adjustConfigPath: true,          // Auto-adjust configDirectory (default: true)
  reloadConfig: true               // Reload after import (default: false)
});

console.log(`Imported ${result.imported} files`);
console.log(`Target: ${result.targetDir}`);
```

**Smart Features:**

1. **Auto-detection**: If no target directory is specified, it looks for an existing config file and uses its `configDirectory` setting
2. **Path Adjustment**: Automatically adjusts the imported config's `configDirectory` to match the existing configuration structure
3. **Backup Fallback**: If no existing config is found, uses the backup's recommended directory

### Replace vs Merge Semantics

- **Replace Import**: When `replace: true`, ConfigIO deletes all existing `.json` files in `clients/`, `servers/`, `events/`, `sinks/` and removes `config/config.json` before writing the incoming bundle. Non-JSON files (e.g., `auth_token.txt`) are preserved. Uploading an empty bundle results in an empty config set.
- **Merge Import**: Use `mergeConfigWithOptions()` to supplement existing configs. By default conflicts prefer existing; set `preferIncoming: true` to overwrite on conflicts.

### Merge Configuration

```typescript
import { ConfigIO } from './config/import-export';

// Merge (prefer existing configs)
await ConfigIO.mergeConfig('backup.json.gz');

// Merge with options (prefer incoming)
const result = await ConfigIO.mergeConfigWithOptions({
  inputPath: 'backup.json.gz',
  preferIncoming: true  // Incoming configs overwrite existing
});
```

## Development Testing API

**Location**: `src/dev/index.ts`

### Generate Test Data

```typescript
import { generateDevData } from './dev';

// Generate with defaults (400 messages)
await generateDevData();

// Generate with options
await generateDevData({
  numMessages: 500,
  configDir: './config',
  logsDir: './logs/dev',
  groundTruthLog: './logs/dev-ground-truth.log'
});
```

**What it generates:**
- 10 servers (5 shared, 5 unique)
- 5 IRC clients with different log formats
- Messages matching event filter rules
- Dev event configs cloned from production
- Dev sink for capturing notifications
- Ground truth log for validation

### Cleanup Test Data

```typescript
import { cleanupDevData } from './dev';

// Clean up with defaults
await cleanupDevData();

// Clean up with options
await cleanupDevData({
  configDir: './config',
  logsDir: './logs',
  removeConfigDev: true  // Remove config.dev.* files
});
```

**What it removes:**
- All `dev-*` config files (clients, servers, events, sinks)
- `logs/dev/` directory
- Dev notification and ground truth logs
- `config.dev.json`

## Type Definitions

All APIs use TypeScript interfaces for options and results. See the respective source files for complete type definitions:

- `ImportOptions`, `ExportOptions`, `MergeOptions`, `ImportResult` - in `src/config/import-export.ts`
- `DevGeneratorOptions`, `DevCleanupOptions` - in `src/dev/index.ts`

## Cross-Reference Auto-Pruning

During load, `ConfigLoader` validates cross-references between events, servers, and sinks. Instead of throwing on stale references, it now automatically:

- Removes invalid `sinkIds` (those not present in loaded sinks)
- Removes invalid `serverIds` (preserving wildcard `*`)
- De-duplicates remaining IDs while preserving order
- Persists the sanitized event file back to disk
- Emits a warning log: `[validation] Event '<id>': removed non-existent sinkIds: old-sink`

This resilience lets you delete or rename sinks/servers without blocking startup. Tests expect pruning behavior (see `config-loader.test.ts`). If you require strict enforcement, add a separate validation step after load that asserts `event.sinkIds.length > 0` for critical events.
