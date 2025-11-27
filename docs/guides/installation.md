# Installation & Setup

This guide covers installing and setting up IRC Notify.

## Prerequisites

### Required
- **Bun** v1.0 or higher ([installation guide](https://bun.sh/docs/installation))
- IRC client logs (Textual, TheLounge, or similar)
- Basic TypeScript/JSON knowledge

### Optional
- Docker (for containerized deployment)
- Git (for version control)

## Installation Methods

### Method 1: Docker (Recommended)

Container deployment isolates runtime, provides reproducible builds, and auto-publishes versioned images (`latest`, commit SHA, and semantic version tags) via GitHub Actions.

1. Pull prebuilt image (preferred):
   ```bash
   docker pull ghcr.io/hycord/irc-notify:latest
   # Or a specific version
   docker pull ghcr.io/hycord/irc-notify:v1.0.0
   ```

2. Prepare host directories:
   ```bash
   mkdir -p config logs
   cp config.example.json config.json  # Adjust as needed
   ```

3. Run the container:
   ```bash
   docker run -it --rm \
     -v $(pwd)/logs:/logs:ro \
     -v $(pwd)/config:/app/config:ro \
     ghcr.io/hycord/irc-notify:latest
   ```

4. (Optional) Enable Config API:
   ```bash
   docker run -it --rm \
     -v $(pwd)/logs:/logs:ro \
     -v $(pwd)/config:/app/config:ro \
     -e ENABLE_API=true \
     -e API_PORT=3000 \
     -e API_TOKEN=your-secret-token \
     -p 3000:3000 \
     ghcr.io/hycord/irc-notify:latest
   ```

5. (Optional) Override config path:
   ```bash
   docker run -e CONFIG_PATH=/app/config/config.json ...
   ```

### Method 2: Direct Install

1. **Clone the repository**
   ```bash
   git clone https://github.com/hycord/irc-notify.git
   cd irc-notify
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Create configuration**
   
   **Option A: Auto-import from backup**
   ```bash
   # Place backup in backups directory
   mkdir -p backups
   cp /path/to/config-export-*.json.gz backups/
   
   # On first startup, the most recent backup will be auto-imported
   bun start
   ```
   
   **Option B: Manual setup**
   ```bash
   # Config directories are created automatically on startup
   # But you can create them manually if needed
   mkdir -p config/clients config/servers config/events config/sinks
   
   # Create your config files (see Quick Start Guide)
   ```

4. **Verify installation**
   ```bash
   bun run config:validate
   ```

### Method 3: Build Docker Image Locally

1. **Build the image**
   ```bash
   docker build -t irc-notify .
   ```

2. **Run the container**
   ```bash
   docker run -it --rm \
     -v $(pwd)/logs:/logs:ro \
     -v $(pwd)/config:/app/config:ro \
     irc-notify
   ```

3. **(Optional) Run with Config API**
   ```bash
   docker run -it --rm \
     -v $(pwd)/logs:/logs:ro \
     -v $(pwd)/config:/app/config:ro \
     -e ENABLE_API=true \
     -e API_PORT=3000 \
     -e API_TOKEN=your-secret-token \
     -p 3000:3000 \
     irc-notify
   ```

## Directory Setup

Create the following directory structure:

```
irc-notify/
├── config/
│   ├── config.json            # Main config (auto-discovers by default)
│   ├── clients/
│   │   └── textual.json       # Example client
│   ├── servers/
│   │   └── libera.json        # Example server
│   ├── events/
│   │   └── phrase-alert.json  # Example event
│   └── sinks/
│       ├── console.json       # Console output
│       └── ntfy.json          # Ntfy notifications
└── logs/                      # Your IRC logs
    └── textual/               # Client-specific structure
```

## Configuration Files

### Minimal Configuration

Create `config/config.json`:

```json
{
  "global": {
    "pollInterval": 1000,
    "debug": false,
    "defaultLogDirectory": "./logs",
    "rescanLogsOnStartup": false
  }
}
```

**Note:** This file is optional! Configs are automatically discovered from their respective directories (`clients/`, `servers/`, `events/`, `sinks/`).

See [Configuration Overview](./configuration.md) for complete reference.

## Verify Setup

1. **Check configuration validity**
   ```bash
   bun run config:validate
   ```

2. **Test log discovery**
   ```bash
   bun start
   # Should show discovered log files
   ```

3. **Run in debug mode**
   ```bash
   # Edit config/config.json and set debug: true
   bun start
   ```

## Next Steps

- [Quick Start Guide](./quickstart.md) - Create your first event
- [Configuration Overview](./configuration.md) - Learn config structure and all config types
- [Type System Reference](../architecture/type-system.md) - Complete type specifications

## Troubleshooting

### Bun not found
```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash
```

### Config validation fails
- Check JSON syntax in config files
- Ensure all referenced IDs exist
- Validate regex patterns are properly escaped

### No log files discovered
- Verify `logDirectory` path is correct
- Check discovery patterns match your log structure
- Enable debug mode to see discovery process

### Permission errors
- Ensure read access to log directories
- Check write access for output directories (if using file sink)

## Upgrading

```bash
# Pull latest changes
git pull origin main

# Update dependencies
bun install

# Validate
bun run config:validate
```

## Uninstallation

```bash
# Stop any running instances
# Remove the directory
cd .. && rm -rf irc-notify
```
