## itemsense-queue-connector

Creates and manages connections to ItemSense queues. This module can be used to create connectors in your app's main process, or it can be run as a child process.

Targets ES6+.

---

## Table of Contents

- [Install](#install)
- [Test](#test)
- [Usage](#usage)
- [Module Exports](#module-exports)
- [Connector Methods](#connector-methods)
- [Child Process Commands](#child-process-commands)
- [Options](#options)
  - [Definitions](#option-definitions)
  - [Notes](#option-notes)
    - [connectionRetryInterval](#connection-retry-interval-note)
    - [connectionHeartbeatInterval](#connection-heartbeat-interval-note)
    - [queue](#item-queue-name-option-note)
    - [itemQueueFilter](#item-queue-filter-option-note)
    - [ignoreAbsent](#ignore-absent-option-note)
    - [maxObservationTimeDelta](#max-observation-time-delta-option-note)
- [Events](#events)
  - [Definitions](#event-definitions)
- [Same Process Event Handling](#same-process-event-handling)
- [Child Process Event Handling](#child-process-event-handling)
  - [Message Structure](#message-structure)
- [ItemSense Queue Issue](#itemsense-queue-issue)
- [To Do](#to-do)

---

## Install

```
npm i itemsense-queue-connector
```

---

## Test

From your project directory...

```
cd ./node_modules/itemsense-queue-connector
```

Set the environmental variables `HOSTNAME`, `USERNAME`, `PASSWORD`, and (**optional**) `PORT` and `QUEUE`. Then run the `npm test`.

### Linux/MacOS Example

```
HOST=192.168.1.64 USERNAME=username PASSWORD=password npm test
```

The test will run for 5 minutes before shutting itself down. The options being used for each of the connectors are slightly different, and will be output to the console for you to see (or you can look at the `test.js` file).

---

## Usage

### Create a Connector in the Same Process

```js
// require module
const iqc = require('itemsense-queue-connector');

// create connector
const connector = iqc.createConnector();

// create options
let options = iqc.createOptions({
  hostname: '127.0.0.1',
  username: 'username',
  password: 'password'
});

// start the connector with the defined options
connector.start(options);

// listen for messages
connector.on(iqc.event.itemQueueMessage, message => {
  console.log(`received item queue message: ${message}`);
});
connector.on(iqc.event.healthQueueMessage, message => {
  console.log(`received health queue message: ${message}`);
});
connector.on(iqc.event.itemQueueConnected, queue => {
  console.log(`connected to item queue [ ${queue} ]`);
});
connector.on(iqc.event.healthQueueConnected, queue => {
  console.log(`connected to health queue [ ${queue} ]`);
});
connector.on('error', message => {
  console.log(`received error: ${message}`);
});
// you can use the event names directly - see Events section
connector.on('info', message => {
  console.log(`received info: ${message}`);
});

// ...

// shutdown the connector when finished, or when you need to change options
connector.shutdown();
```

### Create a Connector as a Child Process

```js
const fork = require('child_process').fork;

// require module
const iqc = require('itemsense-queue-connector');

// fork the itemsense-queue-connector module
const connector = fork('./node_modules/itemsense-queue-connector');

// create options
let options = iqc.createOptions({
  hostname: '127.0.0.1',
  username: 'username',
  password: 'password'
});

// start the connector with the defined options
connector.send({ command: 'start', options });

// listen for queue messages
connector.on('message', message => {
  switch (message.event) {
    case iqc.event.itemQueueMessage:
      console.log(`received item queue message: ${message.data}`);
      break;
    case iqc.event.healthQueueMessage:
      console.log(`received health queue message: ${message.data}`);
      break;
    case iqc.event.itemQueueConnected:
      console.log(`connected to item queue [ ${message.data} ]`);
      break;
    case iqc.event.healthQueueConnected:
      console.log(`connected to health queue [ ${message.data} ]`);
      break;
    case 'error':
      console.log(`received error: ${message.data}`);
      break;
    // you can use the event names directly - see Events section
    case: 'info':
      console.log(`received info: ${message.data}`);
      break;
  }
});

// ...

// shutdown the connector when finished, or when you need to change options
connector.send({ command: 'shutdown' });
```

---

## Module Exports

| Name            | Type     | Args            | Description                                                       |
| --------------- | -------- | --------------- | ----------------------------------------------------------------- |
| event           | Object   | n/a             | key:value pair of event names that a connector will emit          |
| createOptions   | Function | options: Object | Creates and returns options that can be used to start a connector |
| createConnector | Function | None            | Creates and returns a new connector instance                      |

```js
const iqc = require('itemsense-queue-connector');
const connector = iqc.createConnector();

let options = iqc.createOptions({ hostname: '192.168.1.64' }); // creates and merges options

connector.start(options);
```

---

## Connector Methods

| Name     | Description                                 |
| -------- | ------------------------------------------- |
| start    | Starts the connector with the given options |
| shutdown | Shutdown the connector                      |

```js
const iqc = require('itemsense-queue-connector');
let options = iqc.createOptions(); // will create default options

const connector = iqc.createConnector();

connector.start(options);
// ...
connector.shutdown();
```

IMPORTANT: `start` should only be called when the connector has not been started, OR it has been `shutdown`.

---

## Child Process Commands

Commands are used to control a connector that's running as a child process.

| Command  | Description                                            |
| -------- | ------------------------------------------------------ |
| start    | Start the connector to start with the provided options |
| shutdown | Shutdown the connector                                 |

```js
connector.send({ command: 'start', options: options });
// ...
connector.send({ command: 'shutdown' });
```

---

<a id='option-definitions'></a>

## Options

| Option                      | Type    | Default            | Description                                                                                  |
| --------------------------- | ------- | ------------------ | -------------------------------------------------------------------------------------------- |
| id                          | String  | ItemSenseConnector | the id of the connector instance - useful when multiple connectors exist                     |
| hostname                    | String  | 127.0.0.1          | the IP address or hostname of the ItemSense server                                           |
| port                        | Number  | 80                 | the port the ItemSense API is available on - used to configure queues                        |
| username                    | String  |                    | username of a user with a role of DataReader or Admin                                        |
| password                    | String  |                    | the password for the username                                                                |
| connectionRetryInterval     | Number  | 5000               | the time, in **milliseconds**, between connection attempts if a network error occurs         |
| connectionHeartbeatInterval | Number  | 30000              | the time, in **milliseconds**, that the AMQP connection will be checked                      |
| itemQueueName               | String  |                    | a queue name to connect to, if it does not exist on the server, a new queue will be created  |
| itemQueueFilter             | Object  | {}                 | used to configure a new queue for items                                                      |
| ignoreAbsent                | Boolean | false              | if true, messages where toZone === 'ABSENT' will not be sent to listeners                    |
| maxObservationTimeDelta     | Number  | 0                  | the maximum delta, in **milliseconds**, that an observationTime can be from the current time |

<a id='option-notes'></a>

---

<a id='connection-retry-interval-note'></a>

### connectionRetryInterval

**Min:** 1000 ms  
**Max:** None  
**Default:** 5000 ms

If a connector's AMQP connection fails or is interrupted, the connector will try to reconnect to the server at this interval.

---

<a id='connection-heartbeat-interval-note'></a>

### connectionHeartbeatInterval

**Min:** 1000 ms  
**Max:** None  
**Default:** 30000 ms

This is the rate that the AMQP connection is checked for connectivity. When two consecutive heartbeat checks fail, the connection is considered to be lost, at which point an `ampqConnectionError` event is sent to all listeners, and the connector will try to reconnect to the server.

IMPORTANT: If the connection between your app and the ItemSense server is unreliable, the `connectionHeartbeatInterval` may need to be higher than the default **30000 ms**. This will allow more time for the AMQP connection to recover, and your connector will be able to receive any queue messages that were pushed onto the queue while the network connection was temporarily unavailable. Also, the `connectionHeartbeatInterval` should be, at most, 1/3 of the average time it takes for your ItemSense server to restart - see the [ItemSense Queue Issue](#itemsense-queue-issue) section for more details.

---

<a id='item-queue-name-option-note'></a>

### itemQueueName

Depending on how the connector is being used, when starting the connector, it may be beneficial to provide an existing queue name. Any messages that are waiting to be consumed in the queue will be consumed by the connector and events will be sent to listeners unless the observationTime delta exceeds `maxObservationTimeDelta`.

---

<a id='item-queue-filter-option-note'></a>

### itemQueueFilter

The `itemQueueFilter` option is sent to the ItemSense server when creating a new queue. The filter can contain any of the following properties.

IMPORTANT: If the connector options you're using have `itemQueueFilter` as well as a `itemQueueName` defined, and the queue exists, then `itemQueueFilter` will not be used until the connector has to create a new queue.

<cite>Excerpt from the [Impinj - ItemSense API Documentation](https://developer.impinj.com/itemsense/docs/api/)</cite>

| Property            | Type    | Description                                                                                                                       |
| ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| fromFacility        | String  | The name of a facility to monitor for tag exit events                                                                             |
| toFacility          | String  | The name of a facility to monitor for tag entry events                                                                            |
| fromZone            | String  | The name of the zone to monitor for tag exit events                                                                               |
| toZone              | String  | The name of the zone to monitor for tag entry events                                                                              |
| epc                 | String  | A hexadecimal string representing an EPC prefix of an item. Only the items with EPCs that start with this prefix will be returned |
| jobId               | String  | The ID of the job to monitor for tag events                                                                                       |
| distance            | Number  | The minimum distance a tag must move before a queue event (or message) is created                                                 |
| zoneTransitionsOnly | Boolean | Flag to only create queue events for tags that have transitioned between zones. Default value is true.                            |

---

<a id='ignore-absent-option-note'></a>

### ignoreAbsent

The `ignoreAbsent` option can be useful when your ItemSense jobs have tag expiration on, but you're not interested in the ABSENT messages that get generated when a tag expires. For example, if you have a reader set up to see when a tag moves into a zone, but it is possible that the tag will not be read by any other reader before it passes by that same reader again, the tag would be ignored the next time it passes by unless tag expiration is on. Tag expiration can create bursts of heavy queue traffic so `ignoreAbsent` is more beneficial when the connector is run as a child process. This is because, if the connector is running in the same process as your app, all of the queue messages will be pushed into the Node event loop and have to be handled by the connector in your app (even just to ignore them), BUT if a child process gets the ABSENT message, it will not pass it onto your app's process for handling.

---

<a id='max-observation-time-delta-option-note'></a>

### maxObservationTimeDelta

The `maxObservationTimeDelta` option, when set to a value greater than 0, is used to 'silence' queue messages that have an observationTime delta that is older than this value. This can be helpful in some cases because ItemSense will continue to push messages onto the queue for up to an hour while no clients are connected to the queue. This means there could possibly be thousands of outdated messages that will flood your listeners. If your listeners are running in another process, the flood of incoming messages may not be a problem, otherwise it could slow your entire application down (depends on what your listeners are doing with the messages).

---

## Events

<a id="event-definitions"></a>

| Event                | Msg Data Type | Description                                                        |
| -------------------- | ------------- | ------------------------------------------------------------------ |
| info                 | String        | Helpful information that may want to be logged or stored elsewhere |
| itemQueueMessage     | JSON          | A parsed item queue message from ItemSense                         |
| itemQueueConnected   | String        | The name of the queue the connector just connected to              |
| healthQueueMessage   | JSON          | A parsed health queue message from ItemSense                       |
| healthQueueConnected | String        | The name of the queue the connector just connected to              |
| amqpConnectionClosed | String        | AMQP connection closed                                             |
| error                | Error         | Error object                                                       |

## Same Process Event Handling

When a connector is in the same process, the event message will be the type defined in the [Events](#events) section.

```js
connector.on('itemQueueMessage', message => {
  typeof message; // object
  console.log(message);
  /*

  {"epc":"2017011308040A01102001F2","tagId":"","jobId":"a7a2a244-1444-4900-86e0-a5d47a91a849","fromZone":"ABSENT","fromFloor":null,"toZone":"ZONE_NAME","toFloor":null,"fromFacility":null,"toFacility":"FACILITY","fromX":null,"fromY":null,"toX":null,"toY":null,"observationTime":"2018-09-11T12:58:00.077Z"}
  
  */
});
```

## Child Process Event Handling

### Message Structure

```json
{
  "event": "some-event",
  "data": "some-event-data"
}
```

When a connector sends an event from a child process, the message will be an Object that has an `event` property and a `data` property. The `message.event` is a `String` and the `message.data` will be the type defined in the [Events](#events) section, depending on the event.

```js
connector.on('message', message => {
  typeof message; // object
  switch (message.event) {
    case 'itemQueueMessage':
      typeof message.data; // object
      console.log(message.data);
    /*

    {"epc":"2017011308040A01102001F2","tagId":"","jobId":"a7a2a244-1444-4900-86e0-a5d47a91a849","fromZone":"ABSENT","fromFloor":null,"toZone":"ZONE_NAME","toFloor":null,"fromFacility":null,"toFacility":"FACILITY","fromX":null,"fromY":null,"toX":null,"toY":null,"observationTime":"2018-09-11T12:58:00.077Z"}
    
    */
  }
});
```

## ItemSense Queue Issue

Up to the latest ItemSense release at this time, 2018r2, there is an issue where the queues persist when the ItemSense server reboots, but if you connect to a queue that was created prior to the reboot you will not receive any messages. Impinj is aware of the issue, so it should be fixed in a future release.

In order for this module to provide a reliable solution for connecting to ItemSense queues, the connectors will create a new queue anytime an AMQP error occurs. Unfortunately, this means that the if there is a network interruption between the connector and the ItemSense server, but ItemSense is still generating queue messages, you will not reconnect to the same queue. This means queue messages could be missed when there are network interruptions. Since there is no way for a connector to tell when it connects to a 'dead' queue, it's safer to connect to a new queue.

If you have other means of determining whether your ItemSense server was rebooted or if the network connection was just interrupted, then you may want to listen for the `amqpConnectionError` event, `shutdown` your connector manually, and then `start` the connector up again with the same options that include the existing `queue`. Otherwise just let the connector recover itself.

## To Do

- All caught up.
