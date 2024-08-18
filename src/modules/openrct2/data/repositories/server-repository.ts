import path from 'path';
import { readdirSync } from 'fs';
import { stat } from 'fs/promises';
import { Configuration } from '@modules/configuration/index.js';
import { 
  ConcurrentDirectory,
  ConcurrentObjectFile,
  FileSystemCachedRepository
} from '@modules/io/index.js';
import { OpenRCT2 } from '@modules/openrct2/index.js';
import { 
  ModulePluginFile,
  OpenRCT2GameConfiguration,
  PluginFile,
  PluginOptions,
  ScenarioFile,
  ScenarioQueue,
  ServerStatus,
  StartupOptions
} from '@modules/openrct2/data/models/index.js';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils.js';

/** Represents a central data repository for all of the distinct OpenRCT2 game server directories. */
export class ServerRepository extends FileSystemCachedRepository<number, ServerDirectory> {
  private static readonly dirKey = 'server';
  private static readonly serverDirNameRegex = /^[sS]([1-9][0-9]*)(?:_(.+))?/;
  private static readonly serverDirNamePrefix = 's#';
  
  protected readonly dataDir: ConcurrentDirectory;
  protected readonly dataCache = new Map<number, ServerDirectory>();

  constructor(config: Configuration) {
    super(config);
    this.dataDir = new ConcurrentDirectory(config.serverDirPath);
    const hostSubdirs = readdirSync(this.dataDir.path, { withFileTypes: true });
    for (const hostSubdir of hostSubdirs) {
      const nameMatch = hostSubdir.name.match(ServerRepository.serverDirNameRegex);
      if (nameMatch && hostSubdir.isDirectory()) {
        const hostSubdirPath = path.join(this.dataDir.path, hostSubdir.name);
        const serverDir = new ServerDirectory(hostSubdirPath);
        this.dataCache.set(parseInt(nameMatch[1]), serverDir);
      };
    };
    if (!Array.from(this.dataCache.values()).length) {
      const firstDirPath = path.join(this.dataDir.path, 's1_server');
      const firstDir = new ServerDirectory(firstDirPath);
      this.dataCache.set(1, firstDir);
    };
  };

  /** @override */
  dispose() {
    this.dataDir.dispose();
  };

  /**
   * Creates a new file system directory that will represent
   * as a new data directory for a new OpenRCT2 game server instance.
   * @async
   * @param name A name for the new data directory file system directory.
   * @returns The newly created OpenRCT2 server data directory.
   */
  async createServerDirectory(name = 'server') {
    const nextId = this.identifyNextUnassignedId();
    const newDirPrefix = ServerRepository.serverDirNamePrefix.replace(
      '#',
      nextId.toString()
    );
    const newDirName = isStringNullOrWhiteSpace(name) ? newDirPrefix : `${newDirPrefix}_${name}`;
    const newDirPath = path.join(this.dataDir.path, newDirName);
    const newDir = new ServerDirectory(newDirPath);
    this.dataCache.set(nextId, newDir);
    return { id: nextId, serverDir: newDir };
  };

  /** 
   * Gets the OpenRCT2 game server data directory by its matching server id.
   * @param id The id number of the OpenRCT2 server.
   * @async
   * @returns The data directory of the requested OpenRCT2 game instance.
   */
  async getServerDirectoryById(id: number) {
    const serverDir = this.dataCache.get(id);
    if (serverDir) {
      return serverDir;
    };
    throw new Error('Could not find requested server data repository with that id.');
  };

  /** 
   * Gets all OpenRCT2 game server data directories within the central data folder.
   * @async
   * @returns An array of all of the OpenRCT2 game server data directories.
   */
  async getAllServerDirectories() {
    return Array.from(this.dataCache.entries());
  };

  /**
   * Renames a file system directory of a OpenRCT2 server's data directory.
   * @async
   * @param id The id number of the OpenRCT2 server.
   * @param newName The new name for the file system directory.
   */
  async renameOpenRCT2ServerDirectory(id: number, newName = 'server') {
    const serverDir = await this.getServerDirectoryById(id);
    const repoPrefix = ServerRepository.serverDirNamePrefix.replace(
      '#',
      id.toString()
    );
    const newDirName = isStringNullOrWhiteSpace(newName) ? repoPrefix : `${repoPrefix}_${newName}`;
    return serverDir.renameExclusive(newDirName);
  };

  /** 
   * Gets the next available id for the creation of a new OpenRCT2 game server data directory.
   * @async
   * @returns The next usable id number.
   */
  private identifyNextUnassignedId() {
    let highestId = 0;
    const assignedIds = Array.from(this.dataCache.keys());

    for (const assignedId of assignedIds) {
      if (assignedId > highestId) {
        highestId = assignedId;
      };
    };

    if (assignedIds.length === highestId) {
      return highestId + 1;
    };
    const unassignedIds = Array
      .from(Array(highestId), (_, i) => i + 1)
      .filter(id => !assignedIds.includes(id));
    return unassignedIds[0];
  };
};

/**
 * Represents a data repository of a OpenRCT2 game server's
 * file system objects and resources.
 */
class ServerDirectory extends ConcurrentDirectory {
  private static readonly serverDirNameRegex = /^[sS]([1-9][0-9]*)(?:_(.+))?/;
  private static readonly gameConfigFileName = 'config.ini';
  private static readonly queueFileName = 'server-queue.json';
  private static readonly pluginFileName = 'server-plugin.json';
  private static readonly startupFileName = 'server-startup.json';
  private static readonly statusFileName = 'server-status.json';

  private readonly fileMap = new Map<string, ConcurrentObjectFile<any>>();
  private readonly configFile: ConcurrentObjectFile<OpenRCT2GameConfiguration>;
  private readonly queueFile: ConcurrentObjectFile<ScenarioQueue>;
  private readonly pluginFile: ConcurrentObjectFile<PluginOptions>;
  private readonly startupFile: ConcurrentObjectFile<StartupOptions>;
  private readonly statusFile: ConcurrentObjectFile<ServerStatus>;
  private readonly autosaveSubdir: ConcurrentDirectory;
  private readonly chatLogsSubdir: ConcurrentDirectory;
  private readonly saveSubdir: ConcurrentDirectory;
  private readonly screenshotSubdir: ConcurrentDirectory;
  private readonly serverLogsSubdir: ConcurrentDirectory;
  private readonly pluginSubdir: ConcurrentDirectory;

  constructor(dirPath: string) {
    super(dirPath);

    this.configFile = new ConcurrentObjectFile(
      path.join(this.path, ServerDirectory.gameConfigFileName),
      new OpenRCT2GameConfiguration()
    );
    this.fileMap.set(ServerDirectory.gameConfigFileName, this.configFile);

    this.queueFile = new ConcurrentObjectFile(
      path.join(this.path, ServerDirectory.queueFileName),
      new ScenarioQueue()
    );
    this.fileMap.set(ServerDirectory.queueFileName, this.queueFile);

    this.pluginFile = new ConcurrentObjectFile(
      path.join(this.path, ServerDirectory.pluginFileName),
      new PluginOptions()
    )
    this.fileMap.set(ServerDirectory.pluginFileName, this.pluginFile);

    this.startupFile = new ConcurrentObjectFile(
      path.join(this.path, ServerDirectory.startupFileName),
      new StartupOptions()
    );
    this.fileMap.set(ServerDirectory.startupFileName, this.startupFile);

    this.statusFile = new ConcurrentObjectFile(
      path.join(this.path, ServerDirectory.statusFileName),
      new ServerStatus()
    );
    this.fileMap.set(ServerDirectory.statusFileName, this.statusFile);

    this.autosaveSubdir = new ConcurrentDirectory(
      path.join(this.path, OpenRCT2.ServerSubdirectoryName.Autosave)
    );
    this.chatLogsSubdir = new ConcurrentDirectory(
      path.join(this.path, OpenRCT2.ServerSubdirectoryName.ChatLogs)
    );
    this.saveSubdir = new ConcurrentDirectory(
      path.join(this.path, OpenRCT2.ServerSubdirectoryName.Save)
    )
    this.screenshotSubdir = new ConcurrentDirectory(
      path.join(this.path, OpenRCT2.ServerSubdirectoryName.Screenshot)
    );
    this.serverLogsSubdir = new ConcurrentDirectory(
      path.join(this.path, OpenRCT2.ServerSubdirectoryName.ServerLogs)
    );
    this.pluginSubdir = new ConcurrentDirectory(
      path.join(this.path, OpenRCT2.ServerSubdirectoryName.Plugin)
    );
  };

  /** Gets the name of this directory without the server id prefix. */
  get name() {
    const dirName = path.basename(this.path);
    return dirName.substring(dirName.indexOf('_') + 1);
  };

  /** @override */
  async renameExclusive(newDirName: string) {
    const nameCheck = newDirName.match(ServerDirectory.serverDirNameRegex);
    if (nameCheck) {
      await super.renameExclusive(newDirName);
    };
    throw new Error(`Invalid name specified for the OpenRCT2 server directory: ${newDirName}`);
  };

  /**
   * Gets a subdirectory that the OpenRCT2 server directory manages.
   * @param subdirName The name of a valid OpenRCT2 server subdirectory.
   * @returns The path to the requested subdirectory.
   */
  getSubdirectoryPath(subdirName: OpenRCT2.ServerSubdirectoryName) {
    return path.join(this.path, subdirName);
  };

  /**
   * Locks a file to allow actions from a single process.
   * @param fileName The name of the file to lock.
   * @param lifetimeMs The length of time in milliseconds to keep the lock for.
   * @returns A transaction key to execute actions on the file while locked.
   */
  async lockFile(fileName: typeof ServerDirectory.queueFileName, lifetimeMs = 30000) {
    const file = this.fileMap.get(fileName);
    if (file) {
      return file.lock(lifetimeMs);
    } else {
      throw new Error('Invalid file specified.');
    };
  };

  /**
   * Unlocks a file to allow operations from all processes.
   * @param fileName The name of the file to unlock.
   * @param transactionKey The permission value initially assigned from locking an object.
   */
  async unlockFile(fileName: typeof ServerDirectory.queueFileName, transactionKey: number) {
    const file = this.fileMap.get(fileName);
    if (file) {
      const unlocked = file.unlock(transactionKey);
      if (!unlocked) {
        throw new Error('Invalid key specified to unlock a file.');
      };
    } else {
      throw new Error('Invalid file specified.');
    };
  };

  /** 
   * Gets the game configuration settings of the OpenRCT2 game server.
   * @async
   * @returns A OpenRCT2 configuration data object.
   */
  async getGameConfiguration() {
    return this.configFile.readExclusive();
  };

  /** 
   * Updates the game configuration settings of the OpenRCT2 game server.
   * @async
   * @param config The updated game configuration settings.
   */
  async updateGameConfiguration(config: OpenRCT2GameConfiguration) {
    return this.configFile.writeExclusive(config);
  };

  /** 
   * Gets the current queue and queue settings for the OpenRCT2 game server.
   * @async
   * @param transactionKey A permission value to run an action on a locked object.
   * @returns A queue data object.
   */
  async getQueue(transactionKey?: number) {
    return this.queueFile.readExclusive(transactionKey);
  };

  /** 
   * Updates the current queue or queue settings for the OpenRCT2 game server.
   * @async
   * @param config The updated queue data object.
   * @param transactionKey A permission value to run an action on a locked object.
   */
  async updateQueue(queue: ScenarioQueue, transactionKey?: number) {
    return this.queueFile.writeExclusive(queue, transactionKey);
  };

  /** 
   * Gets the current module plugin options for the OpenRCT2 game server.
   * @async
   * @returns A plugin options data object.
   */
  async getPluginOptions() {
    return this.pluginFile.readExclusive();
  };

  /**
   * Updates the module plugin options for the OpenRCT2 game server.
   * @async
   * @param pluginOptions The updated plugin options.
   */
  async updatePluginOptions(pluginOptions: PluginOptions) {
    return this.pluginFile.writeExclusive(pluginOptions);
  };

  /** 
   * Gets the current startup options for the OpenRCT2 game server.
   * @async
   * @returns A startup options data object.
   */
  async getStartupOptions() {
    return this.startupFile.readExclusive();
  };

  /**
   * Updates the server startup options for the OpenRCT2 game server.
   * @async
   * @param startupOptions The updated server startup options.
   */
  async updateStartupOptions(startupOptions: StartupOptions) {
    return this.startupFile.writeExclusive(startupOptions);
  };
  
  /** 
   * Gets the current status snapshot of the OpenRCT2 game server.
   * @async
   * @returns A status data object.
   */
  async getStatus() {
    return this.statusFile.readExclusive();
  };

  /**
   * Updates the server status of the OpenRCT2 game server.
   * @async
   * @param status The new status snapshot of the OpenRCT2 game server.
   */
  async updateStatus(status: ServerStatus) {
    return this.statusFile.writeExclusive(status);
  };

  /**
   * Gets the collection of chat logs stored by the OpenRCT2 game server.
   * @async
   * @returns 
   * A data object containing the directory path to the chat logs
   * and the array of chat log file stats.
   */
  async getChatLogs() {
    const chatLogs = await this.chatLogsSubdir.getFilesExclusive();
    const chatLogFiles = await Promise.all(chatLogs.map(async chatLog => {
      const fileStat = await stat(path.join(this.chatLogsSubdir.path, chatLog.name));
      return { name: chatLog.name, info: fileStat };
    }));
    return { dir: this.chatLogsSubdir.path, files: chatLogFiles };
  };

  /**
   * Gets the collection of server logs stored by the OpenRCT2 game server.
   * @async
   * @returns 
   * A data object containing the directory path to the server logs
   * and the array of server log file stats.
   */
  async getServerLogs() {
    const serverLogs = await this.serverLogsSubdir.getFilesExclusive();
    const serverLogFiles = await Promise.all(serverLogs.map(async serverLog => {
      const fileStat = await stat(path.join(this.serverLogsSubdir.path, serverLog.name));
      return { name: serverLog.name, info: fileStat };
    }));
    return { dir: this.serverLogsSubdir.path, files: serverLogFiles };
  };

  /**
   * Gets the latest autosave file stored by the OpenRCT2 game server
   * or by a specified index.
   * @async
   * @param index The index of the requested autosave in the autosave set to return.
   * @returns The full path of the requested autosave file in the `autosave` directory.
   */
  async getScenarioAutosave(index = 0) {
    const files = await this.autosaveSubdir.getFilesExclusive();
    const autosaves = files.filter(file => {
      return OpenRCT2.ScenarioSaveFileExtensionArray.some(ext => file.name.endsWith(ext));
    });
    if (autosaves.length === 0) {
      throw new Error('No autosaves found.');
    } else if (index >= autosaves.length || index < 0) {
      throw new Error('Invalid autosave ordinal number specified.');
    };

    const autosaveFiles = await Promise.all(autosaves.map(async autosave => {
      const fileStat = await stat(path.join(this.autosaveSubdir.path, autosave.name));
      return { name: autosave.name, info: fileStat };
    }));
    const sortedAutosaves = autosaveFiles.sort((a, b) => {
      return b.info.ctimeMs - a.info.ctimeMs;
    });
    return new ScenarioFile(path.join(this.autosaveSubdir.path, sortedAutosaves[index].name));
  };

  /**
   * Gets a scenario save file stored in the `save` subdirectory by name.
   * @async
   * @param name The name of the scenario file to return.
   * @returns The requested save file in the `save` directory.
   */
  async getScenarioSaveByName(name: string) {
    const files = await this.saveSubdir.getFilesExclusive();
    const saves = files.filter(file => {
      return OpenRCT2.ScenarioSaveFileExtensionArray.some(ext => file.name.endsWith(ext));
    });
    if (saves.length === 0) {
      throw new Error('No save files were found.');
    };

    const requestedSaveFile = saves.find(save => save.name === name);
    if (requestedSaveFile) {
      return new ScenarioFile(path.join(this.saveSubdir.path, requestedSaveFile.name));
    };
    throw new Error(`A scenario save file of the name '${name}' does not exist.`);
  };

  /**
   * Gets the screenshot file stored in the `screenshot` subdirectory by name.
   * @async
   * @param name The name of the screenshot file to return.
   * @returns The full path of the requested screenshot file in the `screenshot` directory.
   */
  async getScreenshotByName(name: string) {
    const files = await this.screenshotSubdir.getFilesExclusive();
    const requestedScreenshot = files.find(file => file.name === name);
    if (requestedScreenshot) {
      return path.join(this.screenshotSubdir.path, requestedScreenshot.name);
    };
    throw new Error('A screenshot file with that name does not exist.');
  };

  /**
   * Gets a module plugin file stored in the `plugin` subdirectory by name.
   * @async
   * @param name The name of the plugin file to return.
   * @returns The requested module plugin file in the `plugin` directory.
   */
  async getPluginFileByName(name: OpenRCT2.PluginFileName) {
    const files = await this.pluginSubdir.getFilesExclusive();
    const requestedPlugin = files.find(file => file.name === name);
    if (requestedPlugin) {
      return new ModulePluginFile(path.join(this.pluginSubdir.path, requestedPlugin.name));
    };
    throw new Error('A plugin file with that name does not exist.');
  };

  /**
   * Gets all of the module plugin files stored in the `plugin` subdirectory.
   * @async
   * @returns All module plugin files in the `plugin` directory.
   */
  async getPluginFiles() {
    const files = await this.pluginSubdir.getFilesExclusive();
    const pluginFiles = files.filter(file => (Object.values(OpenRCT2.PluginFileName) as string[]).includes(file.name));
    return pluginFiles.map(file => new ModulePluginFile(path.join(this.pluginSubdir.path, file.name)));
  };

  /**
   * Adds plugin files to the OpenRCT2 game server directory
   * if they are not currently in the `plugin` subdirectory.
   * @async
   * @param force Specifies if plugin files get overwritten if they already exist.
   * @param pluginFiles The plugin files to add.
   */
  async addPluginFiles(force = false, ...pluginFiles: PluginFile[]) {
    const files = await this.pluginSubdir.getFilesExclusive();
    const currentPluginFileNames = files.map(file => file.name);
    for (const pluginFile of pluginFiles) {
      if (!currentPluginFileNames.includes(pluginFile.name) || force) {
        await this.pluginSubdir.addFileExclusive(pluginFile.path);
      };
    };
  };

  /**
   * Removes the specified plugin files from the `plugin` subdirectory.
   * @async
   * @param pluginFileNames The name of the plugin files to remove.
   */
  async removePluginFiles(...pluginFileNames: string[]) {
    const files = await this.pluginSubdir.getFilesExclusive();
    for (const file of files) {
      if (pluginFileNames.includes(file.name)) {
        await this.pluginSubdir.removeFileExclusive(file.name);
      };
    };
  };

  async addScenarioSaveFile(scenarioFile: ScenarioFile, newFileName: string) {
    await this.saveSubdir.addFileExclusive(scenarioFile.path, newFileName);
  };
};