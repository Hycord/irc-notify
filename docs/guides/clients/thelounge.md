# The Lounge IRC Client Setup

This guide explains how to configure IRC Notify to monitor logs from [The Lounge](https://thelounge.chat/) IRC client.

## Log File Structure

The Lounge organizes logs in the following structure:

```
logs/thelounge/
  users/
    <username>.json      # User config with network info
  logs/
    <username>/
      <network>/
        <channel>.log    # Channel messages
```

**Example**:
```
logs/thelounge/
  users/admin.json
  logs/admin/
    libera/
      #linux.log
      alice.log
```

## Configuration

### 1. Client Configuration

The Lounge client adapter is pre-configured in `config/clients/thelounge.json`:

```json
{
  "id": "thelounge",
  "name": "The Lounge",
  "enabled": true,
  "logDirectory": "./logs/thelounge",
  "discovery": {
    "patterns": {
      "channels": "logs/admin/**/*.log",
      "queries": "logs/admin/**/*.log"
    },
    "pathExtraction": {
      "serverPattern": "logs/admin/([^/]+)/",
      "serverGroup": 1,
      "channelPattern": "/([^/]+)\\.log$",
      "channelGroup": 1
    }
  },
  "serverDiscovery": {
    "type": "json",
    "jsonPath": "users/admin.json",
    "arrayPath": "networks",
    "hostnameField": "host",
    "uuidField": "uuid",
    "nameField": "name"
  }
}
```

**Key settings**:
- `logDirectory`: Path to The Lounge data directory
- `discovery.patterns`: Glob patterns to find channel/query logs (adjust `admin` to your username)
- `serverDiscovery`: Reads network info from The Lounge's user config

### 2. Finding Your Lounge Directory

**Docker** (default):
```bash
/var/opt/thelounge/
```

**Self-hosted** (typical):
```bash
~/.thelounge/
```

**Update config**:
```json
{
  "logDirectory": "/var/opt/thelounge"
}
```

**Multiple users**: Update the glob pattern to include all users:
```json
{
  "discovery": {
    "patterns": {
      "channels": "logs/**/**/*.log"
    }
  }
}
```

### 3. Enable Logging in The Lounge

The Lounge does not enable text logging by default. You must enable it:

1. Edit The Lounge's `config.js`
2. Set `logs.text = true`:
   ```javascript
   module.exports = {
     // ... other config
     logs: {
       text: true,
       timezone: "UTC+00:00"
     }
   };
   ```
3. Restart The Lounge

**Verify logging is enabled**:
```bash
ls logs/admin/libera/
# Should show .log files for each channel
```

### 4. Server Configuration

The Lounge's `users/admin.json` file contains network information with UUIDs. IRC Notify automatically reads this file to match servers.

Create a server config in `config/servers/` for each network:

```json
{
  "id": "libera",
  "hostname": "irc.libera.chat",
  "displayName": "Libera Chat",
  "users": {
    "mybot": {
      "nickname": "mybot",
      "realName": "Automated Bot",
      "isHighlightUser": false
    },
    "alice": {
      "nickname": "alice",
      "realName": "Alice Smith",
      "isHighlightUser": true
    }
  }
}
```

**Server ID matching**: The server `id` must match the network name in The Lounge:
- The Lounge network name: `libera` → Server ID: `libera`
- The Lounge network name: `RED` → Server ID: `RED` or `red` (case-insensitive)

IRC Notify tries to match in this order:
1. Network UUID (from `users/admin.json`)
2. Network name (from directory name)
3. Hostname (from `users/admin.json`)

### 5. Event Configuration

Create event rules in `config/events/` to define notifications:

```json
{
  "id": "highlight-alert",
  "name": "Channel Highlights",
  "enabled": true,
  "baseEventType": "message",
  "serverFilter": "*",
  "filters": {
    "operator": "OR",
    "filters": [
      {
        "field": "message.content",
        "operator": "matches",
        "pattern": "\\b(alice|myname)\\b"
      },
      {
        "field": "sender.isHighlightUser",
        "operator": "equals",
        "value": true
      }
    ]
  },
  "sinkIds": ["ntfy"],
  "metadata": {
    "sink": {
      "ntfy": {
        "priority": "high",
        "tags": ["speech_balloon"]
      }
    }
  }
}
```

## Log Format Examples

The Lounge uses a simple, clean log format:

### Channel Message
```
[2025-11-26 14:30:45] <alice> Hello everyone!
```

### Join
```
[2025-11-26 14:30:45] *** alice (alice@example.com) joined
```

### Quit
```
[2025-11-26 14:30:45] *** alice (alice@example.com) quit (Quit: Leaving)
```

### Part
```
[2025-11-26 14:30:45] *** alice (alice@example.com) left (Reason: Goodbye)
```

### Nick Change
```
[2025-11-26 14:30:45] *** alice changed nick to alice_away
```

### Mode Change
```
[2025-11-26 14:30:45] *** bob set mode +o alice
```

### Topic Change
```
[2025-11-26 14:30:45] *** bob changed topic to "Welcome to #channel"
```

### Action
```
[2025-11-26 14:30:45] * alice waves hello
```

## Parser Rules

The Lounge client adapter includes pre-configured parser rules for all message types:

- **privmsg**: Regular channel/query messages
- **join**: User joined channel
- **quit**: User disconnected from IRC
- **part**: User left channel (with/without reason)
- **nick**: Nickname change
- **mode**: Channel/user mode changes
- **topic**: Channel topic changes
- **action**: `/me` actions
- **kick**: User kicked from channel
- **invite**: User invited to channel
- **away**: Away status messages
- **back**: Back from away
- **ctcp**: CTCP requests/responses

Rules are priority-sorted to ensure correct parsing.

## Docker Setup

If running The Lounge in Docker, mount both directories:

```bash
docker run -d \
  --name thelounge \
  -v thelounge_data:/var/opt/thelounge \
  thelounge/thelounge:latest

docker run -d \
  --name irc-notify \
  -v thelounge_data:/logs:ro \
  -v ./config:/app/config:ro \
  ghcr.io/hycord/irc-notify:latest
```

Or use docker-compose:

```yaml
version: '3.8'

services:
  thelounge:
    image: thelounge/thelounge:latest
    container_name: thelounge
    ports:
      - "9000:9000"
    volumes:
      - thelounge_data:/var/opt/thelounge
    restart: unless-stopped

  irc-notify:
    image: ghcr.io/hycord/irc-notify:latest
    container_name: irc-notify
    depends_on:
      - thelounge
    volumes:
      - thelounge_data:/logs:ro
      - ./config:/app/config:ro
    restart: unless-stopped

volumes:
  thelounge_data:
```

**Update client config** for Docker:
```json
{
  "logDirectory": "/logs"
}
```

## Common Issues

### No Log Files Found

**Problem**: IRC Notify can't find any log files

**Solutions**:
1. Verify logging is enabled in `config.js` (`logs.text = true`)
2. Check The Lounge has restarted after enabling logging
3. Verify log directory path is correct
4. Check file permissions (logs must be readable)
5. Update username in glob pattern (default is `admin`)

### Server Not Matched

**Problem**: Messages appear but server name is "Unknown"

**Solutions**:
1. Verify `users/admin.json` exists and is readable
2. Check server config ID matches network name in The Lounge
3. Ensure `serverDiscovery.jsonPath` points to correct user config
4. Enable debug mode to see server matching process

### Messages Not Triggering Events

**Problem**: Messages are parsed but no notifications sent

**Solutions**:
1. Check event `serverFilter` matches your server ID (`*` for all servers)
2. Verify event filters are correct
3. Enable debug mode to see filter evaluation
4. Confirm sink IDs exist in `config/sinks/`

### Wrong Server Detected

**Problem**: Messages assigned to wrong server

**Solution**: The Lounge uses UUIDs internally. IRC Notify reads `users/admin.json` to map UUIDs to network names. If this fails:
1. Check `serverDiscovery` config is correct
2. Verify JSON file structure matches expected format
3. Enable debug mode to see UUID mapping

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

Use these template variables in event metadata:

```json
{
  "metadata": {
    "sink": {
      "ntfy": {
        "title": "[{{server.displayName}}] New message in {{channel}}",
        "body": "<{{sender.nickname}}> {{message.content}}"
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
- `{{sender.isHighlightUser}}` - Boolean flag
- `{{message.content}}` - Message text
- `{{message.type}}` - Message type (privmsg, join, quit, etc.)
- `{{message.timestamp}}` - Parsed timestamp

## Advanced: Multiple Users

To monitor logs for multiple The Lounge users, update the client config:

```json
{
  "discovery": {
    "patterns": {
      "channels": "logs/**/**/*.log"
    },
    "pathExtraction": {
      "serverPattern": "logs/[^/]+/([^/]+)/",
      "serverGroup": 1,
      "channelPattern": "/([^/]+)\\.log$",
      "channelGroup": 1
    }
  }
}
```

Then create separate server discovery configs for each user, or manually configure server IDs.

## Next Steps

- [Configure notification sinks](../configuration.md#sinks)
- [Set up filter rules](../configuration.md#events)
- [Use template system](../templates.md)
- [Docker deployment](../installation.md#docker)
- [Enable Config API](../../api-server/server-architecture.md) for remote management
