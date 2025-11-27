# Quick Start Guide

Get IRC Notify running with notifications in under 5 minutes.

## Quick Start: Import from Backup (30 seconds)

If you have an existing configuration backup:

```bash
git clone https://github.com/hycord/irc-notify.git
cd irc-notify
bun install

# Place your backup in the backups directory
mkdir -p backups
cp /path/to/config-export-*.json.gz backups/

# Start - backup will be auto-imported!
bun start
```

The system will automatically:
- Create all necessary config directories
- Find the most recent backup in `/backups`
- Import and merge the configuration
- Start monitoring your IRC logs

## Manual Setup: From Scratch

### Step 1: Install (1 minute)

```bash
git clone https://github.com/hycord/irc-notify.git
cd irc-notify
bun install
```

### Step 2: Configure Client (2 minutes)

Create `config/clients/textual.json`:

```json
{
  "id": "textual",
  "type": "textual",
  "name": "Textual IRC Client",
  "enabled": true,
  "logDirectory": "../logs/textual",
  "discovery": {
    "patterns": {
      "console": "**/Console/*.txt",
      "channels": "**/Channels/**/*.txt",
      "queries": "**/Queries/**/*.txt"
    },
    "pathExtraction": {
      "serverPattern": "/([^/]+)\\s*\\([A-F0-9]+\\)/",
      "serverGroup": 1,
      "channelPattern": "/(?:Channels|Queries)/([^/]+)/",
      "channelGroup": 1
    }
  },
  "serverDiscovery": {
    "type": "static",
    "servers": []
  },
  "fileType": {
    "type": "text",
    "encoding": "utf-8"
  },
  "parserRules": [
    {
      "name": "privmsg",
      "pattern": "^\\[(\\d{2}:\\d{2}:\\d{2})\\]\\s*<([^>]+)>\\s*(.+)$",
      "messageType": "privmsg",
      "groups": {
        "timestamp": 1,
        "sender": 2,
        "content": 3
      }
    }
  ]
}
```

## Step 3: Configure Server (30 seconds)

Create `config/servers/libera.json`:

```json
{
  "id": "libera",
  "hostname": "irc.libera.chat",
  "displayName": "Libera",
  "network": "Libera.Chat",
  "port": 6697,
  "tls": true,
  "enabled": true
}
```

## Step 4: Configure Console Sink (30 seconds)

Create `config/sinks/console.json`:

```json
{
  "id": "console",
  "type": "console",
  "name": "Console Output",
  "enabled": true,
  "config": {},
  "template": {
    "title": "[{{server.displayName}}] {{event.name}}",
    "body": "{{sender.nickname}}: {{message.content}}"
  }
}
```

## Step 5: Configure Event (30 seconds)

Create `config/events/phrase-alert.json`:

```json
{
  "id": "phrase-alert",
  "name": "Phrase Alert",
  "enabled": true,
  "baseEvent": "message",
  "serverIds": ["*"],
  "priority": 90,
  "filters": {
    "operator": "AND",
    "filters": [
      {
        "field": "message.content",
        "operator": "contains",
        "value": "your-nickname-here"
      }
    ]
  },
  "sinkIds": ["console"]
}
```

## Step 6: Main Config (30 seconds)

Create `config/config.json` (optional - configs auto-discovered):

```json
{
  "global": {
    "pollInterval": 1000,
    "debug": true,
    "defaultLogDirectory": "./logs",
    "rescanLogsOnStartup": false
  }
}
```

## Step 7: Run! (10 seconds)

```bash
bun start
```

You should see:
```
Initializing IRC Notification System...
Auto-discovered configuration from config/ directory
  - 1 clients
  - 1 servers
  - 1 events
  - 1 sinks
Initialized client: Textual IRC Client (textual)
Initialized sink: Console Output (console)
Starting to watch 5 log files
Now watching: /path/to/logs/textual/Libera/Channels/#general/2025-11-24.txt
...
```

## Test It

1. Open your IRC client
2. Have someone mention your nickname in a channel
3. Watch the console output show the notification!

## Next Steps

### Add More Events

Create `config/events/direct-message.json`:

```json
{
  "id": "direct-message",
  "name": "Direct Message",
  "enabled": true,
  "baseEvent": "message",
  "serverIds": ["*"],
  "priority": 100,
  "filters": {
    "operator": "AND",
    "filters": [
      {
        "field": "target.type",
        "operator": "equals",
        "value": "query"
      }
    ]
  },
  "sinkIds": ["console"]
}
```

**Note:** No need to list in main config - automatically discovered!
```

### Add Push Notifications

Create `config/sinks/ntfy.json`:

```json
{
  "id": "ntfy",
  "type": "ntfy",
  "name": "Ntfy Push",
  "enabled": true,
  "config": {
    "endpoint": "https://ntfy.sh",
    "topic": "your-topic-here",
    "priority": "default"
  },
  "template": {
    "title": "[{{server.displayName}}] {{sender.nickname}}",
    "body": "{{message.content}}"
  }
}
```

Update event to use ntfy in `config/events/phrase-alert.json`:
```json
{
  "sinkIds": ["console", "ntfy"]
}
```

### Enable Watch Mode

For automatic reload during development:

```bash
bun dev
```

## Common Issues

### No logs discovered
- Check `logDirectory` path in client config
- Verify log file patterns match your structure
- Enable `debug: true` in main config

### Notifications not triggering
- Check filter rules match your data
- Verify event is enabled
- Look for error messages in debug output

### Configuration errors
- Run `bun run config:validate`
- Check all IDs are referenced correctly
- Ensure JSON syntax is valid

## Learning More

- [Configuration Overview](./configuration.md) - Full config reference
- [CLI Reference](./cli.md) - Command line tools
- [Host Metadata](./host-metadata.md) - Server metadata overrides
- [Webhook Transforms](./webhook-transforms.md) - Webhook customization
