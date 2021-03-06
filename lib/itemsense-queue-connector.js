'use strict';

const events = require('events');
const amqp = require('amqplib');
const requests = require('./itemsense-requests');

const isChildProcess = typeof process.send === 'function';

const event = {
  info: 'info',
  itemQueueMessage: 'itemQueueMessage',
  itemQueueConnected: 'itemQueueConnected',
  thresholdQueueMessage: 'thresholdQueueMessage',
  thresholdQueueConnected: 'thresholdQueueConnected',
  healthQueueMessage: 'healthQueueMessage',
  healthQueueConnected: 'healthQueueConnected',
  amqpConnectionClosed: 'amqpConnectionClosed'
};

const DEFAULT_HOSTNAME = '127.0.0.1';
const DEFAULT_PORT = 80;
const DEFAULT_IGNORE_ABSENT = false;
const DEFAULT_CONN_RETRY = 30000;
const DEFAULT_CONN_HEARTBEAT = 30000;
const DEFAULT_MAX_OBSERVATION_TIME_DELTA = 0;

const MIN_CONN_HEARTBEAT = 1; // amqplib connection heartbeat unit is seconds
const MIN_CONN_RETRY = 1000;

/**
 *
 * @param {*} options - The options to merge with the default options
 *
 * Creates the options required to start a connector - any missing options in the provided args will be set to default values
 */
function createOptions(options = {}) {
  let defaults = {
    id: 'ItemSenseQueueConnector',
    name: 'ItemSenseQueueConnector',

    // CONNECTION
    hostname: DEFAULT_HOSTNAME,
    port: DEFAULT_PORT,
    username: '',
    password: '',
    connectionRetryInterval: DEFAULT_CONN_RETRY,
    connectionHeartbeatInterval: DEFAULT_CONN_HEARTBEAT,

    // QUEUE
    itemQueueName: '',
    itemQueueFilter: {},
    thresholdQueueName: '',
    healthQueueName: '',

    // TOLERANCE
    ignoreAbsent: DEFAULT_IGNORE_ABSENT,
    maxObservationTimeDelta: DEFAULT_MAX_OBSERVATION_TIME_DELTA
  };

  for (let opt in defaults) {
    if (options[opt]) {
      defaults[opt] = options[opt];
    }
  }

  return defaults;
}

/**
 * Creates an ItemSenseConnector. If the file is run as a child process, a new ItemSenseConnector instance is created automatically
 */
class ItemSenseConnector extends events.EventEmitter {
  constructor() {
    super();

    //OPTIONS
    this.options = createOptions();

    // AMQP MQTT
    this._itemQueueConnection = null;
    this._itemQueueChannel = null;
    this._thresholdQueueConnection = null;
    this._thresholdQueueChannel = null;
    this._healthQueueConnection = null;
    this._healthQueueChannel = null;

    // STATUS
    this._started = false;
    this._retryConnectItemQueueHandle = -1;
    this._retryConnectThresholdQueueHandle = -1;
    this._retryConnectHealthQueueHandle = -1;

    if (isChildProcess) {
      process.on('message', message => {
        if (message.command) {
          switch (message.command) {
            case 'start':
              processInstance._emitEventMessage(
                event.info,
                'Received start command'
              );
              processInstance.start(message.options);
              break;
            case 'shutdown':
              processInstance._emitEventMessage(
                event.info,
                'Received shutdown command'
              );
              processInstance.shutdown();
              break;
            default:
              processInstance._emitEventMessage(
                event.info,
                `Received unknown command [ ${message.command} ]`
              );
          }
        }
      });
    }
  }

  /**
   * Returns true if the connector has been started
   */
  isStarted() {
    return this._started;
  }

  /**
   *
   * @param {*} options - This should be the result of a createOptions(options) call - WARNING: the options you provide are not validated before use
   *
   * Sets this.options to the provided options and calls _connectItemQueue()
   */
  start(options = {}) {
    if (this._started) return;

    this._started = true;
    for (let opt in this.options) {
      if (options[opt] !== undefined) {
        this.options[opt] = options[opt];
      }
    }

    clearTimeout(this._retryConnectItemQueueHandle);
    clearTimeout(this._retryConnectThresholdQueueHandle);
    clearTimeout(this._retryConnectHealthQueueHandle);
    this._connectItemQueue();
    this._connectThresholdQueue();
    this._connectHealthQueue();
  }

  /**
   *
   * @param {*} event - event name
   * @param {*} message - event message
   *
   * Depending on how the module is being used, the process will send the event to the parent process or emit the event to listeners
   */
  _emitEventMessage(event, message) {
    if (isChildProcess) {
      process.send({
        event,
        data: message
      });
    } else {
      this.emit(event, message);
    }
  }

  /**
   * Uses setTimeout to get another _connectItemQueue() call ready
   */
  async _retryConnectItemQueue() {
    clearTimeout(this._retryConnectItemQueueHandle);

    const retryInterval = Math.max(
      MIN_CONN_RETRY,
      this.options.connectionRetryInterval
    );

    this._retryConnectItemQueueHandle = setTimeout(() => {
      if (this._itemQueueConnection) {
        this._itemQueueConnection.removeAllListeners();
      }
      if (this._itemQueueChannel) {
        this._itemQueueChannel.removeAllListeners();
      }

      this._connectItemQueue();
    }, retryInterval);
  }

  async _retryConnectThresholdQueue() {
    clearTimeout(this._retryConnectThresholdQueueHandle);

    const retryInterval = Math.max(
      MIN_CONN_RETRY,
      this.options.connectionRetryInterval
    );

    this._retryConnectThresholdQueueHandle = setTimeout(() => {
      if (this._thresholdQueueConnection) {
        this._thresholdQueueConnection.removeAllListeners();
      }
      if (this._thresholdQueueChannel) {
        this._thresholdQueueChannel.removeAllListeners();
      }

      this._connectThresholdQueue();
    }, retryInterval);
  }

  async _retryConnectHealthQueue() {
    clearTimeout(this._retryConnectHealthQueueHandle);

    const retryInterval = Math.max(
      MIN_CONN_RETRY,
      this.options.connectionRetryInterval
    );

    this._retryConnectHealthQueueHandle = setTimeout(() => {
      if (this._healthQueueConnection) {
        this._healthQueueConnection.removeAllListeners();
      }
      if (this._healthQueueChannel) {
        this._healthQueueChannel.removeAllListeners();
      }

      this._connectHealthQueue();
    }, retryInterval);
  }

  /**
   * Connects to an ItemSense ITEM QUEUE using the options passed to the start() method
   */
  async _connectItemQueue() {
    if (!this._started) return;

    let itemQueueName = this.options.itemQueueName;

    try {
      await requests.isServerAvailable(this.options);
    } catch (err) {
      this._emitEventMessage('error', err);
      return this._retryConnectItemQueue();
    }
    try {
      const heartbeat = Math.max(
        MIN_CONN_HEARTBEAT,
        Math.floor(this.options.connectionHeartbeatInterval * 0.001) // amqplib connection heartbeat in seconds
      );

      this._itemQueueConnection = await amqp.connect({
        hostname: this.options.hostname,
        vhost: '/',
        username: this.options.username,
        password: this.options.password,
        heartbeat: heartbeat // seconds
      });
    } catch (err) {
      this._emitEventMessage('error', err);
      return this._retryConnectItemQueue();
    }

    try {
      this._itemQueueChannel = await this._itemQueueConnection.createChannel();
      this._itemQueueChannel.on('error', err => {
        this._emitEventMessage('error', err);
      });

      if (itemQueueName) {
        try {
          await this._itemQueueChannel.checkQueue(itemQueueName);
        } catch (err) {
          this._emitEventMessage(
            'error',
            new Error(`Item queue [ ${itemQueueName} ] no longer exists.`)
          );
          itemQueueName = await requests
            .createItemQueue(this.options)
            .then(res => res.queue);
          this._itemQueueChannel = await this._itemQueueConnection.createChannel();
          this._itemQueueChannel.on('error', err => {
            this._emitEventMessage('error', err);
          });

          this.options.itemQueueName = itemQueueName;
        }
      } else {
        itemQueueName = await requests
          .createItemQueue(this.options)
          .then(res => res.queue);

        this.options.itemQueueName = itemQueueName;
      }
    } catch (err) {
      this._emitEventMessage('error', err);
      return this._retryConnectItemQueue();
    }

    this._itemQueueConnection.on('error', err => {
      this._emitEventMessage(
        'error',
        new Error(`Item queue connection interrupted.`)
      );
      return this._retryConnectItemQueue();
    });
    this._itemQueueConnection.on('close', err => {
      if (err) {
        this.options.itemQueueName = '';
        this._emitEventMessage(event.amqpConnectionClosed, err);
        this._retryConnectItemQueue();
      } else {
        this._emitEventMessage(
          event.amqpConnectionClosed,
          new Error(`Item queue connection closed.`)
        );
      }
    });

    this._itemQueueChannel
      .consume(this.options.itemQueueName, msg => {
        this._itemQueueChannel.ack(msg);

        let content = msg.content.toString();
        let json = JSON.parse(content);

        if (this.options.ignoreAbsent && json.toZone === 'ABSENT') {
          return;
        }

        if (this.options.maxObservationTimeDelta > 0) {
          try {
            const delta = Date.now() - Date.parse(json.observationTime);
            if (delta > this.options.maxObservationTimeDelta) {
              return;
            }
          } catch (unused) {
            return this._emitEventMessage(
              'error',
              new Error(
                `Unable to parse queue message content as JSON ${content}`
              )
            );
          }
        }

        this._emitEventMessage(event.itemQueueMessage, json);
      })
      .then(() => {
        this._emitEventMessage(event.itemQueueConnected, `${itemQueueName}`);
      })
      .catch(err => {
        this._itemQueueChannel.removeAllListeners();
        this._emitEventMessage('error', err);
      });
  }

  /**
   * Connects to an ItemSense THRESHOLD QUEUE using the options passed to the start() method
   */
  async _connectThresholdQueue() {
    if (!this._started) return;

    let thresholdQueueName = this.options.thresholdQueueName;

    try {
      await requests.isServerAvailable(this.options);
    } catch (err) {
      this._emitEventMessage('error', err);
      return this._retryConnectThresholdQueue();
    }
    try {
      const heartbeat = Math.max(
        MIN_CONN_HEARTBEAT,
        Math.floor(this.options.connectionHeartbeatInterval * 0.001) // amqplib connection heartbeat in seconds
      );

      this._thresholdQueueConnection = await amqp.connect({
        hostname: this.options.hostname,
        vhost: '/',
        username: this.options.username,
        password: this.options.password,
        heartbeat: heartbeat // seconds
      });
    } catch (err) {
      this._emitEventMessage('error', err);
      return this._retryConnectThresholdQueue();
    }

    try {
      this._thresholdQueueChannel = await this._thresholdQueueConnection.createChannel();
      this._thresholdQueueChannel.on('error', err => {
        this._emitEventMessage('error', err);
      });

      if (thresholdQueueName) {
        try {
          await this._thresholdQueueChannel.checkQueue(thresholdQueueName);
        } catch (err) {
          this._emitEventMessage(
            'error',
            new Error(
              `Threshold queue [ ${thresholdQueueName} ] no longer exists.`
            )
          );
          thresholdQueueName = await requests
            .createThresholdQueue(this.options)
            .then(res => res.queue);
          this._thresholdQueueChannel = await this._thresholdQueueConnection.createChannel();
          this._thresholdQueueChannel.on('error', err => {
            this._emitEventMessage('error', err);
          });

          this.options.thresholdQueueName = thresholdQueueName;
        }
      } else {
        thresholdQueueName = await requests
          .createThresholdQueue(this.options)
          .then(res => res.queue);

        this.options.thresholdQueueName = thresholdQueueName;
      }
    } catch (err) {
      this._emitEventMessage('error', err);
      return this._retryConnectThresholdQueue();
    }

    this._thresholdQueueConnection.on('error', err => {
      this._emitEventMessage(
        'error',
        new Error(`Threshold queue connection interrupted.`)
      );
      return this._retryConnectThresholdQueue();
    });
    this._thresholdQueueConnection.on('close', err => {
      if (err) {
        this.options.thresholdQueueName = '';
        this._emitEventMessage(event.amqpConnectionClosed, err);
        this._retryConnectThresholdQueue();
      } else {
        this._emitEventMessage(
          event.amqpConnectionClosed,
          new Error(`Threshold queue connection closed.`)
        );
      }
    });

    this._thresholdQueueChannel
      .consume(this.options.thresholdQueueName, msg => {
        this._thresholdQueueChannel.ack(msg);

        let content = msg.content.toString();
        let json = JSON.parse(content);

        if (this.options.ignoreAbsent && json.toZone === 'ABSENT') {
          return;
        }

        if (this.options.maxObservationTimeDelta > 0) {
          try {
            const delta = Date.now() - Date.parse(json.observationTime);
            if (delta > this.options.maxObservationTimeDelta) {
              return;
            }
          } catch (unused) {
            return this._emitEventMessage(
              'error',
              new Error(
                `Unable to parse queue message content as JSON ${content}`
              )
            );
          }
        }

        this._emitEventMessage(event.thresholdQueueMessage, json);
      })
      .then(() => {
        this._emitEventMessage(
          event.thresholdQueueConnected,
          `${thresholdQueueName}`
        );
      })
      .catch(err => {
        this._thresholdQueueChannel.removeAllListeners();
        this._emitEventMessage('error', err);
      });
  }

  /**
   * Connects to an ItemSense HEALTH QUEUE using the options passed to the start() method
   */
  async _connectHealthQueue() {
    if (!this._started) return;

    let healthQueueName;

    try {
      await requests.isServerAvailable(this.options);
    } catch (err) {
      this._emitEventMessage('error', err);
      return this._retryConnectHealthQueue();
    }
    try {
      const heartbeat = Math.max(
        MIN_CONN_HEARTBEAT,
        Math.floor(this.options.connectionHeartbeatInterval * 0.001) // amqplib connection heartbeat in seconds
      );

      this._healthQueueConnection = await amqp.connect({
        hostname: this.options.hostname,
        vhost: '/',
        username: this.options.username,
        password: this.options.password,
        heartbeat: heartbeat // seconds
      });
    } catch (err) {
      this._emitEventMessage('error', err);
      return this._retryConnectHealthQueue();
    }

    try {
      this._healthQueueChannel = await this._healthQueueConnection.createChannel();
      this._healthQueueChannel.on('error', err => {
        this._emitEventMessage('error', err);
      });

      healthQueueName = await requests
        .createHealthQueue(this.options)
        .then(res => res.queue);
    } catch (err) {
      this._emitEventMessage('error', err);
      return this._retryConnectHealthQueue();
    }

    this._healthQueueConnection.on('error', err => {
      this._emitEventMessage(
        'error',
        new Error(`Health queue connection interrupted.`)
      );
      return this._retryConnectHealthQueue();
    });
    this._healthQueueConnection.on('close', err => {
      if (err) {
        this._emitEventMessage(event.amqpConnectionClosed, err);
        this._retryConnectHealthQueue();
      } else {
        this._emitEventMessage(
          event.amqpConnectionClosed,
          new Error(`Health queue connection closed.`)
        );
      }
    });

    this._healthQueueChannel
      .consume(healthQueueName, msg => {
        this._healthQueueChannel.ack(msg);

        let content = msg.content.toString();
        let json = JSON.parse(content);

        if (this.options.ignoreAbsent && json.toZone === 'ABSENT') {
          return;
        }

        if (this.options.maxObservationTimeDelta > 0) {
          try {
            const delta = Date.now() - Date.parse(json.observationTime);
            if (delta > this.options.maxObservationTimeDelta) {
              return;
            }
          } catch (unused) {
            return this._emitEventMessage(
              'error',
              new Error(
                `Unable to parse queue message content as JSON ${content}`
              )
            );
          }
        }

        this._emitEventMessage(event.healthQueueMessage, json);
      })
      .then(() => {
        this._emitEventMessage(
          event.healthQueueConnected,
          `${healthQueueName}`
        );
      })
      .catch(err => {
        this._healthQueueChannel.removeAllListeners();
        this._emitEventMessage('error', err);
      });
  }

  /**
   * Closes the AMQP channel and connection
   */
  async shutdown() {
    this._started = false;
    this.options.itemQueueName = '';
    this.options.thresholdQueueName = '';
    try {
      this._emitEventMessage(event.info, 'Closing item queue channel.');
      this._itemQueueChannel.removeAllListeners();
      await this._itemQueueChannel.close();
    } catch (unused) {}
    try {
      this._emitEventMessage(event.info, 'Closing item queue connection.');
      this._itemQueueConnection.removeAllListeners();
      await this._itemQueueConnection.close();
    } catch (unused) {}
    try {
      this._emitEventMessage(event.info, 'Closing threshold queue channel.');
      this._thresholdQueueChannel.removeAllListeners();
      await this._thresholdQueueChannel.close();
    } catch (unused) {}
    try {
      this._emitEventMessage(event.info, 'Closing threshold queue connection.');
      this._thresholdQueueConnection.removeAllListeners();
      await this._thresholdQueueConnection.close();
    } catch (unused) {}
    try {
      this._emitEventMessage(event.info, 'Closing health queue channel.');
      this._healthQueueChannel.removeAllListeners();
      await this._healthQueueChannel.close();
    } catch (unused) {}
    try {
      this._emitEventMessage(event.info, 'Closing health queue connection.');
      this._healthQueueConnection.removeAllListeners();
      await this._healthQueueConnection.close();
    } catch (unused) {}
  }
}

const processInstance = isChildProcess ? new ItemSenseConnector() : null;

module.exports = {
  event,
  createOptions,
  createConnector: function() {
    return new ItemSenseConnector();
  }
};
