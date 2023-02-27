export interface Flag {};

export class FlagManager<T extends Flag> {
  private readonly activeFlags = new Map<string, unknown>();

  getFlagValue<K extends keyof T>(id: number, flag: K) {
    const flagValue = this.activeFlags.get(`${id}.${String(flag)}`);
    if (flagValue) {
      return flagValue as T[K];
    };
  };

  getFlagsForId(id: number) {
    const flagValues = Array.from(this.activeFlags.entries());
    const idFlagValues = flagValues.filter(flagValue => flagValue[0].startsWith(`${id}.`));
    return idFlagValues.map(
      idFlagValue => [idFlagValue[0].substring(idFlagValue[0].indexOf('.') + 1), idFlagValue[1]] as [keyof T, T[keyof T]]
    );
  };

  setFlag<K extends keyof T>(id: number, flag: K, value?: T[K]) {
    if (this.activeFlags.has(`${id}.${String(flag)}`)) {
      throw new Error(`Process ${id} '${String(flag)}' is already active.`);
    };
    this.activeFlags.set(`${id}.${String(flag)}`, value);
  };

  trySetFlag<K extends keyof T>(id: number, flag: K, value?: T[K]) {
    try {
      this.setFlag(id, flag, value);
      return true;
    } catch {
      return false;
    };
  };

  deleteFlag<K extends keyof T>(id: number, flag: K) {
    return this.activeFlags.delete(`${id}.${String(flag)}`);
  };

  hasFlag<K extends keyof T>(id: number, flag: K) {
    return this.activeFlags.has(`${id}.${String(flag)}`);
  };
};