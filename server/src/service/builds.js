import { upgradeModelState } from '../../../shared/model-state.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError } from '../errors/index.js';
import { checkBuild } from './compatibility.js';
import { listParts } from './parts.js';
import { validateRoomSelection } from '../../../shared/room.js';
import { validateAssembly } from '../../../shared/assembly.js';
export function createBuildService(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(
    'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS builds (id TEXT PRIMARY KEY, name TEXT NOT NULL, selection TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, assembly TEXT)',
  );
  if (
    !db
      .prepare('PRAGMA table_info(builds)')
      .all()
      .some((column) => column.name === 'assembly')
  ) {
    db.exec('ALTER TABLE builds ADD COLUMN assembly TEXT');
  }
  const decode = (row) => ({
    ...row,
    selection: JSON.parse(row.selection),
    assembly: upgradeModelState(
      row.assembly ? JSON.parse(row.assembly) : null,
      JSON.parse(row.selection),
    ),
  });
  const get = (id) => {
    const row = db.prepare('SELECT * FROM builds WHERE id = ?').get(id);
    if (!row) throw new AppError('BUILD_NOT_FOUND');
    return decode(row);
  };
  return {
    list: () => db.prepare('SELECT * FROM builds ORDER BY updatedAt DESC').all().map(decode),
    get,
    save: ({ name, selection, assembly }, id) => {
      const compatibility = checkBuild(selection);
      const existing = id ? get(id) : null;
      const progress = assembly === undefined ? (existing?.assembly ?? null) : assembly;
      if (progress !== null) {
        const required = ['case', 'motherboard', 'cpu', 'memory'];
        if (progress.cooling !== undefined) required.push('cooler');
        if (!progress.room && required.some((category) => !selection[category]))
          throw new AppError('VALIDATION_ERROR', '请先选齐主板、CPU、内存、散热器和机箱');
        if (!progress.room && compatibility.conflicts)
          throw new AppError(
            'VALIDATION_ERROR',
            compatibility.checks
              .filter((c) => c.status === 'conflict')
              .map((c) => c.message)
              .join(' '),
          );
        if (
          existing?.assembly &&
          !progress.room &&
          Object.keys({ ...existing.selection, ...selection }).some(
            (key) => existing.selection[key] !== selection[key],
          )
        )
          throw new AppError('VALIDATION_ERROR', '更换配件请先进入房间配件区');
        for (const category of ['storage', 'gpu', 'psu']) {
          if (Boolean(selection[category]) !== Boolean(progress.layout?.[category]))
            throw new AppError('VALIDATION_ERROR', '配件清单与工作台物品不一致');
        }
        try {
          validateAssembly(progress);
          validateRoomSelection(progress, selection, listParts());
        } catch (error) {
          throw new AppError('VALIDATION_ERROR', error.message);
        }
      }
      const now = new Date().toISOString();
      const build = {
        id: id || randomUUID(),
        name: name.trim(),
        selection,
        assembly: progress,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      db.prepare(
        'INSERT INTO builds (id, name, selection, createdAt, updatedAt, assembly) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, selection=excluded.selection, updatedAt=excluded.updatedAt, assembly=excluded.assembly',
      ).run(
        build.id,
        build.name,
        JSON.stringify(selection),
        build.createdAt,
        now,
        progress === null ? null : JSON.stringify(progress),
      );
      return build;
    },
    remove: (id) => {
      get(id);
      db.prepare('DELETE FROM builds WHERE id = ?').run(id);
      return { id };
    },
    close: () => db.close(),
  };
}
