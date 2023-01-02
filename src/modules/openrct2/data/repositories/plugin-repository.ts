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

  private readonly pluginFiles = new Map<BotPluginFileName, () => ConcurrentFile>();

  protected readonly dataDir: ConcurrentDirectory;

  constructor(config: Configuration) {
    super(config);
    this.dataDir = new ConcurrentDirectory(config.getDirectoryPath(PluginRepository.dirKey));
    this.pluginFiles.set(
      BotPluginFileName.ServerAdapter,
      () => new ConcurrentFile(
        path.join(this.dataDir.path, BotPluginFileName.ServerAdapter),
        ServerAdapterPluginCode
      )
    );
    for (const pluginFileGetter of this.pluginFiles.values()) {
      pluginFileGetter();
    };
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
    const requestedPluginFileGetter = this.pluginFiles.get(name);
    if (requestedPluginFileGetter) {
      return new PluginFile(requestedPluginFileGetter().path);
    };
    throw new Error(`'${name}' was unexpectedly missing from the available bot plugin files.`);
  };

  /** 
   * Gets all of the stored OpenRCT2 plugin files for this bot.
   * @async
   * @returns An array of all the managed OpenRCT2 plugin files.
   */
  async getPluginFiles() {
    const pluginFiles = await this.dataDir.getFilesExclusive();
    return pluginFiles.map(pluginFile => new PluginFile(path.join(this.dataDir.path, pluginFile.name)));
  };
};