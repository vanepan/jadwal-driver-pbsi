const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const types = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

http.createServer((req, res) => {
  let url = (req.url || '/').split('?')[0];
  if (url === '/') url = '/index.html';

  const file = path.join(root, url);
  fs.readFile(file, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }

    res.setHeader('Content-Type', types[path.extname(file)] || 'text/plain');
    res.end(data);
  });
}).listen(8000, () => {
  console.log('Static server running on http://localhost:8000');
});
