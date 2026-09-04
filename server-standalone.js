const { startServer } = require('./server');
startServer(3456).then(() => {
  console.log('PhotoDrop standalone server running on http://localhost:3456');
}).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
