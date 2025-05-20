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
    const params = { Source: 'testSource', eventsURL: 'http://example.com' };
    const plugin = new Plugin(params);
    expect(plugin.Source).toBe(params.Source);
    expect(plugin.eventsURL).toBe(params.eventsURL);
  });

  test('eventHandler sets up listeners and handles payload size constraints', async () => {
    const plugin = new Plugin({ eventsURL: 'http://example.com', axios: { post: mockAxiosPost } });
    plugin.eventHandler(mockEventEmitter);

    expect(mockEventEmitter.on).toHaveBeenCalledWith('request.*', expect.any(Function));
    expect(mockAxiosPost).toHaveBeenCalled();
  });

  test('eventHandler does not process events if eventsURL or axios is missing', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const pluginWithoutAxios = new Plugin({ eventsURL: 'http://example.com' });
    pluginWithoutAxios.eventHandler(mockEventEmitter);

    expect(consoleWarnSpy).toHaveBeenCalledWith('[ti2-events2url] Missing eventsURL or axios configuration. Not processing events.');
    expect(mockEventEmitter.on).not.toHaveBeenCalled();

    consoleWarnSpy.mockClear();

    const pluginWithoutEventsURL = new Plugin({ axios: { post: mockAxiosPost } });
    pluginWithoutEventsURL.eventHandler(mockEventEmitter);
    expect(consoleWarnSpy).toHaveBeenCalledWith('[ti2-events2url] Missing eventsURL or axios configuration. Not processing events.');
    expect(mockEventEmitter.on).not.toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });
});
