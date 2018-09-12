'use strict';

const events = require('events');
const request = require('request-promise');
const amqp = require('amqplib');

const isChildProcess = typeof process.send === 'function';

const event = {
  itemQueueMessage: 'itemQueueMessage',
  healthQueueMessage: 'healthQueueMessage',
  queueConnected: 'queueConnected',
  queueDisconnected: 'queueDisconnected',
  serverConnectionError: 'serverConnectionError',
  amqpConnectionError: 'amqpConnectionError',
  amqpConnectionClosed: 'amqpConnectionClosed',
  amqpChannelError: 'amqpChannelError'
};

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 80;
const DEFAULT_SSL = false;
const DEFAULT_IGNORE_ABSENT = false;
const DEFAULT_CONN_RETRY = 5000;
const DEFAULT_CONN_HEARTBEAT = 30000;
const DEFAULT_MAX_OBSERVATION_TIME_DELTA = -1;

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
    id: 'ItemSenseConnector',

    // CONNECTION
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    ssl: DEFAULT_SSL,
    username: '',
    password: '',
    connectionRetryInterval: DEFAULT_CONN_RETRY,
    connectionHeartbeatInterval: DEFAULT_CONN_HEARTBEAT,

    // QUEUE
    queue: '',
    queueMessageFilter: {},

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

    // AMQP
    this._connection = null;
    this._channel = null;

    // STATUS
    this._shuttingDown = false;

    if (isChildProcess) {
      process.on('message', message => {
        if (message.command) {
          switch (message.command) {
            case 'start':
              console.log(
                `${message.options.id ||
                  processInstance.id} :: received start command`
              );
              processInstance.start(message.options);
              break;
            case 'shutdown':
              console.log(
                `${this.options.id ||
                  processInstance.id} :: received shutdown command`
              );
              processInstance.shutdown();
              break;
            default:
              console.error(
                `${processInstance.id} :: unknown command [ ${
                  message.command
                } ]`
              );
          }
        }
      });
    }
  }

  /**
   *
   * @param {*} options - This should be the result of a createOptions(options) call - WARNING: the options you provide are not validated before use
   *
   * Sets this.options to the provided options and calls _connect()
   */
  start(options = {}) {
    this.options = options;

    this._connect();
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
   * Creates a new ItemSense queue using the queueFilter option and returns the queue name
   */
  async _getItemQueueName() {
    try {
      const res = await request
        .put(
          `${this.options.ssl ? 'https' : 'http'}://${this.options.host}:${
            this.options.port
          }/itemsense/data/v1/items/queues`
        )
        .auth(this.options.username, this.options.password, true)
        .json(this.options.queueMessageFilter);

      return res.queue;
    } catch (err) {
      this._emitEventMessage(
        event.serverConnectionError,
        `error getting queue name - ${err}`
      );
    }
  }

  /**
   * Uses setTimeout to get another _connect() call ready
   */
  async _retryConnect() {
    const retryInterval = Math.max(
      MIN_CONN_RETRY,
      this.options.connectionHeartbeatInterval
    );
    setTimeout(this._connect.bind(this), this.options.connectionRetryInterval);
  }

  /**
   * Connects to an ItemSense server using the options passed to the start() method
   */
  async _connect() {
    try {
      const heartbeat = Math.max(
        MIN_CONN_HEARTBEAT,
        Math.floor(this.options.connectionHeartbeatInterval * 0.001) // amqplib connection heartbeat in seconds
      );
      this._connection = await amqp.connect({
        hostname: this.options.host,
        vhost: '/',
        username: this.options.username,
        password: this.options.password,
        heartbeat: heartbeat // seconds
      });
    } catch (err) {
      this._emitEventMessage(event.amqpConnectionError, err);
      return this._retryConnect();
    }

    try {
      this._channel = await this._connection.createChannel();
      this._channel.on('error', err => {
        this._emitEventMessage(event.amqpChannelError, err);
      });

      if (this.options.queue) {
        try {
          await this._channel.checkQueue(this.options.queue);
        } catch (err) {
          this._emitEventMessage(
            event.amqpChannelError,
            `queue ${this.options.queue} no longer exists`
          );
          this.options.queue = await this._getItemQueueName();
          this._channel = await this._connection.createChannel();
          this._channel.on('error', err => {
            this._channel.removeAllListeners();
            this._emitEventMessage(event.channelError, err);
          });
        }
      } else {
        this.options.queue = await this._getItemQueueName();
      }
    } catch (err) {
      this._channel.removeAllListeners();
      this._emitEventMessage(event.channelError, err);
      return this._retryConnect();
    }

    this._connection.on('error', err => {
      this._connection.removeAllListeners();
      this._emitEventMessage(
        event.amqpConnectionError,
        `amqp connection interrupted`
      );
      this.options.queue = '';
      return this._retryConnect();
    });
    this._connection.on('close', () => {
      this._connection.removeAllListeners();
      this._emitEventMessage(
        event.amqpConnectionClosed,
        `amqp connection closed`
      );
    });

    this._channel
      .consume(this.options.queue, msg => {
        this._channel.ack(msg);

        let content = msg.content.toString();
        let jsonContent = JSON.parse(content);

        if (this.options.ignoreAbsent && jsonContent.toZone === 'ABSENT') {
          return;
        }

        if (this.options.maxObservationTimeDelta > 0) {
          try {
            const delta = Date.now() - Date.parse(jsonContent.observationTime);
            if (delta > this.options.maxObservationTimeDelta) {
              return;
            }
          } catch (unused) {
            return console.log(
              `${this.options.id} - error parsing message content ${content}`
            );
          }
        }

        this._emitEventMessage(event.itemQueueMessage, content);
      })
      .then(() => {
        this._emitEventMessage(event.queueConnected, this.options.queue);
      })
      .catch(err => {
        this._channel.removeAllListeners();
        this._emitEventMessage(event.amqpChannelError, err);
      });
  }

  /**
   * Closes the AMQP channel and connection. If the connector is a child process, the process will exit on its own after closing all connections
   */
  async shutdown() {
    if (this._shuttingDown) return;

    this._shuttingDown = true;

    const forceHandle = setTimeout(() => {
      console.log('graceful shutdown process took too long - forcing shutdown');
      if (isChildProcess) {
        process.exit(1);
      }
    }, 5000);

    try {
      console.log(`${this.options.id} :: closing channels`);
      await this._channel.close();
      this._channel.removeAllListeners();
    } catch (unused) {}
    try {
      console.log(`${this.options.id} :: closing connection`);
      await this._connection.close();
      this._connection.removeAllListeners();
    } catch (unused) {}

    clearTimeout(forceHandle);

    if (isChildProcess) {
      process.exit(0);
    } else {
      this._shuttingDown = false;
    }
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
