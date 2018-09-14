const request = require('http').request;

module.exports = {
  putJSON: function(options, data) {
    let payload = typeof data === 'object' ? JSON.stringify(data) : '';

    options.method = 'PUT';
    options.headers = {
      'Content-Type': 'application/json'
    };

    return new Promise((resolve, reject) => {
      let body = [];

      let req = request(options, res => {
        res.setEncoding('utf8');

        res.on('data', chunk => {
          body.push(chunk);
        });

        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`statusCode=${res.statusCode}`));
          }
          try {
            resolve(JSON.parse(body.join('')));
          } catch (err) {
            reject(err);
          }
        });

        req.on('error', err => {
          console.log('request error', err);
          reject(err);
        });
      });

      req.write(payload);

      req.end();
    });
  }
};
