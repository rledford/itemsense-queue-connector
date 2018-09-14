const request = require('http').request;

/**
 *
 * @param {*} connectorOptions  - host: String, port: Number, username: String, password: String
 * @returns {Promise}
 */
function isServerAvailable(connectorOptions) {
  return new Promise((resolve, reject) => {
    const { host, port, username, password } = connectorOptions;

    let options = {
      hostname: host,
      port: port,
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

        resolve(body.join(''));
      });

      res.on('data', chunk => {
        body.push(chunk);
      });
    });

    req.setTimeout(5000, () => {
      reject('Server connection timeout');
    });

    req.on('error', err => {
      reject(err);
    });

    req.end();
  });
}

/**
 *
 * @param {*} connectorOptions - host: String, port: Number, username: String, password: String, queueFilter: Object
 * @returns {Promise}
 */
function createItemQueue(connectorOptions) {
  return new Promise((resolve, reject) => {
    const { host, port, username, password, queueFilter } = connectorOptions;
    const payload =
      typeof queueFilter === 'object' ? JSON.stringify(queueFilter) : '{}';

    let options = {
      hostname: host,
      port: port,
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

    req.setTimeout(5000, () => {
      reject('Server connection timeout');
    });

    req.on('error', err => {
      reject(err);
    });

    req.write(payload);

    req.end();
  });
}

module.exports = {
  createItemQueue,
  isServerAvailable
};
