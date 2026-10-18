import { NAME_MAX_LENGTH, validateName } from '../src/domain/people';

describe('validateName', () => {
  it('trims and collapses whitespace', () => {
    expect(validateName('  Rahim   Uddin ', 'Player')).toEqual({ ok: true, value: 'Rahim Uddin' });
  });
  it('rejects empty and whitespace-only names', () => {
    expect(validateName('', 'Player').ok).toBe(false);
    expect(validateName('   ', 'Team').ok).toBe(false);
  });
  it('rejects names that are too long', () => {
    expect(validateName('a'.repeat(NAME_MAX_LENGTH), 'Player').ok).toBe(true);
    expect(validateName('a'.repeat(NAME_MAX_LENGTH + 1), 'Player').ok).toBe(false);
  });
});
