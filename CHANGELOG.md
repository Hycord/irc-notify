# Changelog

All notable changes to IRC Notify will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-26

### Initial Release

The first stable release of IRC Notify - a TypeScript-based IRC notification system.

### Added

#### Core Features
- **Configuration-driven architecture**: 100% behavior defined in JSON config files
- **Auto-discovery**: Automatically discovers configs from directories
- **Generic client adapter**: Support for any IRC client via config-only setup
- **Powerful filtering system**: AND/OR logic, regex matching, field-based filters
- **Template engine**: Custom notification text using `{{field.path}}` syntax
- **Rate limiting**: Per-sink rate limits (per-minute and per-hour)
- **Environment variables**: Support via `${VAR}` or `${VAR:-default}` syntax

#### IRC Clients (Configuration-Driven)
Clients are discovered and configured dynamically via JSON — no hardcoded logic.

New clients can be added by providing a `config/clients/<id>.json` file with parser rules; no code changes required.

#### Notification Sinks (Configuration-Driven)
Sinks are instantiated from configuration at runtime; behavior and routing are defined in JSON. 
Additional sinks can be enabled by adding `config/sinks/<id>.json` and (if needed) registering sink types; routing is driven entirely by event configs.

#### Configuration Management
- **Import/Export**: Bundle configs to compressed `.json.gz` files
- **Merge functionality**: Intelligently merge config bundles
- **Comprehensive validation**: Detailed error messages for invalid configs
- **CLI tools**: Validate, export, import, merge configurations
- **Auto-backup import**: Automatically imports most recent backup on first startup

#### API Server
- **Config API**: HTTP interface for runtime configuration management
- **Root Config API**: Manage main configuration
- **Data Flow API**: Comprehensive data flow visualization
- **Logs API**: Log file exploration with chunking and compression
- **Auto-generated auth tokens**: Secure random tokens stored in `config/auth_token.txt`
- **Hot-reload**: Configuration changes automatically reload the system

#### Documentation
- Complete architecture documentation
- Client setup guides (Textual, The Lounge)
- Configuration reference
- API documentation
- CLI reference
- Development guide
- Testing guide

#### Docker Support
- Multi-architecture images (amd64, arm64)
- GitHub Container Registry hosting
- Docker Compose example
- Version tagging (latest, semver)
- Automatic directory creation

#### Development Tools
- Generate test data with `dev:gen`
- Cleanup dev configs with `dev:cleanup`
- Comprehensive test fixtures
- Debug logging mode

### Technical Details

#### Architecture
- 4-layer pipeline: Clients → Events → Sinks → Orchestrator
- Priority-sorted parser rules (higher = checked first)
- Message context enrichment with server/user metadata
- Extensible sink factory pattern
- Type-safe configuration system

#### Runtime
- **Bun runtime**: Fast, modern JavaScript runtime
- **TypeScript**: Full type safety
- **Zero dependencies**: Minimal external dependencies
- **Cross-platform**: macOS, Linux, Windows

### Configuration Format
- **JSON only**: Simple, portable configuration files
- **No build step**: Direct editing without compilation
- **Validation at load time**: Comprehensive error checking

### Known Limitations
- Config changes require restart when not using Config API
- File polling only (no inotify/fsevents yet)
- Single log directory per client (configurable)

### Migration Notes
This is the first stable release. Previous development versions used TypeScript configs - these are no longer supported. All configurations must be in JSON format.

---

[1.0.0]: https://github.com/hycord/irc-notify/releases/tag/v1.0.0
