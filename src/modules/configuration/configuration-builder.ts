import path from 'path';
import { readFileSync } from 'fs';
import { Configuration } from './configuration.js';

export class ConfigurationBuilder {
  protected data = new Map<string, any>();
  
  addJSONFile(jsonFilePath: string) {
    const resolvedPath = path.resolve(jsonFilePath);
    const jsonStr = readFileSync(resolvedPath, 'utf8');
    const json = JSON.parse(jsonStr);
    const jsonKeys = Object.getOwnPropertyNames(json);
    for (const jsonKey of jsonKeys) {
      if (this.data.has(jsonKey)) {
        throw new Error(`Configuration key '${jsonKey}' is already defined.`);
      };
      this.data.set(jsonKey, json[jsonKey]);
    };
  };

  build() {
    const dirs = this.data.get('dirs');
    if (!dirs) {
      throw new Error(`Expected 'dirs' to be specified in the configuration data.`);
    } else if (!dirs.bot) {
      throw new Error(`Expected 'dirs.bot' to be specified in the configuration data.`);
    };

    if (!dirs.logs) {
      dirs.logs = path.join(dirs.bot, 'logs');
    };
    if (!dirs.scenario) {
      dirs.scenario = path.join(dirs.bot, 'scenarios');
    };
    if (!dirs.plugin) {
      dirs.plugin = path.join(dirs.bot, 'plugins');
    };
    if (!dirs.server) {
      dirs.server = path.join(dirs.bot, 'servers');
    };
    if (!dirs.build) {
      dirs.build = path.join(dirs.bot, 'servers/builds');
    };
    return new Configuration(this.data);
  };
};