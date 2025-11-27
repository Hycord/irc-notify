# Documentation Table of Contents

Complete index of all IRC Notify documentation.

## 📖 Main Documentation

- [README](./README.md) - Documentation hub and quick links

## 🚀 Getting Started

- [Installation & Setup](./guides/installation.md) - Install Bun, clone repo, verify setup
- [Quick Start Guide](./guides/quickstart.md) - Get running in 5 minutes
- [Deployment Guide](./guides/deployment.md) - Production deployment with Docker
- [Configuration Overview](./guides/configuration.md) - Complete config reference
- [Releases & Versioning](./guides/releases.md) - Formal release process

## 📝 Configuration Guides

### Core Systems
- [Configuration Overview](./guides/configuration.md) - Complete JSON config reference
- [Development Guide](./guides/development.md) - Development workflow and testing

### Client Setup Guides
- [Textual IRC Client](./guides/clients/textual.md) - Configure monitoring for Textual
- [The Lounge Client](./guides/clients/thelounge.md) - Configure monitoring for The Lounge

### Advanced Features
- [Webhook Payload Transforms](./guides/webhook-transforms.md) - Config-driven webhook customization
- [Host Metadata Overrides](./guides/host-metadata.md) - Event-level server overrides
- [CLI Reference](./guides/cli.md) - Command line interface

## 🏗️ Architecture

- [System Architecture Overview](./architecture/overview.md) - High-level design, components
- [Data Flow](./architecture/data-flow.md) - Message pipeline, phase-by-phase
- [Type System](./architecture/type-system.md) - Complete type specifications

## 🔧 API Reference

### API Server (HTTP Endpoints)
- [Config API](./api-server/config-api.md) - HTTP interface for runtime config management
- [Root Config API](./api-server/root-config.md) - Manage root configuration
- [Data Flow API](./api-server/data-flow.md) - Comprehensive data flow visualization endpoint
- [Logs API](./api-server/logs-api.md) - Log file exploration and reading with chunking/compression
- [Server Architecture](./api-server/server-architecture.md) - API server internal structure
- [API Type Reference](./api-server/type-reference.ts) - TypeScript definitions for API responses

### Core APIs (Internal Utilities)
- [ConfigIO](./core-apis/config-io.md) - Import/export and transcoding utilities
- [FilterEngine](./core-apis/filter-engine.md) - Filter evaluation and matching
- [TemplateEngine](./core-apis/template-engine.md) - Template variable processing

## 📚 Additional Resources

### Development
- [Development Guide](./guides/development.md) - Setup, formatting, contributing
- [Testing Guide](./guides/testing.md) - Test strategies

## 🔍 Quick Reference

### By Topic

**Configuration**
- [Configuration Overview](./guides/configuration.md)
- [CLI Reference](./guides/cli.md)

**Filtering**
- [FilterEngine API](./api/filter-engine.md)

**Setup & Deployment**
- [Installation](./guides/installation.md)
- [Quick Start](./guides/quickstart.md)
- [Releases](./guides/releases.md)

**Development**
- [Development Guide](./guides/development.md)
- [Testing Guide](./guides/testing.md)

**CLI**
- [CLI Reference](./guides/cli.md)

### By User Type

**New Users**
1. [Installation](./guides/installation.md)
2. [Quick Start](./guides/quickstart.md)
3. [Configuration Overview](./guides/configuration.md)
4. [Type System Reference](./architecture/type-system.md)

**Power Users**
1. [Configuration Overview](./guides/configuration.md)
2. [Host Metadata](./guides/host-metadata.md)
3. [CLI Reference](./guides/cli.md)

**Developers**
1. [Development Guide](./guides/development.md)
2. [Architecture Overview](./architecture/overview.md)
3. [Data Flow](./architecture/data-flow.md)
4. [Type System](./architecture/type-system.md)
5. [Testing Guide](./guides/testing.md)

**System Administrators**
1. [Installation](./guides/installation.md)
2. [Configuration](./guides/configuration.md)
3. [Config API](./api/config-api.md)
4. [CLI Reference](./guides/cli.md)

## 📄 Document Status

| Category | Status | Last Updated |
|----------|--------|--------------|
| Getting Started | ✅ Complete | 2025-11-24 |
| Configuration Guides | ✅ Complete | 2025-11-24 |
| Architecture | ✅ Complete | 2025-11-24 |
| API Reference | 🚧 In Progress | 2025-11-24 |
| Examples | 📝 Planned | - |

## 🤝 Contributing to Docs

Found an issue or want to improve the documentation?

1. Check existing docs for similar content
2. Follow the existing documentation style and structure
3. Submit a pull request with your changes

## 📞 Getting Help

- Check relevant guides above
- Search [Issues](https://github.com/hycord/irc-notify/issues)
- Review [Quick Start Guide](./guides/quickstart.md) for common configurations
