import path from 'path';
import { Configuration } from '@modules/configuration';
import { 
  ConcurrentDirectory,
  FileSystemRepository,
  ConcurrentFile
} from '@modules/io';
import { PluginFile } from '@modules/openrct2/data/models';
import { 
  BotPluginFileName,
  ServerAdapterPluginCode
} from '@modules/openrct2/data/types';

/** Represents a data repository for OpenRCT2 plugins. */
export class PluginRepository extends FileSystemRepository {
  private static readonly dirKey = 'plugin';

  private readonly pluginFiles = new Map<BotPluginFileName, ConcurrentFile>();

  protected readonly dataDir: ConcurrentDirectory;

  constructor(config: Configuration) {
    super(config);
    this.dataDir = new ConcurrentDirectory(config.getDirectoryPath(PluginRepository.dirKey));

    const serverAdapterPlugin = new ConcurrentFile(
      path.join(this.dataDir.path, BotPluginFileName.ServerAdapter),
      ServerAdapterPluginCode,
      true
    );
    this.pluginFiles.set(
      BotPluginFileName.ServerAdapter,
      serverAdapterPlugin
    );
  };

  /** @override */
  dispose() {
    this.dataDir.dispose();
  };

  /**
   * Gets a OpenRCT2 plugin file by name.
   * @async
   * @param name The name of the plugin file including its file extension.
   * @returns The plugin file that matches the name.
   */
  async getPluginFileByName(name: BotPluginFileName) {
    const requestedPluginFile = this.pluginFiles.get(name);
    if (requestedPluginFile) {
      return new PluginFile(requestedPluginFile.path);
    };
    throw new Error(`'${name}' was unexpectedly missing from the available bot plugin files.`);
  };

  /** 
   * Gets all of the stored OpenRCT2 plugin files for this bot.
   * @async
   * @returns An array of all the managed OpenRCT2 plugin files.
   */
  async getPluginFiles() {
    const pluginFiles = Array.from(this.pluginFiles.values());
    return pluginFiles.map(pluginFile => new PluginFile(pluginFile.path));
  };
};