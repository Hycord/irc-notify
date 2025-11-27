# Textual IRC Client Setup

This guide explains how to configure IRC Notify to monitor logs from the [Textual IRC Client](https://www.codeux.com/textual/).

## Log File Structure

Textual organizes logs in the following structure:

```
logs/textual/
  ServerName (UUID)/
    Console/
      *.txt          # Server console messages
    Channels/
      #channel.txt   # Channel messages
    Queries/
      nickname.txt   # Private messages
```

**Example**:
```
logs/textual/
  Libera (94B79)/
    Console/2025-11-26.txt
    Channels/#linux.txt
    Queries/alice.txt
```

## Configuration

### 1. Client Configuration

The Textual client adapter is pre-configured in `config/clients/textual.json`:

```json
{
  "id": "textual",
  "name": "Textual IRC Client",
  "enabled": true,
  "logDirectory": "./logs/textual",
  "discovery": {
    "patterns": {
      "console": "**/Console/*.txt",
      "channels": "**/Channels/**/*.txt",
      "queries": "**/Queries/**/*.txt"
    },
    "pathExtraction": {
      "serverPattern": "/([^/]+)\\s+\\([^)]+\\)/",
      "serverGroup": 1,
      "channelPattern": "/Channels/([^/]+)/",
      "channelGroup": 1,
      "queryPattern": "/Queries/([^/]+)/",
      "queryGroup": 1,
      "consolePattern": "/Console/"
    }
  }
}
```

**Key settings**:
- `logDirectory`: Path to Textual's log directory (relative to config file)
- `discovery.patterns`: Glob patterns to find console/channel/query logs
- `pathExtraction`: Regex patterns to extract server/channel names from file paths

### 2. Finding Your Textual Log Directory

**macOS**:
```bash
~/Library/Group Containers/[identifier]/Library/Application Support/Textual IRC/Logs/
```

**Update config to point to your logs**:
```json
{
  "logDirectory": "/Users/yourname/Library/Group Containers/[identifier]/Library/Application Support/Textual IRC/Logs/"
}
```

### 3. Server Configuration

Create a server config for each IRC network in `config/servers/`:

```json
{
  "id": "libera",
  "hostname": "irc.libera.chat",
  "displayName": "Libera",
  "users": {
    "alice": {
      "nickname": "alice",
      "realName": "Alice Smith",
      "isHighlightUser": true
    }
  }
}
```

**Important**: The server `id` must match the server name in Textual's log directory (case-insensitive). For example:
- Log directory: `Libera (94B79)/` → Server ID: `libera`
- Log directory: `RED (47DA1)/` → Server ID: `RED` or `red`

### 4. Event Configuration

Create event rules in `config/events/` to define what triggers notifications:

```json
{
  "id": "mention-alert",
  "name": "Direct Mentions",
  "enabled": true,
  "baseEventType": "message",
  "serverFilter": "*",
  "filters": {
    "operator": "AND",
    "filters": [
      {
        "field": "message.content",
        "operator": "contains",
        "value": "myname"
      }
    ]
  },
  "sinkIds": ["ntfy"],
  "metadata": {
    "sink": {
      "ntfy": {
        "priority": "high",
        "tags": ["bell"]
      }
    }
  }
}
```

## Log Format Examples

Textual uses the following log formats:

### Channel Message
```
[2025-11-26 14:30:45] <alice> Hello everyone!
```

### Join
```
[2025-11-26 14:30:45] alice (alice@example.com) joined the channel
```

### Quit
```
[2025-11-26 14:30:45] alice (alice@example.com) left IRC (Quit: Leaving)
```

### Notice/Service Message
```
[2025-11-26 14:30:45] -NickServ- You are now identified for alice
```

### Topic
```
[2025-11-26 14:30:45] Topic is Welcome to #channel
```

## Parser Rules

The Textual client adapter includes pre-configured parser rules for all common message types:

- **privmsg**: Regular channel/query messages
- **join**: User joined channel
- **quit**: User disconnected from IRC
- **part**: User left channel
- **nick**: Nickname change
- **mode**: Channel mode changes
- **topic**: Channel topic changes
- **notice**: Service messages (NickServ, ChanServ, etc.)
- **action**: `/me` actions
- **kick**: User kicked from channel

Rules are priority-sorted (higher = checked first) to ensure correct parsing.

## Common Issues

### Server Not Matched

**Problem**: Messages appear but server name is "Unknown"

**Solution**: Check that your server config ID matches the directory name:
```bash
# List server directories
ls logs/textual/
# Output: "Libera (94B79)"

# Server config ID should be "libera"
```

### No Messages Detected

**Problem**: IRC Notify doesn't detect any messages

**Solutions**:
1. Verify log directory path is correct
2. Ensure Textual is actually logging (check Preferences → Style)
3. Check file permissions (logs must be readable)
4. Enable debug mode to see what files are discovered:
   ```json
   {
     "debug": true
   }
   ```

### Messages Not Triggering Events

**Problem**: Messages are parsed but no notifications sent

**Solutions**:
1. Verify event `serverFilter` matches your server ID (`*` for all servers)
2. Check event filters are correct
3. Enable debug mode to see filter evaluation
4. Verify sink IDs in event config exist in `config/sinks/`

## Testing

Test your configuration:

```bash
# Validate configuration
bun run config:validate

# Run with debug output
# Edit config.json: "debug": true
bun start

# Generate test messages (development mode)
bun run dev:gen
```

## Template Variables

Use these template variables in event metadata (titles, bodies, etc.):

```json
{
  "metadata": {
    "sink": {
      "ntfy": {
        "title": "[{{server.displayName}}] {{sender.nickname}} in {{channel}}",
        "body": "{{message.content}}"
      }
    }
  }
}
```

**Available variables**:
- `{{server.displayName}}` - Server friendly name
- `{{server.id}}` - Server identifier
- `{{channel}}` - Channel name (e.g., `#linux`)
- `{{sender.nickname}}` - Message sender's nickname
- `{{sender.realName}}` - Real name (if configured in server.users)
- `{{message.content}}` - Message text
- `{{message.type}}` - Message type (privmsg, join, quit, etc.)

## Next Steps

- [Configure notification sinks](../configuration.md#sinks)
- [Set up filter rules](../configuration.md#events)
- [Use template system](../templates.md)
- [Enable Config API](../../api-server/server-architecture.md) for remote management
