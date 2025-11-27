# HexChat Client Setup

This guide explains how to configure IRC Notify to monitor logs from the HexChat IRC client.

## Log File Structure

HexChat typically stores logs per-network and per-channel/query.

Common locations:
- Linux: `~/.config/hexchat/logs/`
- macOS: `~/Library/Application Support/HexChat/logs/`
- Windows: `%APPDATA%/HexChat/logs/`

Example structure:
```
logs/hexchat/
  Libera/
    #linux.log
    #linux.2025-11-27.log   # depending on your rotation settings
    alice.log                # queries
  OFTC/
    #debian.log
```

Note: File extensions can be `.log` or `.txt` depending on your setup. Adjust discovery patterns accordingly.

## Configuration

A starter client configuration is provided at `config/clients/hex-chat.json` (disabled by default). Review and tailor the discovery patterns to match your HexChat log layout.

Minimal example (update paths and patterns for your environment):

```json
{
  "id": "hex-chat",
  "name": "HexChat",
  "enabled": true,
  "logDirectory": "./logs/hex-chat",
  "discovery": {
    "patterns": {
      "channels": "**/*/#*.{log,txt}",
      "queries": "**/*/[!#]*.{log,txt}",
      "console": "**/*/server*.{log,txt}"
    },
    "pathExtraction": {
      "serverPattern": "/logs/hex-chat/([^/]+)/",
      "serverGroup": 1,
      "channelPattern": "/\\/(#.+)\\.(log|txt)$/",
      "channelGroup": 1,
      "queryPattern": "/\\/([^#\\/][^\\/]*)\\.(log|txt)$/",
      "queryGroup": 1,
      "consolePattern": "/\\/server\\.(log|txt)$/"
    }
  },
  "serverDiscovery": {
    "type": "filesystem",
    "searchPattern": "**/*/*.{log,txt}",
    "hostnamePattern": "Connecting to\\s+([^\\s]+)",
    "hostnameGroup": 1
  },
  "fileType": { "type": "text", "encoding": "utf-8" }
}
```

## Parser Rules

HexChat line formats often look like this and work with the generic adapter:

- Channel/query message: `Nov 17 17:57:33 <Gatekeeper> Thank you...`
- Notice/service: `Nov 17 17:50:50 -ChanServ- [#red-invites] Welcome ...`
- Address line (skipped): `[Gatekeeper has address gatekeeper@Gatekeeper.bot.example]`
- Logging markers (skipped): `**** BEGIN LOGGING AT Mon Nov 17 16:39:13 2025`

The provided `hex-chat.json` includes parser rules for:
- `privmsg` (channel/query messages)
- Skip logging markers and address lines
- A catch-all `system` rule for other lines

Adjust or extend patterns as needed for your log format and locale.

## Server Configuration

Create a server config per IRC network in `config/servers/` so messages can be enriched and matched in events:

```json
{
  "id": "libera",
  "hostname": "irc.libera.chat",
  "displayName": "Libera"
}
```

Ensure the server `id` matches the network folder name under `logs/hexchat/` (case-insensitive), or use the `serverDiscovery`/`metadata` fields to assist matching.

## Testing

```bash
# Validate configuration
bun run config:validate

# Run with debug logging to see discovered files and matches
bun start
```

If no messages are detected:
- Verify `logDirectory` points to your HexChat logs
- Tweak `discovery.patterns` globs for your file naming
- Update `pathExtraction` regexes to match your folders/files
- Enable `debug: true` in the root `config.json` to trace discovery

## Next Steps

- Configure events in `config/events/` to route notifications
- Add sinks in `config/sinks/` (Console, Ntfy, Webhook, File)
- See the [Template Engine](../../core-apis/template-engine.md) for message formatting
