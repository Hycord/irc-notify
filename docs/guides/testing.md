# Testing Guide

Comprehensive test suite using Bun's built-in test runner.

Coverage:
- Filter evaluation (AND/OR, nested, regex)
- Template rendering
- Generic client adapter parsing
- Event processing & enrichment
- Sink templating (captured via in-memory test sink)
- Full end-to-end orchestration

Run commands:
```bash
bun test
bun test tests/unit
bun test tests/e2e
```

Test sink (`TestCaptureSink`) records notifications for assertions and is not used in production deployments.

End-to-end tests append lines after watchers start to simulate real-time log growth.

Last updated: 2025-11-24