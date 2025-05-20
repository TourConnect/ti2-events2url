const { limitObjectSize, sizeInKB } = require('limit-object-size');
const OBJECT_SIZE_LIMIT = 256 // in kbytes
const {
  env: {
    NODE_ENV: env,
  },
} = process;

class Plugin {
  constructor(params = {}) {
    Object.entries(params).forEach(([attr, value]) => {
      this[attr] = value;
    });
    return this;
  }

  eventHandler(eventEmmiter) {
    const eventsArr = (this.events2log || 'request.*').split(',');
    const pluginObj = this;
    if (!pluginObj.eventsURL || !pluginObj.axios) {
      console.warn('[ti2-events2url] Missing eventsURL or axios configuration. Not processing events.');
      return;
    }
    eventsArr.forEach(eventName => {
      eventEmmiter.on(eventName, async function (body) {
        const payload = {
          body,
          event: eventName,
          eventTime: new Date().toISOString(),
          source: pluginObj.Source || 'ti2',
        };
        if (sizeInKB(JSON.stringify(payload)) < OBJECT_SIZE_LIMIT) {
          try {
            await pluginObj.axios.post(pluginObj.eventsURL, payload);
          } catch (err) {
            const errorInfo = {
              message: err.message,
              status: err.response && err.response.status,
              statusText: err.response && err.response.statusText,
              url: err.config && err.config.url
            };
            console.error(`[ti2-events2url] Failed to send event to eventURL`, payload, errorInfo);
          }
        } else {
          console.log('[ti2-events2url] unable to send event (size constraint)', payload);
        }
      });
    });
  }
}

module.exports = Plugin;
