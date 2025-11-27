# API Server Architecture

The Config API server has been refactored into a modular architecture with separate route handlers for better maintainability and clarity.

## Directory Structure

```
src/api/
├── server.ts          # Main server class and request routing
├── types.ts           # Internal API server types
├── utils.ts           # Shared utilities (json(), safePath(), isAuthenticated())
└── routes/            # Individual route handlers
    ├── index.ts       # Route registry (exports all handlers)
    ├── health.ts      # GET /api/health
    ├── status.ts      # GET /api/status
    ├── data-flow.ts   # GET /api/data-flow
    ├── root-config.ts # GET/PUT /api/config
    ├── reload.ts      # POST /api/config/reload
    ├── export.ts      # GET /api/config/export
    ├── upload.ts      # POST /api/config/upload
    ├── files.ts       # GET /api/config/files
    └── file-ops.ts    # GET/PUT/DELETE /api/config/file/<category>/<name>
```

## Core Components

### Server Class (`server.ts`)

The `ConfigApiServer` class handles:
- Server initialization and configuration
- Authentication setup
- Request routing to appropriate handlers
- Config directory watching
- Server lifecycle (start/stop)

### Route Context (`types.ts`)

All route handlers receive a `RouteContext` object containing:
```typescript
interface RouteContext {
  orchestrator: IRCNotifyOrchestrator;  // Access to config and state
  enableFileOps: boolean;               // Whether file operations are allowed
  authToken?: string;                   // Auth token for validation
}
```

### Route Handlers (`routes/*.ts`)

Each route handler is a simple function with the signature:
```typescript
type RouteHandler = (
  req: Request,
  context: RouteContext
) => Promise<Response> | Response;
```

Handlers are pure functions that:
- Receive the HTTP request and shared context
- Perform their specific operation
- Return a Response object
- Have no side effects beyond their documented purpose

### Utilities (`utils.ts`)

Shared utility functions:
- `json()` - Creates JSON responses with proper headers
- `safePath()` - Prevents path traversal attacks
- `isAuthenticated()` - Validates bearer token authentication

## Adding a New Route

1. Create a new file in `src/api/routes/` (e.g., `my-route.ts`)
2. Export a handler function following the `RouteHandler` signature
3. Add exports to `src/api/routes/index.ts`
4. Add routing logic to `server.ts` in the `fetch` handler
5. Update `docs/api-server/type-reference.ts` with response types
6. Document the endpoint in `docs/api-server/config-api.md`

Example:
```typescript
// src/api/routes/my-route.ts
import type { RouteHandler } from "../types";
import { json } from "../utils";

export const myRouteHandler: RouteHandler = async (req, context) => {
  // Implementation
  return json({ status: 200 }, { result: "success" });
};
```

## Type Safety

The API adheres to types defined in `docs/api-server/type-reference.ts`:
- All response structures are documented
- Handlers return data matching the documented schemas
- TypeScript interfaces ensure compile-time validation

## Request Flow

1. Request arrives at `ConfigApiServer.fetch()`
2. Authentication check via `isAuthenticated()`
3. URL pattern matching determines handler
4. Request and `RouteContext` passed to handler
5. Handler returns `Response` object
6. Response sent to client

## Error Handling

All handlers follow a consistent error pattern:
```typescript
return json({ status: 4xx/5xx }, { error: "description" });
```

Common status codes:
- `400` - Bad request (invalid input)
- `401` - Unauthorized (auth failed)
- `403` - Forbidden (access denied)
- `404` - Not found
- `405` - Method not allowed
- `500` - Internal server error

## Testing

When testing new routes:
1. Verify authentication enforcement
2. Test success and error paths
3. Validate response matches type-reference schema
4. Check that context is properly utilized
5. Test with both `.ts` and `.json` configs (where applicable)

## Best Practices

- **Single Responsibility**: Each handler does one thing
- **Pure Functions**: Handlers have no hidden side effects
- **Type Safety**: Response types match documentation
- **Error Context**: Error messages should be actionable
- **Documentation**: Update all docs when adding/changing routes
- **Consistency**: Follow existing patterns and conventions
