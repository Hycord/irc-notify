# Development Guide

This guide covers local development standards, code formatting, testing, and contributing conventions.

## Tooling Overview
- **Runtime**: Bun
- **Language**: TypeScript
- **Formatter**: Biome (`biome.json`)
- **Testing**: `bun test`
- **CI**: GitHub Actions (format check + docker build)

## Formatting
Biome enforces consistent style and organizes imports.

### Commands
```bash
bun run format        # Write changes
bun run format:check  # Verify (CI / pre-commit)
```

### Customization
Edit `biome.json` to adjust:
- `lineWidth`
- `indentSize`
- Ignore patterns (`formatter.ignore`)

## Recommended Workflow
```bash
bun install
bun run format:check
bun test
bun start
```

## Pre-Commit Suggestions
Use a local git hook (`.git/hooks/pre-commit`):
```bash
#!/usr/bin/env bash
bun run format:check || { echo "Format issues"; exit 1; }
```

## Release Preparation
Before tagging a release:
1. Ensure formatting passes
2. Update docs and changelog
3. Run full test suite

See [Releases & Versioning](./releases.md).

## Contributing Standards
- Keep docs in sync with code changes
- Prefer small, focused PRs
- Include tests for new features
- Use semantic commit messages if possible (`feat:`, `fix:`, etc.)

## Troubleshooting
**Biome not found**: Ensure dev dependency installed (`bun install`).

**Slow install**: Use Bun cache or run `bun pm cache rm` if corrupted.

**Type errors**: Run `bun run format` then `bun test` to validate after updates.
