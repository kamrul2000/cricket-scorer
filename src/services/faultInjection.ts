/**
 * Developer testing aid (shown in Settings only in development builds): the next save (a
 * scoring action or a restore) fails inside its transaction, after writing, so you can see the
 * error handling and confirm that nothing partial is stored.
 */
export const faultInjection = { failNextSave: false };

/** Reads and clears the flag, returning the repository write options for one save. */
export function takeFault() {
  const fail = faultInjection.failNextSave;
  faultInjection.failNextSave = false;
  return { failBeforeCommit: fail };
}
