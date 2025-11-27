# IRC Notify

A TypeScript-based IRC notification system that monitors IRC client log files and delivers configurable notifications based on events and filter rules.

## Features

- **100% Configuration-Driven** - No hardcoded business logic
- **JSON Configs** - Simple, portable configuration files
- **Flexible Filtering** - Powerful filter engine with AND/OR logic, regex matching
- **Template System** - Custom notification text using `{{field.path}}` syntax
- **Multiple Sinks** - Console, Ntfy, Webhooks, Files, and custom sinks
- **Zero-Code Adapters** - New IRC clients need only config files
- **Rate Limiting** - Per-sink rate limits to prevent spam
- **Import/Export** - Backup and share configs via compressed JSON bundles
- **Development Tools** - Generate test data, validate configs, export/import config bundles

## Quick Start

### Automatic Backup Import

On first startup, if no configuration exists, IRC Notify will automatically search the `/backups` directory for the most recent backup (based on metadata timestamp) and import it. This makes initial setup seamless:

```bash
# Place your backup in the backups directory
mkdir -p backups
cp config-export-2025-11-24.json.gz backups/

# Start the system - backup will be auto-imported
bun start
```

The system also creates all necessary config directories on startup if they don't exist:
- `config/clients/`
- `config/servers/`
- `config/events/`
- `config/sinks/`
- `backups/`

### Recommended: Docker

Pull and run the prebuilt image (includes multi-arch builds and version tags):

```bash
docker pull ghcr.io/hycord/irc-notify:latest
mkdir -p config logs
cp config.example.json config.json
docker run -it --rm \
  -v $(pwd)/logs:/logs:ro \
  -v $(pwd)/config:/app/config:ro \
  ghcr.io/hycord/irc-notify:latest
```

**With Config API enabled:**
```bash
docker run -it --rm \
  -v $(pwd)/logs:/logs:ro \
  -v $(pwd)/config:/app/config \
  -e ENABLE_API=true \
  -e API_PORT=3000 \
  -p 3000:3000 \
  ghcr.io/hycord/irc-notify:latest

# Get your auth token
docker exec <container-id> cat /app/config/auth_token.txt
```

Use a specific version:
```bash
docker pull ghcr.io/hycord/irc-notify:v1.0.0
```

### Source Install

```bash
# Install
git clone https://github.com/hycord/irc-notify.git
cd irc-notify
bun install

# Run (automatically creates config directories on first run)
bun start

# Or watch mode
bun dev

# Validate configuration
bun run config:validate
```

See [Quick Start Guide](./docs/guides/quickstart.md) for detailed setup.

## Documentation

### 📚 Getting Started
- [Installation & Setup](./docs/guides/installation.md)
- [Quick Start Guide](./docs/guides/quickstart.md)
- [Deployment Guide](./docs/guides/deployment.md)
- [Configuration Overview](./docs/guides/configuration.md)

### 🔧 Configuration
- [Configuration Guide](./docs/guides/configuration.md)
- [Textual IRC Client Setup](./docs/guides/clients/textual.md)
- [The Lounge Client Setup](./docs/guides/clients/thelounge.md)
- [HexChat Client Setup](./docs/guides/clients/hexchat.md)
- [Host Metadata Overrides](./docs/guides/host-metadata.md)
- [CLI Tools](./docs/guides/cli.md)

### 🏗️ Architecture
- [System Architecture](./docs/architecture/overview.md)
- [Data Flow](./docs/architecture/data-flow.md)
- [Type System](./docs/architecture/type-system.md)

### 📖 API Reference

#### API Server (HTTP)
- [Config API](./docs/api-server/config-api.md) - HTTP configuration management
- [Root Config API](./docs/api-server/root-config.md) - Root configuration endpoint
- [Data Flow API](./docs/api-server/data-flow.md) - Data flow visualization
- [Logs API](./docs/api-server/logs-api.md) - Log file exploration with chunking/compression
- [API Type Reference](./docs/api-server/type-reference.ts) - Response types

#### Core APIs (Internal)
- [ConfigIO](./docs/core-apis/config-io.md) - Import/export utilities
- [FilterEngine](./docs/core-apis/filter-engine.md) - Filter evaluation
- [TemplateEngine](./docs/core-apis/template-engine.md) - Template processing

### 🛠️ CLI
- [Command Line Interface](./docs/guides/cli.md)

### 🧪 Development
- [Development Guide](./docs/guides/development.md)
- [Testing Guide](./docs/guides/testing.md)

## Example Configuration

### Main Config
```json
{
  "global": {
    "pollInterval": 1000,
    "debug": false,
    "defaultLogDirectory": "../logs",
    "configDirectory": "."
  },
  "api": {
    "enabled": true,
    "port": 3000,
    "host": "0.0.0.0",
    "enableFileOps": true
  }
}
```

Note: Client, server, event, and sink IDs are auto-discovered from their respective directories.

### Event with Filters (Current Schema)
```json
{
  "id": "phrase-alert",
  "name": "Phrase Alert",
  "enabled": true,
  "baseEvent": "message",
  "serverIds": ["*"],
  "priority": 90,
  "group": "alerts",
  "filters": {
    "operator": "OR",
    "filters": [
      {
        "field": "message.content",
        "operator": "contains",
        "value": "my-nickname"
      },
      {
        "field": "message.content",
        "operator": "matches",
        "pattern": "@my-nickname\\b"
      }
    ]
  },
  "sinkIds": ["console", "ntfy"],
  "metadata": {
    "sink": {
      "ntfy": {
        "priority": "high",
        "tags": ["bell", "speech_balloon"]
      }
    }
  }
}
```

## Configuration API

The optional Config API server provides HTTP endpoints for runtime configuration management. Enable it via config file or environment variables.

### Config File (Recommended)
```json
{
  "api": {
    "enabled": true,
    "port": 3000,
    "host": "0.0.0.0",
    "enableFileOps": true
  }
}
```

### Authentication

On first startup, the system automatically generates a secure random auth token (64 hex characters) and stores it in `config/auth_token.txt`. This file is:
- **Machine-specific** and generated once per installation
- **Not version controlled** (gitignored) 
- **Not backed up** (excluded from config exports)

To retrieve your token:
```bash
cat config/auth_token.txt
```

All API requests require the token:
```bash
curl -H "Authorization: Bearer $(cat config/auth_token.txt)" \
  http://localhost:3000/api/health
```

### Environment Variables (Override)
Environment variables take precedence over config file settings:
```bash
ENABLE_API=true             # Enable API (overrides config)
API_PORT=3000              # Port (overrides config)
API_HOST=0.0.0.0           # Host (overrides config)
API_TOKEN=custom-token     # Override auto-generated token (not recommended)
API_ENABLE_FILE_OPS=false  # Disable file ops (overrides config)
```

See [Config API Documentation](./docs/api-server/config-api.md) for endpoints and usage.

## CLI Commands

```bash
# Run the system
bun start                     # Run once
bun dev                       # Watch mode

# Config management
bun run config:validate       # Validate configs
bun run config:export         # Export to bundle
bun run config:import         # Import from bundle
bun run config:merge          # Merge configs

# Development testing
bun run dev:gen               # Generate test data
bun run dev:cleanup           # Clean up test data
```

See [CLI Documentation](./docs/guides/cli.md) for complete reference.

## Release & Versioning

Releases follow semantic versioning (`MAJOR.MINOR.PATCH`). A dedicated **Release** GitHub Action automates tagging, changelog movement, multi-arch Docker image publishing, and GitHub Release creation.

### Tags Published
- `vX.Y.Z` (semantic version)
- `<commit-sha>` (12 chars for provenance)
- `latest` (skipped for prereleases)

### Automated Steps
1. Validates version & updates `package.json`
2. Moves `[Unreleased]` block to new version section with date
3. Runs tests & config validation
4. Builds app + exports config bundle
5. Builds & pushes multi-arch Docker image
6. Creates GitHub Release (attaches bundle)

Trigger the workflow from GitHub UI: Actions → Release → Run workflow (provide version input).

See [Releases Guide](./docs/guides/releases.md) for full details & manual fallback.

### Important Changes in v1.0.0
- Status API (`GET /api/status`) now returns a flattened object (removed nested `status` property)
- Events expose `serverIds`, `sinkIds`, `baseEvent`, `priority` (removed legacy `clientId`/`serverId` single refs)
- Config validation auto-prunes invalid `serverIds`/`sinkIds` and persists sanitized files
- Webhook sink headers are sanitized (non-ASCII removed); place Unicode/emoji in body content
- Data Flow API includes disabled components in `routingPaths` (each path has `enabled` flag)

## Architecture

```
┌─────────────────────────────────────────────┐
│          IRC Client Log Files                │
│     (Textual, TheLounge, etc.)              │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│     Layer 1: Clients (GenericClientAdapter) │
│  • Discover log files (glob patterns)       │
│  • Parse lines (regex rules)                │
│  • Build MessageContext                      │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│       Layer 2: Events (EventProcessor)      │
│  • Enrich with server/user metadata         │
│  • Match base event types                   │
│  • Apply custom filters                     │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│         Layer 3: Sinks (BaseSink)           │
│  • Process templates                        │
│  • Apply rate limits                        │
│  • Deliver notifications                    │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│         Notification Destinations            │
│   Console, Ntfy, Webhooks, Files, Custom   │
└─────────────────────────────────────────────┘
```

See [Architecture Overview](./docs/architecture/overview.md) for details.

## Supported IRC Clients

### Currently Supported
- **Textual** - Full support (reference implementation)
- **TheLounge** - Full support
- **HexChat** - Template config available; adjust patterns to your logs

### Adding New Clients
No code required! Just create a config file with:
- Log discovery patterns (glob)
- Parser rules (regex with groups)
- Path extraction patterns

See [Configuration Overview](./docs/guides/configuration.md) for details on client configuration.

## Supported Sinks

### Built-in Sinks
- **Console** - Terminal output
- **Ntfy** - Push notifications ([ntfy.sh](https://ntfy.sh))
- **Webhook** - HTTP POST to any endpoint (Discord, Slack, etc.)
- **File** - Append to log file

### Custom Sinks
Extend `BaseSink` and implement:
- `initialize()` - Setup
- `sendNotification()` - Delivery logic

See [Development Guide](./docs/guides/development.md) for extending sinks.

## Technology Stack

- **Runtime**: [Bun](https://bun.sh) v1.0+
- **Language**: TypeScript
- **Config Format**: JSON
- **File Monitoring**: Node.js `fs` module (polling)
- **Pattern Matching**: Regular expressions
- **Template Engine**: Custom `{{field.path}}` syntax

## Requirements

- Bun v1.0 or higher
- IRC client logs (Textual, TheLounge, or similar)
- Basic JSON knowledge

## Docker Deployment

```bash
# Build
docker build -t irc-notify .

# Run
docker run -it --rm \
  -v $(pwd)/logs:/logs:ro \
  -v $(pwd)/config:/app/config:ro \
  irc-notify
```

See [Installation Guide](./docs/guides/installation.md) for more deployment options.

## Development & Testing

```bash
# Install dependencies
bun install

# Run in watch mode
bun dev

# Validate configs
bun run config:validate

# Generate test data
bun run dev:gen

# Run tests
bun test                # Full suite
bun test tests/unit     # Unit only
bun test tests/e2e      # End-to-end only

## Code Formatting

Biome is used for fast formatting and import organization:

```bash
bun run format         # Apply formatting
bun run format:check   # Verify formatting (CI)
```

CI enforces formatting on pull requests (`Format & Lint` workflow). Adjust rules in `biome.json`.

See docs/guides/testing.md for details.


## Project Structure

```
irc-notify/
├── config/                  # JSON configs
│   ├── config.ts            # Main config
│   ├── clients/             # Client adapters
│   ├── servers/             # Server metadata
│   ├── events/              # Event rules
│   └── sinks/               # Notification sinks
├── src/                     # Source code
│   ├── adapters/            # Client adapters
│   ├── config/              # Config loading & validation
│   ├── events/              # Event processing
│   ├── sinks/               # Notification sinks
│   ├── utils/               # Utilities
│   ├── watcher/             # Log file monitoring
│   ├── types/               # TypeScript types
│   ├── dev/                 # Development tools
│   ├── cli.ts               # CLI entry point
│   └── index.ts             # Main orchestrator
├── logs/                    # IRC logs (monitored)
├── docs/                    # Documentation
├── Dockerfile               # Docker configuration
├── package.json             # Dependencies & scripts
└── tsconfig.json            # TypeScript config
```

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

See [Development Guide](./docs/guides/development.md) for details.

## License

ISC

## Author

**hycord** <hycord@hycordia.com>

## Repository

[https://github.com/hycord/irc-notify](https://github.com/hycord/irc-notify)

## Issues

[https://github.com/hycord/irc-notify/issues](https://github.com/hycord/irc-notify/issues)

## Related Projects

- [Textual](https://www.codeux.com/textual/) - IRC client for macOS
- [TheLounge](https://thelounge.chat/) - Self-hosted web IRC client
- [ntfy](https://ntfy.sh/) - Simple pub-sub notification service

## Acknowledgments

Built with love for the IRC community 💙
