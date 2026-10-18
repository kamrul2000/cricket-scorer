// Team details (description, logo, captain), lineup validation, substitutes, and logos in backups.
import { parseBackup } from '../src/backup/backupFormat';
import { migrate } from '../src/data/migrations';
import { createRepositories } from '../src/data/repositories';
import type { MatchSetup } from '../src/domain/match';
import { validateMatchSetup } from '../src/domain/setupValidation';
import { createBackupService } from '../src/services/backupService';
import { createMatchService } from '../src/services/matchService';
import { makeSetup, out, TestMatch } from './helpers/matchBuilder';
import { memoryLogoFiles } from './helpers/memoryLogoFiles';
import { createTestDatabase, testDeps } from './helpers/testDatabase';

async function app() {
  const db = createTestDatabase();
  await migrate(db);
  const repos = createRepositories(db, testDeps());
  const logos = memoryLogoFiles();
  const backups = createBackupService(repos.backups, { appVersion: '1.0.0', now: () => new Date(Date.UTC(2026, 9, 18)), logos });
  const matches = createMatchService(repos.matches);
  const ps = await Promise.all(['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map((n) => repos.players.create(n)));
  return { db, repos, logos, backups, matches, ps };
}

describe('team details', () => {
  it('saves description, logo, captain and vice-captain', async () => {
    const { repos, ps } = await app();
    const team = await repos.teams.create('Tigers', [ps[0].id, ps[1].id], {
      description: '  Saturday side  ',
      logoFile: 'logo-abc.png',
      captainId: ps[0].id,
      viceCaptainId: ps[1].id,
    });
    expect(team).toMatchObject({ description: 'Saturday side', logoFile: 'logo-abc.png', captainId: ps[0].id, viceCaptainId: ps[1].id });
    expect(await repos.teams.logoFilesInUse()).toEqual(['logo-abc.png']);
  });

  it('rejects a captain who is not on the roster, the same player as both, and a long description', async () => {
    const { repos, ps } = await app();
    const base = { description: '', logoFile: null, captainId: null, viceCaptainId: null };
    await expect(repos.teams.create('A', [ps[0].id], { ...base, captainId: ps[2].id })).rejects.toThrow(/captain must be on the team roster/);
    await expect(repos.teams.create('B', [ps[0].id], { ...base, captainId: ps[0].id, viceCaptainId: ps[0].id })).rejects.toThrow(
      /must be different/,
    );
    await expect(repos.teams.create('C', [], { ...base, description: 'x'.repeat(301) })).rejects.toThrow(/300 characters/);
  });

  it('keeps details when updated without them, but refuses to drop the captain from the roster', async () => {
    const { repos, ps } = await app();
    const t = await repos.teams.create('Tigers', [ps[0].id, ps[1].id], {
      description: 'd',
      logoFile: null,
      captainId: ps[0].id,
      viceCaptainId: null,
    });
    const renamed = await repos.teams.update(t.id, 'Tigers XI', [ps[0].id, ps[1].id, ps[2].id]);
    expect(renamed).toMatchObject({ name: 'Tigers XI', description: 'd', captainId: ps[0].id });
    await expect(repos.teams.update(t.id, 'Tigers XI', [ps[1].id])).rejects.toThrow(/captain must be on the team roster/);
  });
});

describe('lineups, captains and substitutes', () => {
  const withExtras = (patch: (s: MatchSetup) => void) => {
    const s = makeSetup({ playersPerSide: 3 });
    patch(s);
    return validateMatchSetup(s);
  };

  it('accepts substitutes and leaders from the playing lineup', () => {
    expect(
      withExtras((s) => {
        s.teams[0].substitutes = [{ playerId: 'a9', name: 'A9' }];
        s.teams[0].captainId = 'a1';
        s.teams[0].viceCaptainId = 'a2';
      }),
    ).toEqual([]);
  });

  it('rejects duplicate entries across lineups and substitutes', () => {
    expect(withExtras((s) => (s.teams[0].substitutes = [{ playerId: 'a1', name: 'A1' }])).join()).toMatch(/selected more than once/);
    expect(withExtras((s) => (s.teams[1].substitutes = [{ playerId: 'a2', name: 'A2' }])).join()).toMatch(/selected more than once/);
    expect(withExtras((s) => (s.teams[1].players[0] = { playerId: 'a1', name: 'A1' })).join()).toMatch(/selected more than once/);
  });

  it('rejects a captain outside the playing lineup, or one person as captain and vice-captain', () => {
    expect(withExtras((s) => (s.teams[0].captainId = 'a9')).join()).toMatch(/must be in the playing lineup/);
    expect(withExtras((s) => {
      s.teams[0].captainId = 'a1';
      s.teams[0].viceCaptainId = 'a1';
    }).join()).toMatch(/must be different/);
  });

  it('substitutes cannot bat, bowl or field', () => {
    const s = makeSetup({ playersPerSide: 3 });
    s.teams[0].substitutes = [{ playerId: 'a9', name: 'A9' }];
    s.teams[1].substitutes = [{ playerId: 'b9', name: 'B9' }];
    const m = new TestMatch(s);
    expect(m.rejectionOf({ type: 'inningsStart', strikerId: 'a9', nonStrikerId: 'a1', bowlerId: 'b1' })).toMatch(/lineup/);
    expect(m.rejectionOf({ type: 'inningsStart', strikerId: 'a1', nonStrikerId: 'a2', bowlerId: 'b9' })).toMatch(/lineup/);
    m.start('a1', 'a2', 'b1');
    expect(m.rejection({ dismissal: out.caught('b9') })).toMatch(/fielder must be in the fielding team lineup/);
    m.ball({ dismissal: out.bowled() });
    expect(m.rejectionOf({ type: 'newBatter', playerId: 'a9' })).toMatch(/lineup/);
  });

  it('the match snapshot keeps substitutes and roles, separately from the playing lineup', async () => {
    const { repos, matches, ps } = await app();
    const tA = await repos.teams.create('A', [ps[0].id, ps[1].id, ps[2].id]);
    const tB = await repos.teams.create('B', [ps[3].id, ps[4].id, ps[5].id]);
    const p = (i: number) => ({ playerId: ps[i].id, name: ps[i].name });
    const setup: MatchSetup = {
      rules: { oversPerInnings: 1, playersPerSide: 2, freeHitAfterNoBall: true, maxOversPerBowler: null },
      teams: [
        { teamId: tA.id, name: 'A', players: [p(0), p(1)], substitutes: [p(2)], captainId: ps[1].id, viceCaptainId: ps[0].id },
        { teamId: tB.id, name: 'B', players: [p(3), p(4)], substitutes: [p(5)] },
      ],
      toss: { winnerTeamId: tA.id, decision: 'bat' },
    };
    const id = await matches.startMatch(setup, { strikerId: ps[0].id, nonStrikerId: ps[1].id, bowlerId: ps[3].id });
    const loaded = (await matches.loadMatch(id))!;
    expect(loaded.setup).toEqual(setup);
    expect(loaded.state.innings[0].battingTeam.players).toHaveLength(2);
  });
});

describe('logos in backups', () => {
  const PNG = 'iVBORw0KGgo='; // any valid base64 will do for the tests

  it('backs up and restores team logos with the data, and removes logos no team uses', async () => {
    const source = await app();
    source.logos.files.set('logo-1.png', PNG);
    await source.repos.teams.create('Tigers', [], { description: '', logoFile: 'logo-1.png', captainId: null, viceCaptainId: null });
    const { json, missingLogos } = await source.backups.createBackup();
    expect(missingLogos).toBe(0);
    expect(JSON.parse(json).files.logos).toEqual({ 'logo-1.png': PNG });

    const target = await app();
    target.logos.files.set('logo-old.png', 'AAAA'); // an old logo, about to become unused
    const preview = await target.backups.previewRestore(json);
    if (!preview.ok) throw new Error(preview.errors.join('\n'));
    await target.backups.restore(preview.backup);
    expect([...target.logos.files.entries()]).toEqual([['logo-1.png', PNG]]);
    expect((await target.repos.teams.list())[0].logoFile).toBe('logo-1.png');
  });

  it('a logo missing on the phone is backed up as "no logo", and Check stored data reports it', async () => {
    const a = await app();
    await a.repos.teams.create('Tigers', [], { description: '', logoFile: 'logo-gone.png', captainId: null, viceCaptainId: null });
    expect((await a.backups.checkData()).problems).toEqual(['The logo image of team "Tigers" is missing.']);
    const { json, missingLogos } = await a.backups.createBackup();
    expect(missingLogos).toBe(1);
    expect(JSON.parse(json).data.teams[0].logo_file).toBeNull();
  });

  it('rejects a backup whose logo is missing, damaged or has an unsafe name', async () => {
    const a = await app();
    a.logos.files.set('logo-1.png', PNG);
    await a.repos.teams.create('Tigers', [], { description: '', logoFile: 'logo-1.png', captainId: null, viceCaptainId: null });
    const file = JSON.parse((await a.backups.createBackup()).json);

    const missing = structuredClone(file);
    missing.files.logos = {};
    expect(parseBackup(JSON.stringify(missing))).toMatchObject({ ok: false, errors: [expect.stringMatching(/logo of team "Tigers" is missing/)] });

    const damaged = structuredClone(file);
    damaged.files.logos['logo-1.png'] = 'not base64!';
    expect(parseBackup(JSON.stringify(damaged))).toMatchObject({ ok: false, errors: [expect.stringMatching(/damaged/)] });

    const unsafe = structuredClone(file);
    unsafe.files.logos['../../evil.png'] = PNG;
    expect(parseBackup(JSON.stringify(unsafe))).toMatchObject({ ok: false, errors: [expect.stringMatching(/invalid file name/)] });

    const badRef = structuredClone(file);
    badRef.data.teams[0].logo_file = '../x.png';
    expect(parseBackup(JSON.stringify(badRef)).ok).toBe(false);
  });

  it('rejects a backup whose captain is not on the roster', async () => {
    const a = await app();
    const t = await a.repos.teams.create('Tigers', [a.ps[0].id], {
      description: '',
      logoFile: null,
      captainId: a.ps[0].id,
      viceCaptainId: null,
    });
    const file = JSON.parse((await a.backups.createBackup()).json);
    file.data.teams.find((x: { id: string }) => x.id === t.id).captain_id = a.ps[3].id;
    expect(parseBackup(JSON.stringify(file))).toMatchObject({ ok: false, errors: [expect.stringMatching(/captain must be on the team roster/)] });
  });
});
