# Deployment Guide

This guide covers deploying IRC Notify in production environments.

## Docker Deployment (Recommended)

### Quick Start

```bash
# Pull the latest image
docker pull ghcr.io/hycord/irc-notify:latest

# Create directories
mkdir -p config logs backups

# Run with volume mounts
docker run -d \
  --name irc-notify \
  --restart unless-stopped \
  -v $(pwd)/logs:/logs:ro \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/backups:/app/backups \
  ghcr.io/hycord/irc-notify:latest
```

### Docker Compose (Recommended)

Copy `docker-compose.example.yml` to `docker-compose.yml` and customize:

```bash
cp docker-compose.example.yml docker-compose.yml
# Edit docker-compose.yml as needed
docker-compose up -d
```

### With Config API

Enable the HTTP API for remote management:

```bash
docker run -d \
  --name irc-notify \
  --restart unless-stopped \
  -v $(pwd)/logs:/logs:ro \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/backups:/app/backups \
  -e ENABLE_API=true \
  -e API_PORT=3000 \
  -p 3000:3000 \
  ghcr.io/hycord/irc-notify:latest

# Get your auth token
docker exec irc-notify cat /app/config/auth_token.txt
```

### Version Pinning

Use specific versions for production:

```bash
# Use latest stable
docker pull ghcr.io/hycord/irc-notify:latest

# Or pin to specific version
docker pull ghcr.io/hycord/irc-notify:v1.0.0
```

## Configuration Setup

### Initial Setup with Backup

If you have an existing backup:

```bash
# Place backup in backups directory
cp config-export-2025-11-26.json.gz backups/

# Start container - backup will be auto-imported
docker-compose up -d
```

### Manual Configuration

Create configuration structure:

```
config/
  config.json
  clients/
    textual.json      # or thelounge.json
  servers/
    libera.json
  events/
    phrase-alert.json
  sinks/
    ntfy.json
```

See [Configuration Guide](../guides/configuration.md) for details.

## Volume Mounts

### Required Mounts

```yaml
volumes:
  # IRC client logs (read-only for security)
  - ./logs:/logs:ro
  
  # Configuration files (read-write)
  - ./config:/app/config
  
  # Backups directory (read-write)
  - ./backups:/app/backups
```

### Log Directory Structure

Match your IRC client's log structure:

**Textual:**
```
logs/textual/
  ServerName (UUID)/
    Channels/
    Queries/
    Console/
```

**The Lounge:**
```
logs/thelounge/
  users/admin.json
  logs/admin/
    network-name/
      #channel.log
```

## Environment Variables

```bash
# API Configuration
ENABLE_API=true          # Enable HTTP API
API_PORT=3000           # API port
API_HOST=0.0.0.0        # API host
API_TOKEN=custom-token  # Override auto-generated token (not recommended)

# Logging
LOG_DIR=/logs           # Log directory path

# Debug
DEBUG=false             # Enable debug logging
```

## Security Considerations

### API Authentication

- Auth token auto-generated on first run
- Stored in `config/auth_token.txt`
- Not included in config exports
- Rotate regularly in production

```bash
# Generate new token
docker exec irc-notify rm /app/config/auth_token.txt
docker restart irc-notify
docker exec irc-notify cat /app/config/auth_token.txt
```

### File Permissions

```bash
# Lock down sensitive files
chmod 600 config/auth_token.txt
chmod 600 config/config.json

# Read-only logs
chmod -R a-w logs/
```

### Firewall

If exposing API publicly:

```bash
# Allow only from specific IP
ufw allow from 192.168.1.0/24 to any port 3000

# Or use reverse proxy (recommended)
```

## Reverse Proxy Setup

### Nginx

```nginx
server {
    listen 80;
    server_name notify.example.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Authorization $http_authorization;
    }
}
```

### Traefik (Docker)

```yaml
services:
  irc-notify:
    image: ghcr.io/hycord/irc-notify:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.irc-notify.rule=Host(`notify.example.com`)"
      - "traefik.http.services.irc-notify.loadbalancer.server.port=3000"
```

## Monitoring

### Health Checks

```bash
# Docker healthcheck
curl -f http://localhost:3000/api/health

# In docker-compose.yml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

### Logs

```bash
# View logs
docker logs irc-notify

# Follow logs
docker logs -f irc-notify

# Debug mode
docker run -e DEBUG=true ...
```

### Metrics

Check system status via API:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/status
```

## Backup and Recovery

### Automated Backups

```bash
# Create backup script
#!/bin/bash
DATE=$(date +%Y-%m-%d)
docker exec irc-notify bun src/cli.ts export -o /app/backups/backup-$DATE.json.gz

# Add to crontab
0 2 * * * /path/to/backup.sh
```

### Manual Backup

```bash
# Export config
docker exec irc-notify bun src/cli.ts export -o /app/backups/backup.json.gz

# Copy from container
docker cp irc-notify:/app/backups/backup.json.gz ./
```

### Restore

```bash
# Copy backup to backups directory
cp backup.json.gz backups/

# Import (replace mode)
docker exec irc-notify bun src/cli.ts import -i /app/backups/backup.json.gz

# Or merge mode
docker exec irc-notify bun src/cli.ts merge -i /app/backups/backup.json.gz
```

## Updates

### Update to Latest

```bash
# Pull new image
docker-compose pull

# Restart with new image
docker-compose up -d
```

### Version-Specific Update

```bash
# Update docker-compose.yml
image: ghcr.io/hycord/irc-notify:v1.0.1

# Pull and restart
docker-compose pull
docker-compose up -d
```

### Rollback

```bash
# Change to previous version
image: ghcr.io/hycord/irc-notify:v1.0.0

# Restart
docker-compose up -d
```

## Troubleshooting

### No Messages Detected

1. Verify log directory mount
2. Check client config `logDirectory` path
3. Enable debug mode: `DEBUG=true`
4. Verify file permissions

```bash
# Check if container can read logs
docker exec irc-notify ls -la /logs
```

### API Not Working

1. Verify `ENABLE_API=true`
2. Check port mapping in docker-compose
3. Verify auth token

```bash
# Test locally
docker exec irc-notify curl http://localhost:3000/api/health

# Get token
docker exec irc-notify cat /app/config/auth_token.txt
```

### Config Not Loading

1. Validate config syntax

```bash
docker exec irc-notify bun run config:validate
```

2. Check container logs

```bash
docker logs irc-notify
```

### High CPU/Memory

1. Check poll interval (increase if too frequent)
2. Reduce debug logging
3. Check for filter performance issues

```json
{
  "global": {
    "pollInterval": 2000,
    "debug": false
  }
}
```

## Production Checklist

- [ ] Use specific version tag (not `latest`)
- [ ] Enable API with authentication
- [ ] Set up automated backups
- [ ] Configure log rotation
- [ ] Set up monitoring/health checks
- [ ] Use reverse proxy with HTTPS
- [ ] Restrict API access by IP/firewall
- [ ] Test backup/restore procedure
- [ ] Document custom configurations
- [ ] Set up log aggregation (optional)
- [ ] Configure rate limits per sink
- [ ] Test notification delivery

## Support

- [GitHub Issues](https://github.com/hycord/irc-notify/issues)
- [Documentation](../README.md)
- [Configuration Guide](../guides/configuration.md)
