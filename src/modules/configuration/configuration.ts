type BotConfigurationDirectoryName =
  | 'bot'
  | 'build'
  | 'logs'
  | 'plugin'
  | 'scenario'
  | 'server'

export class Configuration {
  constructor(protected data: Map<string, any>) {
    this.data = data;
  };

  get botDirPath() {
    return  this.getDirectoryPath('bot');
  };

  get buildDirPath() {
    return this.getDirectoryPath('build');
  };

  get logsDirPath() {
    return this.getDirectoryPath('logs');
  };

  get pluginDirPath() {
    return this.getDirectoryPath('plugin');
  };

  get scenarioDirPath() {
    return this.getDirectoryPath('scenario');
  };

  get serverDirPath() {
    return this.getDirectoryPath('server');
  };

  get rct2GamePath() {
    return this.getValue<string>('rct2GamePath');
  };

  get ipAddress() {
    return this.getValue<string>('ipAddress');
  };

  getValue<T>(key: string) {
    const val = this.data.get(key);
    if (val) {
      return val as T;
    };
    throw new Error(`Specified key '${key}' is not defined in the configuration.`);
  };

  private getDirectoryPath(name: BotConfigurationDirectoryName) {
    const dirs = this.getValue<{ [dirName: string]: string }>('dirs');
    return dirs[name];
  };
};