'use strict';

const childProcess = require('child_process');

let ItemSenseConnector = require('../lib/itemsense-queue-connector');
let childProcessConnector = childProcess.fork('./');

const HOST = process.env.HOST;
const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;
const QUEUE = process.env.QUEUE || '';

if (!HOST || !USERNAME || !PASSWORD) {
  throw new Error(
    'You will need to set the HOST, USERNAME, PASSWORD, and (optional) QUEUE environment variables before running this test'
  );
}

let sameProcessConnectorOptions = ItemSenseConnector.createOptions({
  id: 'Same Process',
  host: HOST,
  username: USERNAME,
  password: PASSWORD,
  queue: QUEUE,
  maxObservationTimeDelta: 30000
});

console.log(
  `Same Process Connector Options\n${JSON.stringify(
    sameProcessConnectorOptions
  )}\n`
);

const sameProcessConnector = ItemSenseConnector.createConnector();
sameProcessConnector.start(sameProcessConnectorOptions);
sameProcessConnector.on(ItemSenseConnector.event.queueConnect, message => {
  console.log(message);
});
sameProcessConnector.on(
  ItemSenseConnector.event.amqpConnectionClosed,
  message => {
    console.log('Same Process', message);
  }
);
sameProcessConnector.on(ItemSenseConnector.event.queueConnected, message => {
  console.log('Same Process', message);
});
sameProcessConnector.on(ItemSenseConnector.event.itemQueueMessage, message => {
  console.log('Same Process', message);
});

const childProcessOptions = ItemSenseConnector.createOptions({
  id: 'Child Process',
  host: HOST,
  username: USERNAME,
  password: PASSWORD,
  queue: '',
  ignoreAbsent: true
});

console.log(
  `Child Process Connector Options\n${JSON.stringify(childProcessOptions)}\n`
);
childProcessConnector.on('message', message => {
  console.log('Child Process', message);
});
childProcessConnector.send({
  command: 'start',
  options: childProcessOptions
});

setTimeout(() => {
  childProcessConnector.send({ command: 'shutdown' });
  sameProcessConnector.shutdown();

  setTimeout(() => {
    process.exit(0);
  }, 5000);
}, 300000);
