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
  authorization: 'Bearer your-auth-token', // Optional authorization token
  Source: 'your-source-name', // Optional, defaults to 'ti2'
  events2log: 'request.*,response.*' // Optional, defaults to 'request.*'
});

// Use with an event emitter
const eventEmitter = getYourEventEmitter();
plugin.eventHandler(eventEmitter);
```

## Configuration

The plugin accepts the following configuration parameters:

| Parameter | Required | Description |
|-----------|----------|-------------|
| eventsURL | Yes | The URL to which events will be sent |
| axios | Yes | An axios instance to use for HTTP requests |
| authorization | No | Authorization token to include in the request headers (if needed) |
| Source | No | The source name to include in the event payload (defaults to 'ti2') |
| events2log | No | Comma-separated list of event patterns to listen for (defaults to 'request.*') |

## Event Payload

The plugin sends the following payload to the configured URL:

```json
{
  "body": {}, // The event data
  "event": "event.name", // The name of the event
  "eventTime": "2023-01-01T00:00:00.000Z", // ISO timestamp
  "source": "ti2" // Or custom source if configured
}
```

## Size Constraints

The plugin has a built-in size constraint of 256KB for the event payload. If the payload exceeds this size, the event will not be sent and a message will be logged to the console.

## License

MIT

