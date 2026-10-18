import { createBackupRepository } from './backupRepository';
import type { Database } from './database';
import type { RepositoryDeps } from './deps';
import { createMatchRepository } from './matchRepository';
import { createPlayerRepository } from './playerRepository';
import { createScheduleRepository } from './scheduleRepository';
import { createTeamRepository } from './teamRepository';

export function createRepositories(db: Database, deps: RepositoryDeps) {
  return {
    players: createPlayerRepository(db, deps),
    teams: createTeamRepository(db, deps),
    matches: createMatchRepository(db, deps),
    schedules: createScheduleRepository(db, deps),
    backups: createBackupRepository(db),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
