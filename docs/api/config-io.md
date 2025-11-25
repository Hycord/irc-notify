# API Documentation

This document describes the reusable APIs for configuration management, development testing, and migration.

## Configuration Import/Export API

Located in: `src/config/import-export.ts`

### Export Configuration

```typescript
import { ConfigIO } from './config/import-export';

// Simple export
await ConfigIO.exportConfig('backup.json.gz');

// Export with options
await ConfigIO.exportConfigWithOptions({
  outputPath: 'backup.json.gz',
  configPath: './config/config.ts'  // Optional, auto-detects if not provided
});
```

### Import Configuration

The import API now intelligently detects the target config directory from existing configuration and adjusts paths automatically.

```typescript
import { ConfigIO } from './config/import-export';

// Simple import (auto-detects target from existing config)
await ConfigIO.importConfig('backup.json.gz');

// Import with options
const result = await ConfigIO.importConfigWithOptions({
  inputPath: 'backup.json.gz',
  targetDir: './config',          // Optional, auto-detects if not provided
  overwrite: false,                // Don't overwrite existing files
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

Located in: `src/dev/index.ts`

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
- `config.dev.ts` or `config.dev.json`

## Migration API

Located in: `src/config/migrate.ts`

### Migrate JSON to TypeScript

```typescript
import { migrateToTypeScript } from './config/migrate';

// Migrate with defaults
const result = await migrateToTypeScript();

// Migrate with options
const result = await migrateToTypeScript({
  configDir: './config'
});

console.log(`Converted: ${result.converted}`);
console.log(`Skipped: ${result.skipped}`);
console.log(`Failed: ${result.failed}`);
```

**What it does:**
- Scans for `.json` files in clients/, servers/, events/, sinks/
- Converts to TypeScript with proper `define*()` wrapper
- Deletes original JSON files after successful conversion
- Skips files that already have a `.ts` version

## Example: Programmatic Backup/Restore Workflow

```typescript
import { ConfigIO } from './config/import-export';
import { ConfigLoader } from './config/loader';

// 1. Export current configuration
await ConfigIO.exportConfigWithOptions({
  outputPath: `backup-${Date.now()}.json.gz`
});

// 2. Import backup and reload
const result = await ConfigIO.importConfigWithOptions({
  inputPath: 'backup-12345.json.gz',
  overwrite: true,
  adjustConfigPath: true,
  reloadConfig: false  // We'll reload manually
});

// 3. Manually reload configuration
if (result.mainConfigPath) {
  const config = await ConfigLoader.load(result.mainConfigPath);
  console.log(`Loaded ${config.clients.length} clients`);
}
```

## Example: API Server Integration

```typescript
import express from 'express';
import { ConfigIO } from './config/import-export';
import { generateDevData, cleanupDevData } from './dev';

const app = express();

app.post('/api/config/import', async (req, res) => {
  try {
    const result = await ConfigIO.importConfigWithOptions({
      inputPath: req.body.backupPath,
      overwrite: req.body.overwrite || false,
      adjustConfigPath: true,
      reloadConfig: true
    });
    
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/dev/generate', async (req, res) => {
  try {
    await generateDevData({
      numMessages: req.body.numMessages || 400
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

## Type Definitions

All APIs use TypeScript interfaces for options and results. See the respective source files for complete type definitions:

- `ImportOptions`, `ExportOptions`, `MergeOptions`, `ImportResult` - in `src/config/import-export.ts`
- `DevGeneratorOptions`, `DevCleanupOptions` - in `src/dev/index.ts`
- `MigrateOptions`, `MigrateResult` - in `src/config/migrate.ts`
