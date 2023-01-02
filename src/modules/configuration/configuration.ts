export class Configuration {
  private static readonly dirsKey = 'dirs';

  protected data: Map<string, any>;

  constructor(data: Map<string, any>) {
    this.data = data;
  };

  getValue<T>(key: string) {
    const val = this.data.get(key);
    if (val) {
      return val as T;
    };
    throw new Error(`Specified key '${key}' is not defined in the configuration.`);
  };

  getDirectoryPath(key: string) {
    const dirs = this.getValue<any>(Configuration.dirsKey);
    if (dirs[key]) {
      return dirs[key] as string;
    } else {
      throw new Error(`Specified directory name '${key}' is not defined in the configuration.`);
    };
  };
};