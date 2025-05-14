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
    eventsArr.forEach(eventName => {
      eventEmmiter.on(eventName, async function (body) {
        const events = {
          Entries: [{
            Detail: JSON.stringify(limitObjectSize({
              env,
              ...body,
            }, (OBJECT_SIZE_LIMIT - 75))),
            DetailType: this.event,
            Source: pluginObj.Source || 'ti2',
          }],
        };
        if (sizeInKB(JSON.stringify(events)) < OBJECT_SIZE_LIMIT) {
          try {
            await pluginObj.axios.post(pluginObj.eventsURL, events);
          } catch (err) {
            const errorInfo = {
              message: err.message,
              status: err.response && err.response.status,
              statusText: err.response && err.response.statusText,
              url: err.config && err.config.url
            };
            console.error('[ti2-events2url] Failed to send event to eventURL', errorInfo);
          }
        } else {
          console.log('[ti2-events2url] unable to send event (size constraint)', events);
        }
      });
    });
  }
}

module.exports = Plugin;
