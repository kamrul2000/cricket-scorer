/** Things repositories need from the outside world; tests supply predictable versions. */
export interface RepositoryDeps {
  newId(): string;
  /** Current time as an ISO 8601 string. */
  now(): string;
}
