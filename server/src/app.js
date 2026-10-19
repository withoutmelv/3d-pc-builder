import Fastify from 'fastify';
import serveStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { routes } from './router/index.js';
import { middleware } from './middleware/index.js';
import { createBuildService } from './service/builds.js';
import { errorHandler, errorCodes } from './errors/index.js';
export function createApp({
  dbPath = process.env.DB_PATH ||
    fileURLToPath(new URL('../storage/builds.sqlite', import.meta.url)),
  logger = false,
  serveWeb = false,
} = {}) {
  const app = Fastify({
    logger,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  const builds = createBuildService(dbPath);
  middleware(app);
  app.setErrorHandler(errorHandler);
  if (serveWeb) {
    app.register(serveStatic, {
      root: fileURLToPath(new URL('../../web/dist/', import.meta.url)),
    });
  }
  app.setNotFoundHandler((req, reply) => {
    const pathname = req.url.split('?')[0];
    if (
      serveWeb &&
      req.method === 'GET' &&
      (pathname === '/' ||
        pathname === '/builds' ||
        /^\/(?:builder|workbench)(?:\/[^/]+)?$/.test(pathname))
    ) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({
      code: 'ROUTE_NOT_FOUND',
      message: errorCodes.ROUTE_NOT_FOUND[1],
      data: null,
    });
  });
  routes(app, builds);
  app.addHook('onClose', async () => builds.close());
  return app;
}
