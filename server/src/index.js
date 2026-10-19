import { createApp } from './app.js';
const app = createApp({ logger: true, serveWeb: process.env.NODE_ENV === 'production' });
try {
  await app.listen({
    port: Number(process.env.PORT || 3001),
    host: process.env.HOST || '127.0.0.1',
  });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
