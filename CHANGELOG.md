# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.2-rc4] - 2025-11-24

## [1.0.2-rc3] - 2025-11-24

## [1.0.2-rc2] - 2025-11-24

## [1.0.2-rc1] - 2025-11-25

## [1.0.1] - 2025-11-24

## [1.0.0] - 2025-11-24
### Added
- Initial public beta release
- TypeScript-based configuration system with `define*()` helpers for validation
- Strict type system for autocomplete and compile-time validation (`defineStrictEvent`)
- Generic client adapter supporting zero-code IRC client integration
- Support for Textual and TheLounge IRC clients
- Event processing with flexible filter system (AND/OR logic, regex, nested groups)
- Template engine with `{{field.path}}` syntax for notifications
- Multiple notification sinks: Console, Ntfy, Webhook, File
- Rate limiting support for all sinks
- Configuration import/export to compressed JSON bundles
- Automatic backup import on first startup
- Config API server for runtime configuration management
- Auto-generated auth tokens for API security
- File system watcher for automatic config reloading
- CLI commands: validate, export, import, merge, migrate
- Development testing tools (gen-dev, cleanup-dev)
- Multi-architecture Docker images (linux/amd64, linux/arm64)
- Comprehensive documentation system
- GitHub Actions workflow for automated releases
- Biome-based code formatting and linting
- Complete test suite (unit and end-to-end)

### Security
- Auto-generated secure auth tokens (64 hex chars, 32 bytes entropy) stored in `config/auth_token.txt`
- Auth tokens excluded from backups and version control
- File-based auth token with 0600 permissions

[Unreleased]: https://github.com/hycord/irc-notify/compare/v1.0.2-rc4...HEAD
[1.0.2-rc4]: https://github.com/hycord/irc-notify/compare/v1.0.2-rc3...v1.0.2-rc4
[1.0.2-rc3]: https://github.com/hycord/irc-notify/compare/v1.0.2-rc2...v1.0.2-rc3
[1.0.2-rc2]: https://github.com/hycord/irc-notify/compare/v1.0.2-rc1...v1.0.2-rc2
[1.0.2-rc1]: https://github.com/hycord/irc-notify/compare/v1.0.1...v1.0.2-rc1
[1.0.1]: https://github.com/hycord/irc-notify/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/hycord/irc-notify/releases/tag/v1.0.0
