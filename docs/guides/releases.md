# Releases & Versioning

This guide documents the formal release process, versioning strategy, and associated automation for IRC Notify.

## Goals
- Deterministic, reproducible builds
- Clear semantic versioning (`MAJOR.MINOR.PATCH`)
- Automated multi-architecture Docker image publishing (`latest`, commit SHA, version tag)
- Mandatory documentation synchronization with each release
- Transparent changelog for users and contributors

## Versioning Strategy
We follow [Semantic Versioning](https://semver.org/):
- **MAJOR**: Breaking changes (config format changes, removed APIs)
- **MINOR**: Backwards-compatible feature additions
- **PATCH**: Bug fixes and internal improvements

Pre-releases can use suffixes (`-rc.1`, `-beta.2`) if needed. These are tagged but not marked `latest` unless explicitly promoted.

## Image Tags
Every successful build on `main` or a version tag publishes:
- `latest`: Most recent stable build from `main` or version tag
- `<commit-sha>`: Immutable content hash reference
- `vX.Y.Z`: Semantic version tag

## Automated Release Workflow (GitHub Actions)
Releases are now fully automated via the `Release` workflow (`.github/workflows/release.yml`). The workflow triggers automatically when you push a version tag.

### How to Release
Simply push a tag with semantic version format:
```bash
git tag v1.2.3
git push origin v1.2.3
```

The workflow will automatically:
1. Extract version from tag (validates format)
2. Detect if prerelease (version contains hyphen like `v1.0.0-rc.1`)
3. Check out the `main` branch
4. Install dependencies
5. Run `bun scripts/prepare-release.ts` to:
   - Update `package.json` version (if needed)
   - Move `[Unreleased]` changes into new `## [version] - YYYY-MM-DD` block in `CHANGELOG.md`
   - Reset `[Unreleased]` section skeleton
   - Update comparison links at bottom of changelog
6. Commit changelog/package.json updates back to `main` branch
7. Run format check (`bun run format:check`)
8. Run tests (`bun test`)
9. Validate configs (`bun run config:validate`)
10. Build the app (`bun run build`)
11. Export config bundle (`bun run config:export`)
12. Build and push multi-arch Docker image with tags:
    - `vX.Y.Z`
    - `<commit-sha>` (12 chars)
    - `latest` (omitted if prerelease)
13. Extract release notes using `bun scripts/extract-changelog.ts`
14. Create GitHub Release (attaches config bundle)

### Manual Steps Before Tagging
You MUST:
1. Ensure ALL documentation (`README.md`, `/docs`) reflects the changes being released
2. Populate `CHANGELOG.md` `[Unreleased]` section with all changes
3. Confirm tests pass locally (`bun test`)
4. Commit all changes to `main`
5. Push to GitHub
6. Then create and push the version tag

### Pre-releases
For pre-release versions, include a hyphen in the tag:
```bash
git tag v1.0.0-rc.1
git push origin v1.0.0-rc.1
```
Pre-releases are automatically detected and will not update the `latest` Docker tag.

## Legacy Manual Workflow (Fallback)
If automation fails and you need a manual release:
1. Create branch: `git checkout -b release/vX.Y.Z`
2. Bump `package.json` version
3. Move `[Unreleased]` contents into new version block + date
4. Update compare links
5. Sync docs, run tests & validation
6. Commit & open PR
7. Tag, push, create GitHub Release manually

## Changelog Conventions
`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) with sections:
- Added
- Changed
- Deprecated
- Removed
- Fixed
- Security

Example entry:
```markdown
## [1.2.0] - 2025-12-01
### Added
- New webhook sink metadata fields
### Fixed
- Parser rule priority inversion (issue #42)
```

## Automation (Build & Image)
The dedicated release workflow handles multi-arch image builds (linux/amd64, linux/arm64). Future enhancements planned:
- SBOM generation (Syft/Anchore)
- Image signing (Cosign)
- Dependency vulnerability scan (Grype)

## Verifying a Release
After tagging:
```bash
# Pull specific version
docker pull ghcr.io/hycord/irc-notify:vX.Y.Z
# Inspect image
docker image inspect ghcr.io/hycord/irc-notify:vX.Y.Z | jq '.[0].RepoTags'
```

Run smoke test:
```bash
docker run --rm ghcr.io/hycord/irc-notify:vX.Y.Z --help
```

## Post-Release Tasks
- Create planning issue for next increment (`vX.Y.(Z+1)`)
- Audit open PRs & issues for milestone assignment
- Mark deprecated items for removal in next MAJOR

## Unreleased Changes Tracking
Maintain an `[Unreleased]` section at top of `CHANGELOG.md`. When releasing, copy its contents into the new version block and reset `[Unreleased]`.

## Breaking Changes Policy
All breaking changes require:
- Explicit entry under `Changed` or `Removed` with migration notes
- Update to any affected guides
- Increment MAJOR version

## Rollback Procedure
1. Identify last known good tag (`vX.Y.(Z-1)`)
2. Create hotfix branch: `hotfix/vX.Y.(Z+1)`
3. Apply fix, bump PATCH, retag
4. Communicate via changelog and release notes

## FAQ
**Why automate changelog updates?** Ensures consistency and reduces human error when moving `[Unreleased]` changes.

**Why tag commit SHA?** Immutable traceability and reproducible historical pulls.

**Why multi-arch?** Supports both server (amd64) and ARM (Apple Silicon / ARM64).

**Can I skip version tags?** No—semantic tags are required for discoverability and Docker provenance.

**Can I edit release notes after creation?** Yes—GitHub Release body can be updated; keep changelog authoritative.

**How do pre-releases differ?** Marked as prerelease, do not publish `latest` tag.

## References
- Semantic Versioning: https://semver.org/
- Keep a Changelog: https://keepachangelog.com/
- Docker Docs: https://docs.docker.com/
