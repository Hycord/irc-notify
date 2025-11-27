# Data Flow Visualization Endpoint

## Summary

Added a new API endpoint `/api/data-flow` that provides a comprehensive, server-side view of how messages flow through the irc-notify system. This endpoint analyzes the currently loaded configuration and returns detailed metadata about all components and their relationships.

## What It Does

The endpoint provides a "server's eye view" of the configuration by:

1. **Analyzing all configuration components:**
   - Client adapters with parser rules
   - Server configurations with user metadata
   - Event configurations with filters
   - Sink configurations with templates

2. **Extracting runtime metadata:**
   - Parser rule priorities and capture fields
   - Filter complexity and template usage
   - Sink rate limits and template fields
   - Event routing and server matching

3. **Generating routing paths:**
   - All possible message flows from clients → servers → events → sinks
   - Includes filter summaries for each path
   - Sorted by event priority (matching runtime behavior)

4. **Providing statistics:**
   - Component counts (total vs enabled)
   - Parser rule counts
   - Filter and template usage
   - Routing path totals

## Use Cases

### 1. Frontend Visualization
The endpoint is designed for frontends to render flowcharts or diagrams without needing to understand the configuration format. All processing is done server-side.

### 2. Configuration Debugging
Helps identify issues like:
- Events with no sinks
- Unreferenced sinks
- Overly complex filters
- Parser rules with high skip rates

### 3. Documentation Generation
Can auto-generate:
- System architecture diagrams
- Event/sink relationship matrices
- Parser rule references
- Configuration documentation

### 4. Performance Analysis
Reveals potential bottlenecks:
- Total parser rules (parsing overhead)
- Filter complexity (matching cost)
- Routing path counts (event evaluation)

## Files Modified

### New Files
- `src/api/routes/data-flow.ts` - Endpoint implementation with analysis logic
- `docs/api/data-flow.md` - Complete API reference documentation
- `scripts/test-data-flow-api.sh` - Test script for manual verification

### Modified Files
- `src/api/routes/index.ts` - Added export for data flow handler
- `src/api/server.ts` - Added route mapping for `/api/data-flow`
- `src/index.ts` - Added getter methods for config arrays
- `docs/api/config-api.md` - Added data flow endpoint to API list
- `docs/README.md` - Added link to data flow API docs
- `docs/TABLE_OF_CONTENTS.md` - Added data flow API to TOC

## Key Features

### 1. Comprehensive Analysis
Every component is analyzed and enriched with metadata:
- **Parser Rules**: Extracted capture fields, priority, skip status
- **Filters**: Detected template usage, calculated complexity, targeted fields
- **Sinks**: Template field extraction, rate limit detection
- **Events**: Server matching type, filter analysis, metadata template detection

### 2. Routing Path Generation
Generates all possible message flows by:
1. Finding enabled events
2. Determining applicable servers (respecting wildcards)
3. Matching with enabled clients
4. Creating client → server → event → sinks paths
5. Sorting by priority (matches runtime order)

### 3. Template Detection
Recursively scans for `{{...}}` patterns in:
- Filter values
- Event metadata
- Sink templates
Returns extracted field references (e.g., `sender.nickname`)

### 4. Filter Complexity Calculation
Computes complexity score based on:
- Nesting depth
- Number of conditions
- Boolean operators
Helps identify performance bottlenecks

### 5. Human-Readable Summaries
Generates filter summaries like:
```
(message.content contains "alert" AND sender.nickname matches "^bot.*")
```

## Response Structure

```typescript
{
  timestamp: string;              // When snapshot was generated
  configDirectory: string;        // Config directory path
  running: boolean;               // Orchestrator status
  stats: DataFlowStats;           // Aggregate statistics
  clients: DataFlowClient[];      // Analyzed client configs
  servers: DataFlowServer[];      // Analyzed server configs
  sinks: DataFlowSink[];          // Analyzed sink configs
  events: DataFlowEvent[];        // Analyzed event configs
  routingPaths: DataFlowRoutingPath[];  // All possible flows
  messageTypeMapping: object;     // Base event type mappings
}
```

All types are fully documented in `docs/api/data-flow.md`.

## API Integration

### Endpoint Details
- **Method**: GET
- **Path**: `/api/data-flow`
- **Auth**: Bearer token required
- **Response**: JSON object

### Usage Example
```bash
TOKEN=$(cat config/auth_token.txt)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/data-flow | jq .
```

### Test Script
```bash
# Run the included test script
./scripts/test-data-flow-api.sh
```

## Implementation Notes

### Server Matching Logic
Replicates the logic from `EventProcessor.enrichContext()`:
1. Match by hostname (exact)
2. Match by displayName (case-insensitive)
3. Match by ID (case-insensitive)
4. Match by displayName prefix
5. Match by ID substring

### Priority Handling
- Parser rules: Higher priority checked first
- Events: Higher priority checked first
- Routing paths: Sorted by event priority

### Disabled Components
- Included in totals
- Included in routing paths (each path has `enabled` flag)
- Individual components marked with `enabled: false` when disabled
- Filter paths by `enabled: true` for active-only views

### Performance Considerations
- Response can be large for complex configs
- All processing is done on-demand (no caching)
- Reflects currently loaded config (not files on disk)

## Documentation

Complete documentation available at:
- API Reference: `docs/api/data-flow.md`
- Config API: `docs/api/config-api.md`
- Table of Contents: `docs/TABLE_OF_CONTENTS.md`

## Testing

The endpoint can be tested by:
1. Starting the server with API enabled
2. Running `./scripts/test-data-flow-api.sh`
3. Or making manual curl requests

Expected response includes:
- System statistics
- All component details
- Complete routing paths
- Filter and template analysis

## Future Enhancements

Potential improvements:
- Pagination for large configs
- Filtering by component type
- Response caching
- Diff endpoint (compare configs)
- GraphQL support for selective queries
- Export to visualization formats (Mermaid, DOT)

## Compliance

✅ All code changes documented
✅ API reference created
✅ Table of contents updated
✅ Main README updated
✅ Test script provided
✅ TypeScript compilation verified
✅ Follows existing patterns
✅ No hardcoded business logic
