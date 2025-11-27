# Logs API

Explore and read IRC log files with support for config-based discovery, chunking, and compression.

## Overview

The Logs API provides two styles of access:

1. **IRC-Client Style (Recommended)** - High-level endpoints that work with client/server/channel abstractions, just like an IRC client
2. **File-Based Style** - Low-level endpoints for direct file path access with flexible filtering

All endpoints automatically use Bun's native gzip compression when the client sends `Accept-Encoding: gzip` header.

## Security

- All endpoints require authentication via `Authorization: Bearer <token>` header
- Path validation ensures only files within configured log directories are accessible
- No write operations are supported (read-only API)

## IRC-Client Style Endpoints (Recommended)

These endpoints replicate a read-only IRC client experience. No file paths needed!

### GET /api/logs/targets

List available targets (channels, queries, console) for a client+server combination.

**Query Parameters:**
- `clientId` (required) - Client configuration ID
- `serverId` (required) - Server configuration ID

**Example Request:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/logs/targets?clientId=textual&serverId=libera
```

**Response:**
```json
{
  "clientId": "textual",
  "serverId": "libera",
  "targets": [
    {
      "name": "Console",
      "type": "console",
      "lastModified": "2025-11-25T10:30:00.000Z",
      "size": 3789
    },
    {
      "name": "#linux",
      "type": "channel",
      "lastModified": "2025-11-25T10:25:00.000Z",
      "size": 524288
    },
    {
      "name": "alice",
      "type": "query",
      "lastModified": "2025-11-25T09:15:00.000Z",
      "size": 12345
    }
  ]
}
```

**Response Fields:**
- `clientId` - Client configuration ID
- `serverId` - Server configuration ID  
- `targets[]` - Array of available targets
  - `name` - Target name (channel name, username, or "Console")
  - `type` - Target type: `console`, `channel`, or `query`
  - `lastModified` - ISO 8601 timestamp of last modification
  - `size` - File size in bytes

**Behavior:**
- Targets are sorted: console first, then channels, then queries (alphabetically within each type)
- Only shows targets that have log files
- Uses client's discovery patterns to find files

### GET /api/logs/messages

Get messages for a specific target (channel, query, or console).

**Query Parameters:**
- `clientId` (required) - Client configuration ID
- `serverId` (required) - Server configuration ID
- `target` (required) - Target name (e.g., "#linux", "alice", "Console")
- `type` (required) - Target type: `console`, `channel`, or `query`
- `offset` (optional, default: 0) - Line number to start from (0-indexed)
- `limit` (optional, default: 100) - Maximum number of lines to return

**Example Requests:**
```bash
# Read console messages
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/logs/messages?clientId=textual&serverId=libera&target=Console&type=console&limit=50"

# Read channel messages (note: # must be URL encoded as %23)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/logs/messages?clientId=textual&serverId=libera&target=%23linux&type=channel&limit=100"

# Read private messages
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/logs/messages?clientId=textual&serverId=libera&target=alice&type=query&limit=50"

# Pagination (second page)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/logs/messages?clientId=textual&serverId=libera&target=%23linux&type=channel&offset=100&limit=100"
```

**Response:**
```json
{
  "clientId": "textual",
  "serverId": "libera",
  "target": "#linux",
  "type": "channel",
  "totalLines": 5000,
  "offset": 0,
  "limit": 100,
  "returnedLines": 100,
  "hasMore": true,
  "fileSize": 524288,
  "lastModified": "2025-11-25T10:25:00.000Z",
  "lines": [
    "[2025-11-25 10:00:00] <user> message content",
    "[2025-11-25 10:00:15] <user2> another message",
    "..."
  ]
}
```

**Response Fields:**
- `clientId` - Client configuration ID
- `serverId` - Server configuration ID
- `target` - Target name
- `type` - Target type
- `totalLines` - Total number of lines in log file
- `offset` - Starting line number
- `limit` - Maximum lines requested
- `returnedLines` - Actual number of lines returned
- `hasMore` - Boolean indicating if more lines available
- `fileSize` - File size in bytes
- `lastModified` - ISO 8601 timestamp of last modification
- `lines[]` - Array of message lines

**Important Notes:**
- Channel names starting with `#` must be URL encoded as `%23` (e.g., `#linux` → `%23linux`)
- Target names are case-insensitive
- Uses most recent log file if multiple files exist for the target

### IRC-Style Workflow Example

```bash
#!/bin/bash
TOKEN="your-token"
API_BASE="http://localhost:3000/api"

# Step 1: List available targets
TARGETS=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/logs/targets?clientId=textual&serverId=libera")

echo "Available channels:"
echo "$TARGETS" | jq -r '.targets[] | select(.type == "channel") | .name'

# Step 2: Read messages from a channel
MESSAGES=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/logs/messages?clientId=textual&serverId=libera&target=%23linux&type=channel&limit=10")

echo "Recent messages:"
echo "$MESSAGES" | jq -r '.lines[]'

# Step 3: Paginate through history
OFFSET=0
LIMIT=100

while true; do
  PAGE=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/logs/messages?clientId=textual&serverId=libera&target=%23linux&type=channel&offset=$OFFSET&limit=$LIMIT")
  
  echo "$PAGE" | jq -r '.lines[]'
  
  HAS_MORE=$(echo "$PAGE" | jq -r '.hasMore')
  if [ "$HAS_MORE" != "true" ]; then
    break
  fi
  
  OFFSET=$((OFFSET + LIMIT))
done
```

## File-Based Endpoints (Low-Level)

These endpoints provide direct file path access with flexible filtering options.

## Endpoints

### GET /api/logs/discover

Discover available log files based on configured clients and servers.

**Query Parameters:**
- `clientId` (optional) - Filter by specific client ID
- `serverId` (optional) - Filter by specific server ID (matches config)
- `server` (optional) - Filter by server name/identifier from path
- `channel` (optional) - Filter by channel name (case-insensitive)
- `query` (optional) - Filter by query/PM user nickname (case-insensitive)
- `type` (optional) - Filter by target type: `console`, `channel`, or `query`

**Example Request:**
```bash
# Discover all log files
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/logs/discover

# Discover logs for specific client
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/logs/discover?clientId=textual

# Discover logs for specific server
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/logs/discover?serverId=libera

# Combine filters
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/logs/discover?clientId=textual&serverId=libera

# Filter by channel name
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/logs/discover?channel=linux

# Filter by target type (all channels)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/logs/discover?type=channel

# Filter by server name and channel
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/logs/discover?server=Libera&channel=linux
```

**Response:**
```json
{
  "clients": [
    {
      "id": "textual",
      "name": "Textual IRC Client",
      "type": "textual",
      "logDirectory": "/Users/masen/logs/textual",
      "files": [
        {
          "path": "/Users/masen/logs/textual/Libera/Channels/#channel.txt",
          "relativePath": "Libera/Channels/#channel.txt",
          "size": 1048576,
          "modified": "2025-11-25T10:30:00.000Z",
          "target": {
            "type": "channel",
            "name": "#channel"
          },
          "server": {
            "identifier": "Libera"
          }
        },
        {
          "path": "/Users/masen/logs/textual/Libera/Console/console.txt",
          "relativePath": "Libera/Console/console.txt",
          "size": 524288,
          "modified": "2025-11-25T10:25:00.000Z",
          "target": {
            "type": "console",
            "name": "Console"
          },
          "server": {
            "identifier": "Libera"
          }
        }
      ]
    }
  ]
}
```

**Response Fields:**
- `clients[]` - Array of client configurations with discovered files
  - `id` - Client configuration ID
  - `name` - Human-readable client name
  - `type` - Client type (textual, thelounge, etc.)
  - `logDirectory` - Base log directory path
  - `files[]` - Array of discovered log files
    - `path` - Absolute file path
    - `relativePath` - Path relative to logDirectory
    - `size` - File size in bytes
    - `modified` - ISO 8601 timestamp of last modification
    - `target` - Extracted target information (optional)
      - `type` - "console", "channel", or "query"
      - `name` - Target name (channel name, user nickname, or "Console")
    - `server` - Extracted server information (optional)
      - `identifier` - Server identifier from path

**Behavior:**
- Files are sorted by modification date (newest first)
- Uses client's `discovery.patterns` to find log files
- Uses client's `discovery.pathExtraction` to extract metadata
- Server filtering matches against server `id` or `displayName` (case-insensitive)
- Returns empty array if no matching files found

### GET /api/logs/read

Read log file contents with pagination support.

**Query Parameters:**
- `path` (required) - Absolute file path to read
- `offset` (optional, default: 0) - Line number to start from (0-indexed)
- `limit` (optional, default: 10000) - Maximum number of lines to return

**Compression:**
Bun automatically compresses responses when the client sends `Accept-Encoding: gzip` header. Use `curl --compressed` or configure your HTTP client to request compression.

**Example Request:**
```bash
# Read first 100 lines
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/logs/read?path=/path/to/log.txt&limit=100"

# Read with pagination (lines 100-199)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/logs/read?path=/path/to/log.txt&offset=100&limit=100"

# Read with automatic compression (recommended for large responses)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/logs/read?path=/path/to/log.txt" \
  --compressed
```

**Response:**
```json
{
  "path": "/path/to/log.txt",
  "totalLines": 50000,
  "offset": 0,
  "limit": 10000,
  "returnedLines": 10000,
  "hasMore": true,
  "fileSize": 5242880,
  "modified": "2025-11-25T10:30:00.000Z",
  "lines": [
    "[2025-11-25 10:00:00] <user> message content",
    "[2025-11-25 10:00:15] <user2> another message",
    "..."
  ]
}
```

**Response Fields:**
- `path` - Absolute file path
- `totalLines` - Total number of lines in file
- `offset` - Starting line number (0-indexed)
- `limit` - Maximum lines requested
- `returnedLines` - Actual number of lines returned
- `hasMore` - Boolean indicating if more lines are available
- `fileSize` - File size in bytes
- `modified` - ISO 8601 timestamp of last modification
- `lines[]` - Array of line strings

**Pagination Example:**
```bash
# Page 1 (lines 0-999)
curl "...?path=/log.txt&offset=0&limit=1000"

# Page 2 (lines 1000-1999)
curl "...?path=/log.txt&offset=1000&limit=1000"

# Continue until hasMore is false
```

**Compression:**
Bun automatically compresses responses when the client includes `Accept-Encoding: gzip` in the request. Use `--compressed` with curl (which automatically sets the header and decompresses) or configure your HTTP client to request gzip compression.

### GET /api/logs/tail

Read the last N lines of a log file (similar to `tail -n`).

**Query Parameters:**
- `path` (required) - Absolute file path to read
- `lines` (optional, default: 100) - Number of lines to return from end of file

**Compression:**
Bun automatically compresses responses when the client sends `Accept-Encoding: gzip` header.

**Example Request:**
```bash
# Get last 100 lines (default)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/logs/tail?path=/path/to/log.txt"

# Get last 500 lines
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/logs/tail?path=/path/to/log.txt&lines=500"

# With automatic compression
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/logs/tail?path=/path/to/log.txt&lines=1000" \
  --compressed
```

**Response:**
```json
{
  "path": "/path/to/log.txt",
  "totalLines": 50000,
  "requestedLines": 100,
  "returnedLines": 100,
  "fileSize": 5242880,
  "modified": "2025-11-25T10:30:00.000Z",
  "lines": [
    "[2025-11-25 10:28:45] <user> recent message",
    "[2025-11-25 10:29:00] <user2> another recent message",
    "..."
  ]
}
```

**Response Fields:**
- `path` - Absolute file path
- `totalLines` - Total number of lines in file
- `requestedLines` - Number of lines requested from end
- `returnedLines` - Actual number of lines returned (may be less if file is smaller)
- `fileSize` - File size in bytes
- `modified` - ISO 8601 timestamp of last modification
- `lines[]` - Array of line strings (last N lines)

**Use Cases:**
- Monitoring recent activity
- Quick preview of current channel state
- Following log files (polling with tail)

## Error Responses

### 400 Bad Request

Missing required parameter:
```json
{
  "error": "Missing 'path' parameter"
}
```

### 401 Unauthorized

Missing or invalid token:
```json
{
  "error": "unauthorized"
}
```

### 403 Forbidden

Path outside configured log directories:
```json
{
  "error": "Access denied: path is not within configured log directories"
}
```

### 404 Not Found

Client or file not found:
```json
{
  "error": "Client not found or disabled: invalid-id"
}
```

```json
{
  "error": "File not found"
}
```

### 500 Internal Server Error

```json
{
  "error": "Failed to read file",
  "details": "ENOENT: no such file or directory"
}
```

## Usage Examples

### Real-time Channel Monitoring

Poll for recent messages:
```bash
#!/bin/bash
TOKEN="your-token"
LOG_PATH="/path/to/channel.txt"

while true; do
  curl -s -H "Authorization: Bearer $TOKEN" \
    "http://localhost:3000/api/logs/tail?path=$LOG_PATH&lines=10" \
    | jq -r '.lines[]'
  sleep 5
done
```

### Export Channel History

Download complete channel history with pagination:
```bash
#!/bin/bash
TOKEN="your-token"
LOG_PATH="/path/to/channel.txt"
OUTPUT="channel-export.txt"

# Get total lines
TOTAL=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/logs/read?path=$LOG_PATH&limit=1" \
  | jq -r '.totalLines')

echo "Exporting $TOTAL lines..."

> "$OUTPUT"  # Clear output file

OFFSET=0
LIMIT=10000

while [ $OFFSET -lt $TOTAL ]; do
  echo "Fetching lines $OFFSET-$((OFFSET+LIMIT))..."
  
  curl -s -H "Authorization: Bearer $TOKEN" \
    "http://localhost:3000/api/logs/read?path=$LOG_PATH&offset=$OFFSET&limit=$LIMIT" \
    --compressed \
    | jq -r '.lines[]' >> "$OUTPUT"
  
  OFFSET=$((OFFSET + LIMIT))
done

echo "Export complete: $OUTPUT"
```

### Search Across Multiple Servers

Find all channels containing specific text:
```bash
#!/bin/bash
TOKEN="your-token"
SEARCH_TERM="important message"

# Discover all channel logs
FILES=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/logs/discover" \
  | jq -r '.clients[].files[] | select(.target.type == "channel") | .path')

for FILE in $FILES; do
  # Tail recent messages and grep for term
  MATCHES=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "http://localhost:3000/api/logs/tail?path=$FILE&lines=1000" \
    | jq -r '.lines[]' \
    | grep -i "$SEARCH_TERM")
  
  if [ ! -z "$MATCHES" ]; then
    echo "=== $FILE ==="
    echo "$MATCHES"
    echo ""
  fi
done
```

### Web Dashboard Integration

JavaScript example for web UI:
```javascript
const TOKEN = 'your-token';
const API_BASE = 'http://localhost:3000/api';

// Discover available channels
async function loadChannels() {
  const response = await fetch(`${API_BASE}/logs/discover?clientId=textual`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  const data = await response.json();
  
  // Extract channels from all clients
  const channels = data.clients.flatMap(client => 
    client.files
      .filter(f => f.target?.type === 'channel')
      .map(f => ({
        name: f.target.name,
        path: f.path,
        server: f.server?.identifier
      }))
  );
  
  return channels;
}

// Load recent messages for a channel
async function loadRecentMessages(path, count = 100) {
  const response = await fetch(
    `${API_BASE}/logs/tail?path=${encodeURIComponent(path)}&lines=${count}`,
    { 
      headers: { 
        'Authorization': `Bearer ${TOKEN}`,
        'Accept-Encoding': 'gzip' // Request compression
      } 
    }
  );
  const data = await response.json();
  return data.lines;
}

// Load paginated history
async function loadHistory(path, page = 0, pageSize = 100) {
  const offset = page * pageSize;
  const response = await fetch(
    `${API_BASE}/logs/read?path=${encodeURIComponent(path)}&offset=${offset}&limit=${pageSize}`,
    { 
      headers: { 
        'Authorization': `Bearer ${TOKEN}`,
        'Accept-Encoding': 'gzip' // Request compression
      } 
    }
  );
  const data = await response.json();
  
  return {
    lines: data.lines,
    totalPages: Math.ceil(data.totalLines / pageSize),
    hasMore: data.hasMore
  };
}
```

## Performance Considerations

### Compression

- Bun automatically compresses responses when client requests it via `Accept-Encoding: gzip`
- Use `curl --compressed` to enable automatic compression
- Reduces bandwidth by 60-80% for text logs
- Minimal CPU overhead - Bun's native compression is highly optimized
- No configuration needed - compression is automatic based on client headers

### Pagination

- Default limit (10,000 lines) balances performance and usability
- Adjust based on your use case:
  - Real-time monitoring: 10-100 lines
  - History browsing: 100-1,000 lines
  - Bulk export: 10,000+ lines
- Use `tail` endpoint for recent data (more efficient)

### File Size

- Large files (>10 MB) benefit from pagination
- Consider implementing client-side caching for frequently accessed files
- File stats (size, modified date) allow cache invalidation

## Related Endpoints

- [`GET /api/config`](./root-config.md) - Get log directory configuration
- [`GET /api/status`](./config-api.md#status) - Check enabled clients/servers
- [`GET /api/data-flow`](./data-flow.md) - Visualize configuration flow

## Implementation Notes

### IRC-Style Endpoints
- **Client/Server abstraction**: Works with config IDs instead of file paths
- **Automatic file discovery**: Finds log files based on client's `discovery.patterns`
- **Target matching**: Uses `pathExtraction` rules to identify channels/queries/console
- **Case-insensitive**: Target names matched case-insensitively
- **Most recent file**: If multiple log files exist for a target, uses the most recently modified

### File-Based Endpoints
- **Config-driven discovery**: Uses client's `discovery.patterns` and `pathExtraction` rules
- **Path security**: Validates all paths against configured `logDirectory` values
- **Flexible filtering**: Supports filtering by `clientId`, `serverId`, `server`, `channel`, `query`, and `type`

### General
- **Read-only**: No write operations supported (logs are managed by IRC clients)
- **Sync I/O**: Uses synchronous file operations for simplicity (suitable for log files)
- **No streaming**: Entire file is read into memory (consider streaming for very large files)
- **Automatic compression**: Bun natively handles gzip compression based on `Accept-Encoding` header
- **Server matching**: Matches `serverIdentifier` from path against server `id` or `displayName`
