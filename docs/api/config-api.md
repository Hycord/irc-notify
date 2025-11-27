# Config API

The Config API provides external control over configuration lifecycle for running `irc-notify` instances. It is designed so that a separate UI (e.g. IRC-Nitifiarr) can bind-mount the configuration directory and interact using simple HTTP endpoints.

> IMPORTANT: Any changes that affect configuration state MUST keep this document updated. This is a project requirement.

## Overview

When enabled (run `bun run api` or execute `src/api/server.ts`), a Bun HTTP server exposes endpoints under `/api/*` while the orchestrator continues processing log events.

For details on the internal API server architecture and how to add new routes, see [Server Architecture](./server-architecture.md).

The API supports:

- Upload a bundled `.json.gz` export and either replace or merge existing configs
- Force a full in-memory reload of all configs, clients, sinks and events
- Export current active configuration bundle (enabled configs only)
- List, read, update and delete individual config files inside the config directory
- Automatic reload when config directory contents change

## Enabling

The Config API server now runs integrated with the main orchestrator. Set environment variables to enable:

```bash
# Enable via ENABLE_API flag
ENABLE_API=true bun start

# Or enable by setting API_PORT (auto-enables)
API_PORT=3000 bun start

# With custom host and port
ENABLE_API=true API_HOST=127.0.0.1 API_PORT=8080 bun start
```

### Authentication

On first startup, the system automatically generates a secure random auth token (64 hex characters, 32 bytes of entropy) and stores it in `config/auth_token.txt`. This file is:

- **Not backed up** (excluded from config exports)
- **Not version controlled** (gitignored)
- **Machine-specific** (unique per installation)
- **File-protected** (mode 0600 on creation)

All API requests require `Authorization: Bearer <token>` using the token from `config/auth_token.txt`.

To retrieve your token:

```bash
cat config/auth_token.txt
```

To use a custom token (not recommended), you can set the `API_TOKEN` environment variable, which overrides the file-based token:

```bash
API_TOKEN=your-custom-token bun start
```

### Legacy Standalone Mode

You can still run the API server standalone (without the log watcher):

```bash
API_PORT=3000 API_TOKEN=secret bun run src/api/server.ts
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Simple health check |
| GET | `/api/status` | Returns orchestrator status & config directory |
| GET | `/api/data-flow` | Returns comprehensive data flow visualization data |
| GET | `/api/config` | Get root configuration |
| PUT | `/api/config` | Update root configuration (JSON/TS accepted) |
| POST | `/api/config/reload` | Force full reload of all configs and watchers |
| GET | `/api/config/export` | Returns current config bundle (JSON) |
| POST | `/api/config/upload?mode=replace` | Replace config set with uploaded `.json.gz` bundle |
| POST | `/api/config/upload?mode=merge` | Merge uploaded bundle (prefers existing) |
| GET | `/api/config/files` | List config files by category |
| GET | `/api/config/file/<category>/<name>?format=json\|ts` | Retrieve config file (transcoded to requested format) |
| PUT | `/api/config/file/<category>/<name>` | Create/update config file (JSON/TS accepted, stored as TS) |
| DELETE | `/api/config/file/<category>/<name>` | Delete config file (removes both .ts and .json) and reload |

Categories: `clients`, `servers`, `events`, `sinks`.

For detailed information see:
- [Root Config API](../api-server/root-config.md) - Root configuration management
- [Data Flow API](../api-server/data-flow.md) - Data flow visualization

## Configuration File Operations

### Reading Files (GET)
- **Returns**: JSON format only
- Files are stored as JSON on disk (`.json`)
- Response headers indicate the format

### Writing Files (PUT)
- **Accepts**: JSON objects only
- **Always stores as JSON**: Saved as `.json` files
- **Filename sync**: Automatically renames file if ID in content differs from filename
- Response confirms successful update

### Examples

**Get config as JSON:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/config/file/events/phrase-alert
# Returns: { "id": "phrase-alert", ... }
```

**Upload JSON config:**
```bash
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"my-event","enabled":true}' \
  http://localhost:3000/api/config/file/events/my-event
# Stored as: config/events/my-event.json
# Response: {"updated":true,"format":"json"}
```

## Upload / Bundle Format

The API expects the export format produced by `ConfigIO.exportConfig()` (optionally `.json.gz`). Internally it leverages existing `ConfigIO.importConfigWithOptions()` and `mergeConfigWithOptions()` utilities.

Query parameter `mode` determines behavior:

- `replace`: Wipes existing configuration set first (deletes all `.json` files in `clients/`, `servers/`, `events/`, `sinks/` and `config/config.json`), then imports the uploaded bundle. Non-JSON files (e.g. `auth_token.txt`) are preserved. Uploading an empty bundle results in an empty config set.
- `merge`: Preserves existing files unless absent (incoming only supplements). Conflicts prefer existing by default.

After import/merge the orchestrator performs a `reloadFull()` which:

1. Reloads main config + sub-configs via `ConfigLoader.load()`
2. Rebuilds client and sink sets (destroying removed ones, initializing new ones)
3. Updates events and servers in the `EventProcessor`
4. Restarts log watchers (without a full process restart)

## Automatic Reload

The API server watches the config directory (and category sub-directories) using `fs.watch`. File changes debounce (500ms) into a `reloadFull()` operation. Any validation failures are logged; existing in-memory configuration remains last known good state.

## Security

- Optional static bearer token (`API_TOKEN`) protects all endpoints.
- File path operations are sanitized to prevent directory traversal.
- Consider placing behind a reverse proxy for TLS termination.

## Error Handling

Responses always include JSON body. Typical error structure:

```json
{ "error": "description" }
```

Validation issues during PUT operations will return `400` with the underlying error message.

## Example Flow

Replace existing config with uploaded bundle:

```bash
curl -X POST \
  -H "Authorization: Bearer $API_TOKEN" \
  --data-binary @config-export.json.gz \
  "http://localhost:3000/api/config/upload?mode=replace"
```

List files:

```bash
curl -H "Authorization: Bearer $API_TOKEN" http://localhost:3000/api/config/files
```

Update an event config:

```bash
curl -X PUT -H "Authorization: Bearer $API_TOKEN" \
  --data-binary @config/events/phrase-alert.json \
  http://localhost:3000/api/config/file/events/phrase-alert.json
```

## Programmatic Use

The `ConfigApiServer` can be embedded directly:

```ts
const orchestrator = new IRCNotifyOrchestrator();
await orchestrator.initialize();
await orchestrator.start();
const api = new ConfigApiServer({ orchestrator, authToken: process.env.API_TOKEN });
await api.start();
```

## Future Extensions (Document when implemented)

- WebSocket stream for reload / status events
- Fine-grained validation preview endpoint
- Batch transactional updates

KEEP THIS DOCUMENT SYNCED WITH ANY CODE CHANGES TO THE API.
