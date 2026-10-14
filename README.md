# ti2-events2url

A plugin for TourConnect's ti2 framework that sends events to a specified URL.

## Installation

```bash
npm install ti2-events2url
```

## Usage

```javascript
const Plugin = require('ti2-events2url');
const axios = require('axios');

// Initialize the plugin
const plugin = new Plugin({
  eventsURL: 'http://your-events-endpoint.com',
  axios: axios,
  authorization: 'Bearer your-auth-token', // Optional for eventHandler; required for recordProductCacheSave
  Source: 'your-source-name', // Optional, defaults to 'ti2'
  events2log: 'request.*,response.*' // Optional, defaults to 'request.*'
});

// Fire-and-forget event forwarding
const eventEmitter = getYourEventEmitter();
plugin.eventHandler(eventEmitter);
```

## Configuration

The plugin accepts the following configuration parameters:

| Parameter | Required | Description |
|-----------|----------|-------------|
| eventsURL | Yes | The URL to which events will be sent |
| axios | Yes | An axios instance to use for HTTP requests |
| authorization | No for `eventHandler`; **Yes** for `recordProductCacheSave` | Authorization token included in request headers |
| Source | No | The source name to include in the event payload (defaults to 'ti2') |
| events2log | No | Comma-separated list of event patterns to listen for (defaults to 'request.*') |

## Event Payload

The plugin sends the following payload to the configured URL:

```json
{
  "body": {},
  "event": "event.name",
  "eventTime": "2023-01-01T00:00:00.000Z",
  "source": "ti2"
}
```

## `recordProductCacheSave` (awaitable Filematch RPC)

Use this for TourPlan NX catalog marker recording instead of (not in addition to) wiring `eventHandler` for `bookingsProductSearch:cache:save`. Doing both would double-post the same save to Filematch.

```javascript
const generationId = await plugin.recordProductCacheSave({
  pluginName: 'tourplannx',
  userId: 'company-1',
  hint: 'Desk A',
  forceRefresh: true,
  fullSyncTrigger: 'scheduled', // or 'manual'
  productCount: 4,
  optionCount: 8,
  cacheFingerprint: 'a'.repeat(64),
  cacheSavedAt: 1700000000000,
  cacheVersion: 1700000000000000,
});
```

Behavior:

- **Blocking RPC** — awaits Filematch `/ti2events` and returns `marker.generationId` only when the response is `{ status: 'recorded', marker: { generationId } }`.
- **Requires** `eventsURL`, `axios`, and `authorization`.
- **Timeout / retries** — 30s per attempt, up to 3 attempts, with short backoff. Retries **5xx** and transport failures (Filematch absorbs marker races internally and returns **503** when exhausted). Does **not** retry **4xx** — **409** is a permanent fingerprint conflict for the submitted payload.
- **Worst-case wait** can approach ~90s — call from a path that can wait; do not treat this like fire-and-forget `eventHandler`.
- **Throws** on validation/config errors, size limit, `skipped` Filematch responses, missing `generationId`, or final failure after retries.

## Size Constraints

The plugin has a built-in size constraint of 256KB for the event payload. Oversized payloads are skipped (logged) for `eventHandler`, and cause `recordProductCacheSave` to throw.

## License

MIT
