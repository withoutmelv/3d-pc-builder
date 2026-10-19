import { listParts, getPart } from '../service/parts.js';
import { checkBuild } from '../service/compatibility.js';
import { ok } from '../errors/index.js';
export function controllers(builds) {
  return {
    parts: async (req) => ok(listParts(req.query)),
    part: async (req) => ok(getPart(req.params.id)),
    check: async (req) => ok(checkBuild(req.body.selection)),
    list: async () => ok(builds.list()),
    get: async (req) => ok(builds.get(req.params.id)),
    create: async (req, reply) => reply.code(201).send(ok(builds.save(req.body))),
    update: async (req) => ok(builds.save(req.body, req.params.id)),
    remove: async (req) => ok(builds.remove(req.params.id)),
  };
}
