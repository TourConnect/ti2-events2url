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
});
