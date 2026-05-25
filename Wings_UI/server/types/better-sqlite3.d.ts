declare module "better-sqlite3" {
  namespace Database {
    interface RunResult {
      changes: number;
      lastInsertRowid: number | bigint;
    }

    interface Statement<BindParameters extends unknown[] = unknown[]> {
      get(...params: BindParameters): unknown;
      all(...params: BindParameters): unknown[];
      run(...params: BindParameters): RunResult;
      iterate(...params: BindParameters): IterableIterator<unknown>;
      pluck(toggle?: boolean): this;
    }

    interface Database {
      prepare<BindParameters extends unknown[] = unknown[]>(source: string): Statement<BindParameters>;
      exec(source: string): this;
      pragma(source: string, options?: { simple?: boolean }): unknown;
      transaction<T extends (...args: any[]) => any>(fn: T): T;
      close(): void;
    }
  }

  interface DatabaseConstructor {
    new (filename: string, options?: Record<string, unknown>): Database.Database;
    (filename: string, options?: Record<string, unknown>): Database.Database;
  }

  const Database: DatabaseConstructor;
  export = Database;
}
