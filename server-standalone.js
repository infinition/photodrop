const { startServer } = require('./server');

const port = Number(process.env.PORT) || 3456;

startServer(port).then(() => {
  console.log(`PhotoDrop standalone server running on http://localhost:${port}`);
}).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
