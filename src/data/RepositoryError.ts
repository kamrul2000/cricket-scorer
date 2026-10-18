/** Errors the user can understand and fix. Screens show `message` directly. */
export type RepositoryErrorCode =
  | 'INVALID_NAME'
  | 'DUPLICATE_NAME'
  | 'NOT_FOUND'
  | 'ARCHIVED'
  | 'INVALID_ROSTER'
  /** The stored data changed since it was read (e.g. a duplicate submission). */
  | 'CONFLICT'
  /** Stored data is inconsistent and cannot be used safely. */
  | 'DAMAGED';

export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;
  constructor(code: RepositoryErrorCode, message: string) {
    super(message);
    this.name = 'RepositoryError';
    this.code = code;
  }
}
