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
| GET | `/api/config/file/<category>/<name>` | Retrieve config file (JSON format) |
| POST | `/api/config/file/<category>/<name>` | Create config file (auto-syncs filename with config ID) |
| PUT | `/api/config/file/<category>/<name>` | Create/update config file (auto-syncs filename with config ID) |
| DELETE | `/api/config/file/<category>/<name>` | Delete config file (removes both .ts and .json) and reload |
| GET | `/api/logs/targets?clientId=<id>&serverId=<id>` | List channels/queries/console (IRC-style) |
| GET | `/api/logs/messages?clientId&serverId&target&type&offset&limit` | Get messages for target (IRC-style) |
| GET | `/api/logs/discover?clientId&serverId&server&channel&query&type` | Discover available log files with flexible filtering |
| GET | `/api/logs/read?path=<path>&offset=<n>&limit=<n>` | Read log file with pagination (auto-compressed) |
| GET | `/api/logs/tail?path=<path>&lines=<n>` | Read last N lines of log file (auto-compressed) |

### Status Endpoint Example (Flattened Response)
```json
{
  "running": true,
  "reloading": false,
  "clients": {"total":2,"enabled":2,"list":[{"id":"textual","enabled":true,"type":"textual"}]},
  "servers": {"total":1,"enabled":1,"list":[{"id":"libera","enabled":true,"displayName":"Libera"}]},
  "sinks": {"total":2,"enabled":2,"list":[{"id":"console","enabled":true,"type":"console"},{"id":"ntfy","enabled":true,"type":"ntfy"}]},
  "events": {"total":1,"enabled":1,"list":[{"id":"phrase-alert","enabled":true,"serverIds":["libera"],"sinkIds":["ntfy"],"baseEvent":"message","priority":90}]},
  "watchers": 2,
  "configPath": "/abs/path/config/config.json",
  "configDirectory": "/abs/path/config"
}
```
Legacy nested `status` property removed in v1.0.0.

Categories: `clients`, `servers`, `events`, `sinks`.

For detailed information see:
- [Root Config API](./root-config.md) - Root configuration management
- [Data Flow API](./data-flow.md) - Data flow visualization
- [Logs API](./logs-api.md) - Log file exploration and reading

## File Format

The API works with JSON configuration files:

### Reading Files (GET)
- Returns JSON format by default
- Response includes configuration object
- All configs stored as `.json` files

### Writing Files (POST/PUT)
- **Accepts JSON format**: Send JSON object representing the config
- **Stores as JSON**: Files are written as `.json` format
- **Auto-cleanup**: Removes old files if filename doesn't match ID
- Response includes rename information if applicable

### Examples

**Get config:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/config/file/events/phrase-alert
# Returns: { "id": "phrase-alert", ... }
```

**Upload config:**
```bash
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"my-event","enabled":true}' \
  http://localhost:3000/api/config/file/events/my-event
# Stored as: config/events/my-event.json
# Response: {"updated":true,"uploadFormat":"json","storedFormat":"json"}
```

## Filename/ID Synchronization

**IMPORTANT**: When creating or updating config files via POST or PUT, the system automatically ensures the filename matches the config's `id` field. This prevents mismatches and maintains consistency.

### Behavior

When you POST or PUT a config file:

1. The system parses the JSON to extract the `id` field
2. The file is saved with the name matching the `id` (e.g., `{id}.json`)
3. If the filename in the URL differs from the `id`:
   - The old file (with the mismatched name) is deleted
   - The new file (with the correct name) is created
   - The response includes `renamed: true` and both old/new filenames

### Examples

**Uploading a config where filename matches ID:**
```bash
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"my-event","enabled":true,"filter":{}}' \
  http://localhost:3000/api/config/file/events/my-event
```
Response:
```json
{
  "updated": true,
  "renamed": false,
  "newFileName": "my-event",
  "uploadFormat": "json",
  "storedFormat": "json"
}
```

**Uploading a config where filename doesn't match ID:**
```bash
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"correct-name","enabled":true,"filter":{}}' \
  http://localhost:3000/api/config/file/events/wrong-name
```
Response:
```json
{
  "updated": true,
  "renamed": true,
  "oldFileName": "wrong-name",
  "newFileName": "correct-name",
  "uploadFormat": "json",
  "storedFormat": "json"
}
```

This ensures configuration integrity and prevents orphaned or misnamed config files.

## Cascading Updates (Servers & Sinks)

When modifying server or sink configs via the File Ops API, the system automatically keeps event references consistent:

- DELETE `servers/<id>`: Removes `<id>` from every event's `serverIds` array.
- DELETE `sinks/<id>`: Removes `<id>` from every event's `sinkIds` array.
- PUT/POST rename (filename vs `id` differs) for `servers` or `sinks`: Replaces references to the old ID with the new `id` in all events.

Notes:
- Only references in `events/*.json` are updated; no events are deleted.
- Empty `serverIds` or `sinkIds` arrays are allowed and remain as-is.
- The JSON response for DELETE/PUT includes a `cascade` object with counts: `{ updatedFiles, totalFiles }`.

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

Common status codes:
- `400` - Bad request (invalid input)
- `401` - Unauthorized (auth failed)
- `403` - Forbidden (access denied)
- `404` - Not found
- `405` - Method not allowed
- `500` - Internal server error

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
