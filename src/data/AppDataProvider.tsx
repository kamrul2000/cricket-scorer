// Opens the database once, runs migrations, then gives screens access to repositories.
// Shows a loading screen meanwhile and a visible error (with Retry) if startup fails.
import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { ErrorView, LoadingView } from '../components/StateViews';
import { deviceLogoFiles } from '../files/logoFiles';
import { createBackupService, type BackupService } from '../services/backupService';
import { createMatchService, type MatchService } from '../services/matchService';
import { errorMessage } from '../utils/errors';
import { wrapExpoDatabase } from './database';
import { migrate } from './migrations';
import { createRepositories, type Repositories } from './repositories';

export const DATABASE_NAME = 'cricket-scorer.db';

interface AppData {
  repos: Repositories;
  matchService: MatchService;
  backupService: BackupService;
  schemaVersion: number;
}

const AppDataContext = createContext<AppData | null>(null);

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: AppData };

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let sqlite: SQLiteDatabase | null = null;

    (async () => {
      try {
        sqlite = await openDatabaseAsync(DATABASE_NAME);
        // WAL = safer/faster writes; foreign_keys must be enabled on every connection.
        await sqlite.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
        const db = wrapExpoDatabase(sqlite);
        const schemaVersion = await migrate(db);
        const repos = createRepositories(db, {
          newId: randomUUID,
          now: () => new Date().toISOString(),
        });
        const matchService = createMatchService(repos.matches);
        const backupService = createBackupService(repos.backups, {
          appVersion: Constants.expoConfig?.version ?? 'unknown',
          now: () => new Date(),
          logos: deviceLogoFiles,
        });
        if (!cancelled) setState({ status: 'ready', data: { repos, matchService, backupService, schemaVersion } });
      } catch (e) {
        if (!cancelled) setState({ status: 'error', message: errorMessage(e) });
      }
    })();

    return () => {
      cancelled = true;
      void sqlite?.closeAsync().catch(() => undefined);
    };
  }, [attempt]);

  if (state.status === 'loading') return <LoadingView label="Opening your data…" />;
  if (state.status === 'error') {
    return (
      <ErrorView
        title="Could not open the local database"
        message={state.message}
        onRetry={() => {
          setState({ status: 'loading' });
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  return <AppDataContext.Provider value={state.data}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used inside <AppDataProvider>.');
  return ctx;
}

export function useRepositories(): Repositories {
  return useAppData().repos;
}

export function useMatchService(): MatchService {
  return useAppData().matchService;
}

export function useBackupService(): BackupService {
  return useAppData().backupService;
}
