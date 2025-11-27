#!/bin/bash
# Test the data flow API endpoint

# Read auth token
TOKEN=$(cat config/auth_token.txt)

if [ -z "$TOKEN" ]; then
  echo "Error: No auth token found in config/auth_token.txt"
  exit 1
fi

echo "Testing /api/data-flow endpoint..."
echo ""

# Make the request and format the output
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/data-flow | bun run --silent -e "
    const data = await Bun.stdin.json();
    
    console.log('✓ Data Flow API Response');
    console.log('=========================');
    console.log('');
    console.log('Timestamp:', data.timestamp);
    console.log('Config Dir:', data.configDirectory);
    console.log('Running:', data.running);
    console.log('');
    console.log('Statistics:');
    console.log('  Clients:', data.stats.enabledClients, '/', data.stats.totalClients);
    console.log('  Servers:', data.stats.enabledServers, '/', data.stats.totalServers);
    console.log('  Events:', data.stats.enabledEvents, '/', data.stats.totalEvents);
    console.log('  Sinks:', data.stats.enabledSinks, '/', data.stats.totalSinks);
    console.log('  Parser Rules:', data.stats.totalParserRules);
    console.log('  Routing Paths:', data.stats.totalRoutingPaths);
    console.log('');
    console.log('Clients:');
    data.clients.forEach(c => {
      console.log('  -', c.id, '(' + c.type + ')', c.enabled ? '✓' : '✗');
      console.log('    Rules:', c.totalParserRules, '(', c.skipRules, 'skip)');
    });
    console.log('');
    console.log('Events:');
    data.events.forEach(e => {
      console.log('  -', e.id, '(priority:', e.priority + ')', e.enabled ? '✓' : '✗');
      console.log('    Base:', e.baseEvent);
      console.log('    Servers:', e.serverIds.join(', '));
      console.log('    Sinks:', e.sinkIds.join(', '));
      if (e.hasFilters) {
        console.log('    Filters: Yes (complexity:', e.filterComplexity + ')');
      }
    });
    console.log('');
    console.log('Sample Routing Paths (first 5):');
    data.routingPaths.slice(0, 5).forEach(p => {
      console.log('  -', p.clientName, '→', p.serverName, '→', p.eventName, '→', p.sinkNames.join(', '));
      if (p.hasFilters && p.filterSummary) {
        console.log('    Filter:', p.filterSummary);
      }
    });
"

echo ""
echo "✓ Test complete"
