import { controllers } from '../controller/index.js';
import { categories } from '../service/parts.js';
const id = { type: 'string', minLength: 1, maxLength: 100 };
const params = {
  type: 'object',
  required: ['id'],
  properties: { id },
  additionalProperties: false,
};
const selection = {
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(categories.map((c) => [c, id])),
};
const checkBody = {
  type: 'object',
  required: ['selection'],
  properties: { selection },
  additionalProperties: false,
};
const buildBody = {
  type: 'object',
  required: ['name', 'selection'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 80, pattern: '\\S' },
    selection,
    assembly: { anyOf: [{ type: 'object' }, { type: 'null' }] },
  },
  additionalProperties: false,
};
export function routes(app, builds) {
  const c = controllers(builds);
  app.get(
    '/api/parts',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: categories },
            q: { type: 'string', maxLength: 100 },
          },
          additionalProperties: false,
        },
      },
    },
    c.parts,
  );
  app.get('/api/parts/:id', { schema: { params } }, c.part);
  app.post('/api/builds/check', { schema: { body: checkBody } }, c.check);
  app.get('/api/builds', c.list);
  app.post('/api/builds', { schema: { body: buildBody } }, c.create);
  app.get('/api/builds/:id', { schema: { params } }, c.get);
  app.put('/api/builds/:id', { schema: { params, body: buildBody } }, c.update);
  app.delete('/api/builds/:id', { schema: { params } }, c.remove);
}
