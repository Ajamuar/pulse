export interface Source {
  /** Writes the user's new data into the normalized tables. `changed` is true when any row was inserted or updated. */
  pull(userId: number): Promise<{ changed: boolean }>;
}
