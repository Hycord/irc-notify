# IRC Notify Documentation

Welcome to the IRC Notify documentation. This system monitors IRC client log files and delivers configurable notifications based on events and filter rules.

## Quick Links

### Getting Started
- [Installation & Setup](./guides/installation.md)
- [Quick Start Guide](./guides/quickstart.md)
- [Configuration Overview](./guides/configuration.md)
- [Releases & Versioning](./guides/releases.md)

### Configuration Guides
- [Filter & Template System](./guides/filters.md)

### Advanced Topics
- [Host Metadata Overrides](./guides/host-metadata.md)
- [Development Guide](./guides/development.md)
- [Testing Guide](./guides/testing.md)

### Architecture
- [System Architecture](./architecture/overview.md)
- [Data Flow](./architecture/data-flow.md)
- [Type System](./architecture/type-system.md)

### API Reference

#### API Server (HTTP)
- [Config API](./api-server/config-api.md)
- [Root Config API](./api-server/root-config.md) - Manage root configuration
- [Data Flow API](./api-server/data-flow.md) - Data flow visualization

#### Core APIs (Internal)
- [ConfigIO](./core-apis/config-io.md) - Import/export utilities
- [FilterEngine](./core-apis/filter-engine.md) - Filter evaluation
- [TemplateEngine](./core-apis/template-engine.md) - Template processing

### CLI Reference
- [Command Line Interface](./guides/cli.md)

## Project Structure

```
irc-notify/
├── config/                    # Configuration files (JSON)
│   ├── config.json            # Main config (optional - auto-discovers)
│   ├── clients/               # Client adapters
│   ├── servers/               # Server metadata
│   ├── events/                # Event rules
│   └── sinks/                 # Notification sinks
├── src/                       # Source code
│   ├── adapters/              # Client adapters
│   ├── config/                # Config loading & validation
│   ├── events/                # Event processing
│   ├── sinks/                 # Notification sinks
│   ├── utils/                 # Utilities (templates, filters, env)
│   ├── watcher/               # Log file monitoring
│   ├── types/                 # TypeScript types
│   ├── dev/                   # Development testing tools
│   ├── cli.ts                 # CLI entry point
│   └── index.ts               # Main orchestrator
├── logs/                      # Log files (monitored)
└── docs/                      # Documentation (you are here)
```

## Key Concepts

### Configuration-Driven Architecture
Everything is configured via JSON files - no hardcoded business logic. Configuration files are automatically discovered from their directories.

### Message Pipeline
```
Log File → LogWatcher → ClientAdapter → MessageContext → EventProcessor → Sinks
```

### MessageContext
The central data structure that flows through the entire system, carrying:
- Raw log line and timestamp
- Parsed message (content, type, sender, target)
- Server and client metadata (enriched from configs)
- Custom metadata from rules

### Four Configuration Types
1. **Clients** - Define how to discover and parse log files from IRC clients
2. **Servers** - Define server metadata and user information
3. **Events** - Define filter rules for matching messages
4. **Sinks** - Define where and how to send notifications

## Technology Stack

- **Runtime**: Bun (JavaScript runtime)
- **Language**: TypeScript
- **Config Format**: JSON with auto-discovery
- **File Monitoring**: Node.js fs module with polling
- **Pattern Matching**: Regular expressions + filter engine
- **Template Engine**: Custom `{{field.path}}` syntax

## Getting Help

- Check the [guides](./guides/) for step-by-step instructions
- Review the [architecture](./architecture/) docs for design decisions
- Explore the [API reference](./api/) for detailed interfaces
- See [Quick Start Guide](./guides/quickstart.md) for example configurations

## Contributing

See the [Development Guide](./guides/development.md) for information on:
- Setting up a development environment
- Running tests
- Code conventions
- Submitting changes
