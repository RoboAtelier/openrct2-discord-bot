import path from 'path';
import { Configuration } from '@modules/configuration/index.js';
import { 
  ConcurrentDirectory,
  FileSystemRepository,
  ConcurrentFile
} from '@modules/io/index.js';
import { OpenRCT2 } from '@modules/openrct2/index.js';
import { ModulePluginFile } from '@modules/openrct2/data/models/index.js';

/** Represents a data repository for this module's custom OpenRCT2 plugins. */
export class PluginRepository extends FileSystemRepository {
  private static readonly dirKey = 'plugin';

  private readonly pluginFiles = new Map<OpenRCT2.PluginFileName, ConcurrentFile>();

  protected readonly dataDir: ConcurrentDirectory;

  constructor(config: Configuration) {
    super(config);
    this.dataDir = new ConcurrentDirectory(config.pluginDirPath);

    const messagingPlugin = new ConcurrentFile(path.join(this.dataDir.path, OpenRCT2.PluginFileName.Messaging));
    this.pluginFiles.set(OpenRCT2.PluginFileName.Messaging, messagingPlugin);
  };

  /** @override */
  dispose() {
    this.dataDir.dispose();
  };

  /**
   * Gets an OpenRCT2 plugin file by name.
   * @async
   * @param name The name of the plugin file including its file extension.
   * @returns The module plugin file that matches the name.
   */
  async getPluginFileByName(name: OpenRCT2.PluginFileName) {
    const requestedPluginFile = this.pluginFiles.get(name);
    if (requestedPluginFile) {
      return new ModulePluginFile(requestedPluginFile.path);
    };
    throw new Error(`'${name}' was unexpectedly missing from the available bot plugin files.`);
  };

  /** 
   * Gets all of the available OpenRCT2 plugin files for this module.
   * @async
   * @returns An array of all the OpenRCT2 module plugin files.
   */
  async getPluginFiles() {
    const pluginFiles = Array.from(this.pluginFiles.values());
    return pluginFiles.map(pluginFile => new ModulePluginFile(pluginFile.path));
  };
};