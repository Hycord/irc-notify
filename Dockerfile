FROM oven/bun:latest

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Copy default configuration
COPY config.default.json ./

# Set environment variables
ENV LOG_DIR=/logs

# API server configuration (optional - enable by setting ENABLE_API=true or API_PORT)
ENV ENABLE_API=false
ENV API_PORT=3000
ENV API_HOST=0.0.0.0
# ENV API_TOKEN=    # Set this for authentication

# Create logs directory
RUN mkdir -p /logs

# Expose API port (optional)
EXPOSE 3000

CMD ["bun", "run", "start"] 