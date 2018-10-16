const request = require('http').request;

const REQUEST_TIMEOUT = 5000;

/**
 *
 * @param {*} connectorOptions  - hostname: String, port: Number, username: String, password: String
 * @returns {Promise}
 */
function isServerAvailable(connectorOptions) {
  return new Promise((resolve, reject) => {
    const { hostname, port, username, password } = connectorOptions;

    let options = {
      hostname,
      port,
      path: '/itemsense/data/v1/items/show?pageSize=1',
      method: 'GET',
      auth: `${username}:${password}`,
      headers: {
        Accept: 'application/json'
      }
    };

    let req = request(options, res => {
      let body = [];

      res.setEncoding('utf8');

      res.on('end', () => {
        if (res.statusCode === 401) {
          return reject('Unauthorized - check username and password');
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(`Server returned status code ${res.statusCode}`);
        }

        resolve(JSON.parse(body.join('')));
      });

      res.on('data', chunk => {
        body.push(chunk);
      });
    });

    req.setTimeout(REQUEST_TIMEOUT, () => {
      reject('Server connection timeout');
    });

    req.on('error', err => {
      reject(err.message);
    });

    req.end();
  });
}

/**
 *
 * @param {*} connectorOptions - hostname: String, port: Number, username: String, password: String, itemQueueFilter: Object
 * @returns {Promise}
 */
function createItemQueue(connectorOptions) {
  return new Promise((resolve, reject) => {
    const {
      hostname,
      port,
      username,
      password,
      itemQueueFilter
    } = connectorOptions;
    const payload =
      typeof itemQueueFilter === 'object'
        ? JSON.stringify(itemQueueFilter)
        : '{}';

    let options = {
      hostname,
      port,
      path: '/itemsense/data/v1/items/queues',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      auth: `${username}:${password}`
    };

    let req = request(options, res => {
      let body = [];
      res.setEncoding('utf8');

      res.on('data', chunk => {
        body.push(chunk);
      });

      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(`Server responded with status code ${res.statusCode}`);
        }

        try {
          resolve(JSON.parse(body.join('')));
        } catch (err) {
          reject(err);
        }
      });
    });

    req.setTimeout(REQUEST_TIMEOUT, () => {
      reject('Server connection timeout');
    });

    req.on('error', err => {
      reject(err.message);
    });

    req.write(payload);

    req.end();
  });
}

/**
 *
 * @param {*} connectorOptions - hostname: String, port: Number, username: String, password: String, itemQueueFilter: Object
 * @returns {Promise}
 */
function createHealthQueue(connectorOptions) {
  return new Promise((resolve, reject) => {
    const { hostname, port, username, password } = connectorOptions;
    const payload = '{}';

    let options = {
      hostname,
      port,
      path: '/itemsense/health/v1/events/queues',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      auth: `${username}:${password}`
    };

    let req = request(options, res => {
      let body = [];
      res.setEncoding('utf8');

      res.on('data', chunk => {
        body.push(chunk);
      });

      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(`Server responded with status code ${res.statusCode}`);
        }

        try {
          resolve(JSON.parse(body.join('')));
        } catch (err) {
          reject(err);
        }
      });
    });

    req.setTimeout(REQUEST_TIMEOUT, () => {
      reject('Server connection timeout');
    });

    req.on('error', err => {
      reject(err.message);
    });

    req.write(payload);

    req.end();
  });
}

module.exports = {
  createItemQueue,
  createHealthQueue,
  isServerAvailable
};
