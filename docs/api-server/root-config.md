# Root Config API

Manage the root IRC Notify configuration file (`config.json`).

## Endpoints

### GET /api/config

Get the current root configuration.

**Response:**
```json
{
  "global": {
    "defaultLogDirectory": "/path/to/logs",
    "pollInterval": 1000,
    "debug": false,
    "configDirectory": "/path/to/config"
  },
  "api": {
    "enabled": true,
    "port": 3000,
    "host": "0.0.0.0"
  }
}
```

### PUT /api/config

Update the root configuration. Accepts JSON format only.

**Request Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body (JSON):**
```json
{
  "global": {
    "pollInterval": 2000,
    "debug": true
  }
}
```

Note: Client, server, event, and sink IDs are auto-discovered from their directories and are not listed in the root config. If present in an uploaded config, they are ignored and stripped.

**Response:**
```json
{
  "updated": true,
  "format": "json",
  "path": "/path/to/config/config.json"
}
```

## Behavior

- **Format**: Accepts and stores JSON objects
- **Storage**: Always stores as `config.json`
- **Reload**: Automatically triggers full system reload after update
- **Validation**: Validates configuration structure before saving
- **Auto-discovery**: Components are discovered from directories; listing arrays in the root config is ignored and removed

## Configuration Structure

### Global Settings

```typescript
{
  global: {
    defaultLogDirectory?: string;   // Default log directory for clients
    pollInterval?: number;          // File polling interval (ms)
    debug?: boolean;                // Enable debug logging
    configDirectory?: string;       // Config directory path
    rescanLogsOnStartup?: boolean;  // Rescan logs on startup
  }
}
```

### Component Auto-Discovery

Components (clients, servers, events, sinks) are automatically discovered from their respective directories:
- `config/clients/*.json`
- `config/servers/*.json`
- `config/events/*.json`
- `config/sinks/*.json`

No need to list IDs in the main configuration file.
```

### API Configuration

```typescript
{
  api?: {
    enabled?: boolean;        // Enable API server
    port?: number;            // API server port
    host?: string;            // API server host
    authToken?: string;       // Authentication token
    enableFileOps?: boolean;  // Allow file operations
  }
}
```

## Examples

### Get Current Config

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/config
```

### Update Config

```bash
curl -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "global": {
      "debug": true,
      "pollInterval": 2000
    }
  }' \
  http://localhost:3000/api/config
```

## Error Responses

### 400 Bad Request

Invalid configuration structure:
```json
{
  "error": "Missing 'global' section in config"
}
```

### 403 Forbidden

File operations disabled:
```json
{
  "error": "File operations are disabled"
}
```

### 401 Unauthorized

Missing or invalid token:
```json
{
  "error": "unauthorized"
}
```

## Related Endpoints

- [`GET /api/status`](./config-api.md#status) - System status including loaded config IDs
- [`POST /api/config/reload`](./config-api.md#reload) - Force config reload
- [`GET /api/config/files`](./config-api.md#list-files) - List component config files
- [`GET /api/data-flow`](./data-flow.md) - Visualize complete configuration

## Implementation Notes

- Root config is the only config that can be updated via PUT (component configs use different endpoints)
- System automatically reloads after root config update
- JSON is the only supported format for all configurations
- The API validates basic structure but doesn't validate component references (those are validated on reload)
