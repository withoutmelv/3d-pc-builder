export function middleware(app) {
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
  });
}
