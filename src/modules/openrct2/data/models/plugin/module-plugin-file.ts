import { 
  readFile,
  writeFile
} from 'fs/promises';
import { PluginFile } from './plugin-file.js';

/** Represents a custom OpenRCT2 plugin file developed for this module. */
export class ModulePluginFile extends PluginFile {
  constructor(path: string) { super(path); };

  /**
   * Applies variable values for an applicable plugin.
   * Variables must be declared with a ...Variables class with static fields representing the plugin's variables.
   * The ...Variables class must be declared near the beginning of the plugin file.
   * 
   * ```js
   * class PluginVariables {
   *   public static readonly pluginName = 'Plugin Name';
   *   public static readonly someVariable = 'test';
   * };
   * ...
   * function pluginStartup() {...}
   * ```
   * 
   * @async
   * @param keyValues An array of key-value pairs to set the current global variables in a plugin file.
   */
  async setGlobalVariables(...keyValues: [string, any][]) {
    const fileData = await readFile(this.path, 'utf8');
    const fileDataLines = fileData.split('\n');

    for (const [index, line] of fileDataLines.entries()) {
      if (line.includes('Variables.')) {
        const applicableKeyValue = keyValues.find(keyValue => line.includes(`Variables.${keyValue[0]} =`))
        if (applicableKeyValue) {
          const value = typeof keyValues[1] === 'string' ? `'${applicableKeyValue[1]}'` : JSON.stringify(applicableKeyValue[1]);
          const newLine = line.replace(
            new RegExp(`Variables.${applicableKeyValue[0]}\\s*\\=.+;`),
            `Variables.${applicableKeyValue[0]} = ${value};`
          );
          fileDataLines[index] = newLine;
        };
      } else if (line.includes('return ')) {
        break;
      };
    };

    await writeFile(this.path, fileDataLines.join('\n'), 'utf8');
  };
};