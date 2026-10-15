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

  describe('recordProductCacheSave', () => {
    const body = {
      pluginName: 'tourplannx',
      userId: 'company-1',
      hint: 'Desk A',
      forceRefresh: true,
      fullSyncTrigger: 'scheduled',
      productCount: 4,
      optionCount: 8,
      cacheFingerprint: 'a'.repeat(64),
      cacheSavedAt: 1700000000000,
      cacheVersion: 1700000000000000,
    };

    test('awaits Filematch recording and returns the generation id', async () => {
      const axios = {
        post: jest.fn().mockResolvedValue({
          data: { status: 'recorded', marker: { generationId: 'catalog-generation' } },
        }),
      };
      const plugin = new Plugin({
        eventsURL: 'http://filematch/ti2events',
        authorization: 'Bearer service-token',
        axios,
      });

      await expect(plugin.recordProductCacheSave(body)).resolves.toBe('catalog-generation');
      expect(axios.post).toHaveBeenCalledWith(
        'http://filematch/ti2events',
        expect.objectContaining({
          event: 'bookingsProductSearch:cache:save',
          body,
          source: 'ti2',
        }),
        expect.objectContaining({
          headers: { Authorization: 'Bearer service-token' },
          timeout: 30000,
        }),
      );
    });

    test('retries transient 5xx failures', async () => {
      jest.useFakeTimers();
      try {
        const axios = {
          post: jest.fn()
            .mockRejectedValueOnce({ response: { status: 503 } })
            .mockRejectedValueOnce({ response: { status: 502 } })
            .mockResolvedValueOnce({
              data: { status: 'recorded', marker: { generationId: 'retry-generation' } },
            }),
        };
        const plugin = new Plugin({
          eventsURL: 'http://filematch/ti2events',
          authorization: 'Bearer service-token',
          axios,
        });

        const resultPromise = plugin.recordProductCacheSave(body);
        await jest.runAllTimersAsync();
        await expect(resultPromise).resolves.toBe('retry-generation');
        expect(axios.post).toHaveBeenCalledTimes(3);
      } finally {
        jest.useRealTimers();
      }
    });

    test.each([400, 409, 412])('does not retry HTTP %s', async status => {
      const error = { response: { status } };
      const axios = { post: jest.fn().mockRejectedValue(error) };
      const plugin = new Plugin({
        eventsURL: 'http://filematch/ti2events',
        authorization: 'Bearer service-token',
        axios,
      });

      await expect(plugin.recordProductCacheSave(body)).rejects.toBe(error);
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    test('rejects skipped Filematch responses', async () => {
      const axios = {
        post: jest.fn().mockResolvedValue({ data: { status: 'skipped', reason: 'already_running' } }),
      };
      const plugin = new Plugin({
        eventsURL: 'http://filematch/ti2events',
        authorization: 'Bearer service-token',
        axios,
      });

      await expect(plugin.recordProductCacheSave(body))
        .rejects.toThrow('Filematch did not accept TourPlan sync metadata recording');
    });

    test('rejects recorded responses without a generation id', async () => {
      const axios = {
        post: jest.fn().mockResolvedValue({ data: { status: 'recorded', marker: {} } }),
      };
      const plugin = new Plugin({
        eventsURL: 'http://filematch/ti2events',
        authorization: 'Bearer service-token',
        axios,
      });

      await expect(plugin.recordProductCacheSave(body))
        .rejects.toThrow('Filematch did not return a generation id');
    });

    test('rejects oversized payloads', async () => {
      const { sizeInKB } = require('limit-object-size');
      sizeInKB.mockReturnValueOnce(256);
      const axios = { post: jest.fn() };
      const plugin = new Plugin({
        eventsURL: 'http://filematch/ti2events',
        authorization: 'Bearer service-token',
        axios,
      });

      await expect(plugin.recordProductCacheSave(body))
        .rejects.toThrow('cannot record product cache save (size constraint)');
      expect(axios.post).not.toHaveBeenCalled();
    });

    test('requires eventsURL, axios, and authorization', async () => {
      await expect(new Plugin({}).recordProductCacheSave(body))
        .rejects.toThrow('requires eventsURL and axios');
      await expect(new Plugin({
        eventsURL: 'http://filematch/ti2events',
        axios: { post: jest.fn() },
      }).recordProductCacheSave(body)).rejects.toThrow('requires authorization');
    });
  });
});
