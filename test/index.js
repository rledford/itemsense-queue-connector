'use strict';

const childProcess = require('child_process');

let ItemSenseConnector = require('../lib/itemsense-queue-connector');
let childProcessConnector = childProcess.fork('./');

const HOSTNAME = process.env.HOSTNAME;
const PORT = parseInt(process.env.PORT) || 80;
const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;
const QUEUE = process.env.QUEUE || '';

if (!HOSTNAME || !USERNAME || !PASSWORD) {
  throw new Error(
    'You will need to set the HOSTNAME, USERNAME, PASSWORD, and (optional) QUEUE environment variables before running this test'
  );
}

let sameProcessConnectorOptions = ItemSenseConnector.createOptions({
  id: 'Same Process',
  hostname: HOSTNAME,
  port: PORT,
  username: USERNAME,
  password: PASSWORD,
  queue: QUEUE,
  maxObservationTimeDelta: 30000,
  connectionHeartbeatInterval: 5000
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
sameProcessConnector.on('info', message => {
  console.log('Same process info:', message);
});
sameProcessConnector.on('itemQueueMessage', message => {
  console.log('Same process item queue message', message);
});
sameProcessConnector.on('healthQueueMessage', message => {
  console.log('Same process health message:', message);
});
sameProcessConnector.on('itemQueueConnected', queue => {
  console.log(`Same process connected to item queue [ ${queue} ]`);
});
sameProcessConnector.on('thresholdQueueConnected', queue => {
  console.log(`Same process connected to threshold queueu [ ${queue} ]`);
});
sameProcessConnector.on('healthQueueConnected', queue => {
  console.log(`Same process connected to health queue [ ${queue} ]`);
});
sameProcessConnector.on('amqpConnectionClosed', message => {
  console.log('Same process AMQP connection closed');
});
sameProcessConnector.on('error', message => {
  console.log('Same process error:', message);
});

const childProcessOptions = ItemSenseConnector.createOptions({
  id: 'Child Process',
  name: 'Child Process',
  hostname: HOSTNAME,
  username: USERNAME,
  password: PASSWORD,
  queue: QUEUE,
  itemQueueFilter: {
    zoneTransitionsOnly: false
  },
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
