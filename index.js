const { sizeInKB } = require('limit-object-size');
const OBJECT_SIZE_LIMIT = 256 // in kbytes
const PRODUCT_CACHE_SAVE_EVENT = 'bookingsProductSearch:cache:save';
const PRODUCT_CACHE_SAVE_TIMEOUT_MS = 30000;
const PRODUCT_CACHE_SAVE_MAX_ATTEMPTS = 3;

const redactAdmissionTokens = value => {
  const serialized = JSON.stringify(value, (key, item) => (
    key === 'fullSyncAdmissionToken' ? '[REDACTED]' : item
  ));
  return serialized === undefined ? value : JSON.parse(serialized);
};

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
        const forwardedBody = eventName === PRODUCT_CACHE_SAVE_EVENT
          ? body
          : redactAdmissionTokens(body);
        const payload = {
          body: forwardedBody,
          event: eventName,
          eventTime: new Date().toISOString(),
          source: pluginObj.Source || 'ti2',
        };
        if (sizeInKB(JSON.stringify(payload)) < OBJECT_SIZE_LIMIT) {
          try {
            const options = { headers: {} };
            
            // Only add Authorization header if authorization is provided
            if (pluginObj.authorization) {
              options.headers.Authorization = pluginObj.authorization;
            }
            
            await pluginObj.axios.post(pluginObj.eventsURL, payload, options);
          } catch (err) {
            const errorInfo = {
              message: err.message,
              status: err.response && err.response.status,
              statusText: err.response && err.response.statusText,
              url: err.config && err.config.url
            };
            console.error(
              `[ti2-events2url] Failed to send event to eventURL`,
              redactAdmissionTokens(payload),
              errorInfo,
            );
          }
        } else {
          console.log(
            '[ti2-events2url] unable to send event (size constraint)',
            redactAdmissionTokens(payload),
          );
        }
      });
    });
  }

  /**
   * Awaitable handoff for TourPlan NX catalog marker recording.
   * Prefer this over also wiring eventHandler for bookingsProductSearch:cache:save
   * to avoid a duplicate Filematch post for the same save.
   * Retries 5xx and transport failures (Filematch absorbs S3 races internally and
   * returns 503 when exhausted). Does not retry 4xx — 409 is a permanent fingerprint
   * conflict; 412 is not returned on this path.
   * Throws on validation, size limit, skipped responses, or final failure.
   * @param {object} body - Event body accepted by Filematch /ti2events
   * @returns {Promise<string>} generationId when Filematch records the marker
   */
  async recordProductCacheSave(body) {
    if (!this.eventsURL || !this.axios) {
      throw new Error('ti2-events2url requires eventsURL and axios to record product cache saves');
    }
    if (!this.authorization) {
      throw new Error('ti2-events2url requires authorization to record product cache saves');
    }
    const payload = {
      body,
      event: PRODUCT_CACHE_SAVE_EVENT,
      eventTime: new Date().toISOString(),
      source: this.Source || 'ti2',
    };
    if (sizeInKB(JSON.stringify(payload)) >= OBJECT_SIZE_LIMIT) {
      throw new Error('ti2-events2url cannot record product cache save (size constraint)');
    }
    const options = {
      headers: { Authorization: this.authorization },
      timeout: PRODUCT_CACHE_SAVE_TIMEOUT_MS,
    };
    // Filematch returns 503 after exhausting internal marker races; 4xx are terminal.
    const sendWithRetry = async attempt => {
      try {
        return await this.axios.post(this.eventsURL, payload, options);
      } catch (error) {
        const status = error.response && error.response.status;
        const nonRetryable = status && status < 500;
        if (attempt + 1 >= PRODUCT_CACHE_SAVE_MAX_ATTEMPTS || nonRetryable) {
          throw error;
        }
        await new Promise(resolve => { setTimeout(resolve, 250 * (attempt + 1)); });
        return sendWithRetry(attempt + 1);
      }
    };
    const response = await sendWithRetry(0);
    if (!response.data || response.data.status !== 'recorded') {
      throw new Error('Filematch did not accept TourPlan sync metadata recording');
    }
    const generationId = response.data.marker && response.data.marker.generationId;
    if (!generationId) {
      throw new Error('Filematch did not return a generation id for TourPlan sync metadata recording');
    }
    return generationId;
  }
}

module.exports = Plugin;
