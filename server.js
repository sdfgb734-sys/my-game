const http = require('http');
const fs = require('fs');
const path = require('path');

const host = '0.0.0.0';
const port = Number(process.env.PORT || 3000);
const rootDir = __dirname;

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function safeResolve(urlPath) {
  const normalizedPath = path.normalize(decodeURIComponent(urlPath)).replace(/^([.][.][/\\])+/, '');
  const targetPath = normalizedPath === '/' ? '/index.html' : normalizedPath;
  return path.join(rootDir, targetPath);
}

function sendFile(filePath, response) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500, {
        'Content-Type': 'text/plain; charset=utf-8',
      });
      response.end(error.code === 'ENOENT' ? '404 Not Found' : '500 Internal Server Error');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      'Content-Type': contentTypes[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    response.end(data);
  });
}

const server = http.createServer((request, response) => {
  const requestPath = request.url.split('?')[0];
  const filePath = safeResolve(requestPath);

  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isDirectory()) {
      sendFile(path.join(filePath, 'index.html'), response);
      return;
    }

    sendFile(filePath, response);
  });
});

server.listen(port, host, () => {
  console.log(`Personal Walk ETA Lab running at http://127.0.0.1:${port}`);
});
