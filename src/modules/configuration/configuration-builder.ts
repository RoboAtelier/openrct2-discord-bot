import path from 'path';
import { readFileSync } from 'fs';
import { Configuration } from '.';

export class ConfigurationBuilder {
  private data = new Map<string, any>();
  
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
    return new Configuration(this.data);
  };
};