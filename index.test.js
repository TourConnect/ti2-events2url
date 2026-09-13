const Plugin = require('./index');

// Mock dependencies
jest.mock('limit-object-size', () => ({
  sizeInKB: jest.fn(() => 100),
}));

// Mock axios
const mockAxiosPost = jest.fn();

const mockEventEmitter = {
  on: jest.fn((eventName, callback) => {
    callback({}); // Simulate an event callback
  }),
};

describe('Plugin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('constructor initializes properties correctly', () => {
    const params = { 
      Source: 'testSource', 
      eventsURL: 'http://example.com',
      authorization: 'Bearer token123'
    };
    const plugin = new Plugin(params);
    expect(plugin.Source).toBe(params.Source);
    expect(plugin.eventsURL).toBe(params.eventsURL);
    expect(plugin.authorization).toBe(params.authorization);
  });

  test('eventHandler sets up listeners and handles payload size constraints', async () => {
    const plugin = new Plugin({ 
      eventsURL: 'http://example.com', 
      axios: { post: mockAxiosPost },
      authorization: 'Bearer token123'
    });
    plugin.eventHandler(mockEventEmitter);

    expect(mockEventEmitter.on).toHaveBeenCalledWith('request.*', expect.any(Function));
    expect(mockAxiosPost).toHaveBeenCalled();
    expect(mockAxiosPost.mock.calls[0][2]).toEqual({
      headers: {
        Authorization: 'Bearer token123'
      }
    });
  });

  test('eventHandler does not process events if eventsURL or axios is missing', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Test missing axios
    const pluginWithoutAxios = new Plugin({ 
      eventsURL: 'http://example.com',
      authorization: 'Bearer token123' 
    });
    pluginWithoutAxios.eventHandler(mockEventEmitter);

    expect(consoleWarnSpy).toHaveBeenCalledWith('[ti2-events2url] Missing eventsURL or axios configuration. Not processing events.');
    expect(mockEventEmitter.on).not.toHaveBeenCalled();

    consoleWarnSpy.mockClear();

    // Test missing eventsURL
    const pluginWithoutEventsURL = new Plugin({ 
      axios: { post: mockAxiosPost },
      authorization: 'Bearer token123'
    });
    pluginWithoutEventsURL.eventHandler(mockEventEmitter);
    expect(consoleWarnSpy).toHaveBeenCalledWith('[ti2-events2url] Missing eventsURL or axios configuration. Not processing events.');
    expect(mockEventEmitter.on).not.toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  test('eventHandler works without authorization parameter', async () => {
    const plugin = new Plugin({ 
      eventsURL: 'http://example.com', 
      axios: { post: mockAxiosPost }
    });
    plugin.eventHandler(mockEventEmitter);

    expect(mockEventEmitter.on).toHaveBeenCalledWith('request.*', expect.any(Function));
    expect(mockAxiosPost).toHaveBeenCalled();
    // Verify no authorization header was sent
    expect(mockAxiosPost.mock.calls[0][2]).toEqual({
      headers: {}
    });
  });

  test('redacts admission tokens from general event requests and failed-delivery logs', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const axios = { post: jest.fn().mockRejectedValue(new Error('network failed')) };
    let handler;
    const eventEmitter = {
      on: jest.fn((_eventName, callback) => {
        handler = callback;
      }),
    };
    const plugin = new Plugin({
      eventsURL: 'http://example.com',
      axios,
    });
    plugin.eventHandler(eventEmitter);

    await handler({
      fullSyncAdmissionToken: 'reservation-owner',
      requestedAt: new Date('2026-09-12T12:00:00.000Z'),
    });

    expect(axios.post.mock.calls[0][1].body.fullSyncAdmissionToken)
      .toBe('[REDACTED]');
    expect(axios.post.mock.calls[0][1].body.requestedAt)
      .toBe('2026-09-12T12:00:00.000Z');
    expect(consoleErrorSpy.mock.calls[0][1].body.fullSyncAdmissionToken)
      .toBe('[REDACTED]');
    consoleErrorSpy.mockRestore();
  });

  test('preserves the admission token only for the trusted product cache-save event', async () => {
    const axios = { post: jest.fn().mockResolvedValue({}) };
    let handler;
    const eventEmitter = {
      on: jest.fn((_eventName, callback) => {
        handler = callback;
      }),
    };
    const plugin = new Plugin({
      events2log: 'bookingsProductSearch:cache:save',
      eventsURL: 'http://example.com',
      axios,
    });
    plugin.eventHandler(eventEmitter);

    await handler({ fullSyncAdmissionToken: 'reservation-owner' });

    expect(axios.post.mock.calls[0][1].body.fullSyncAdmissionToken)
      .toBe('reservation-owner');
  });
});
