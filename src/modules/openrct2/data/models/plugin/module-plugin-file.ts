import { 
  readFile,
  writeFile
} from 'fs/promises';
import { PluginFile } from '@modules/openrct2/data/models';

/** Represents a custom OpenRCT2 plugin file developed for this module. */
export class ModulePluginFile extends PluginFile {
  constructor(path: string) { super(path); };

  /**
   * Applies global variable values for an applicable plugin.
   * Global variables must be declared at the very beginning of a valid plugin file.
   * 
   * ```js
   * var globalVariable = 'value';
   * var globalVariable2 = false;
   * ...
   * function pluginMain() {...}
   * ```
   * 
   * @async
   * @param keyValues An array of key-value pairs to set the current global variables in a plugin file.
   */
  async setGlobalVariables(...keyValues: [string, any][]) {
    const fileData = await readFile(this.path, 'utf8');
    const fileDataLines = fileData.split('\n');

    for (const [index, line] of fileDataLines.entries()) {
      if (line.startsWith('var ')) {
        const applicableKeyValue = keyValues.find(keyValue => line.startsWith(`var ${keyValue[0]} =`))
        if (applicableKeyValue) {
          const value = typeof keyValues[1] === 'string' ? `'${applicableKeyValue[1]}'` : JSON.stringify(applicableKeyValue[1]);
          fileDataLines[index] = `var ${applicableKeyValue[0]} = ${value};`;
        };
      } else {
        break;
      };
    };

    await writeFile(this.path, fileDataLines.join('\n'), 'utf8');
  };
};