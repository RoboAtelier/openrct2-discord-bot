import path from 'path';
import { readdirSync } from 'fs';
import { stat } from 'fs/promises';
import { Configuration } from '@modules/configuration';
import { 
  ConcurrentDirectory,
  ConcurrentObjectFile,
  FileSystemCachedRepository
} from '@modules/io';
import { 
  OpenRCT2GameConfiguration,
  PluginFile,
  ScenarioFile,
  ServerQueue,
  ServerStatus,
  StartupOptions
} from '@modules/openrct2/data/models';
import { 
  ScenarioSaveFileExtensionArray,
  OpenRCT2ServerSubdirectoryName
} from '@modules/openrct2/data/types';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils';

/**
 * Represents a central data repository for the server host
 * managing OpenRCT2 game server instances.
 */
export class ServerHostRepository extends FileSystemCachedRepository<number, OpenRCT2ServerDirectory> {
  private static readonly dirKey = 'serverHost';
  private static readonly serverDirNameRegex = /^[sS]([1-9][0-9]*)(?:_(.+))?/;
  private static readonly serverDirNamePrefix = 's#';

  protected readonly dataDir: ConcurrentDirectory;
  protected readonly dataCache = new Map<number, OpenRCT2ServerDirectory>();

  constructor(config: Configuration) {
    super(config);
    this.dataDir = new ConcurrentDirectory(config.getDirectoryPath(ServerHostRepository.dirKey));
    const hostSubdirs = readdirSync(this.dataDir.path, { withFileTypes: true });
    if (0 === hostSubdirs.length) {
      const firstDirPath = path.join(this.dataDir.path, 's1_server');
      const firstDir = new OpenRCT2ServerDirectory(firstDirPath);
      this.dataCache.set(1, firstDir);
    };
    for (const hostSubdir of hostSubdirs) {
      const nameMatch = hostSubdir.name.match(ServerHostRepository.serverDirNameRegex);
      if (nameMatch && hostSubdir.isDirectory()) {
        const hostSubdirPath = path.join(this.dataDir.path, hostSubdir.name);
        const serverDir = new OpenRCT2ServerDirectory(hostSubdirPath);
        this.dataCache.set(parseInt(nameMatch[1]), serverDir);
      };
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
  async createOpenRCT2ServerDirectory(name = 'server') {
    const nextId = await this.identifyNextUnassignedId();
    const newDirPrefix = ServerHostRepository.serverDirNamePrefix.replace(
      '#',
      nextId.toString()
    );
    const newDirName = isStringNullOrWhiteSpace(name) ? newDirPrefix : `${newDirPrefix}_${name}`;
    const newDirPath = path.join(this.dataDir.path, newDirName);
    const newDir = new OpenRCT2ServerDirectory(newDirPath);
    this.dataCache.set(nextId, newDir);
    return { id: nextId, serverDir: newDir };
  };

  /** 
   * Gets the OpenRCT2 game server data directory by its matching server id.
   * @param id The id number of the OpenRCT2 server.
   * @async
   * @returns The data directory of the requested OpenRCT2 game instance.
   */
  async getOpenRCT2ServerDirectoryById(id: number) {
    const serverDir = this.dataCache.get(id);
    if (serverDir) {
      return serverDir;
    };
    throw new Error('Could not find requested server data repository with that id.');
  };

  /** 
   * Gets all OpenRCT2 game server data directories within the server host data folder.
   * @async
   * @returns A `Map` object of all OpenRCT2 game server data directories.
   */
  async getAllOpenRCT2ServerRepositories() {
    return Array.from(this.dataCache.values());
  };

  /**
   * Renames a file system directory of a OpenRCT2 server's data directory.
   * @async
   * @param id The id number of the OpenRCT2 server.
   * @param newName The new name for the file system directory.
   */
  async renameOpenRCT2ServerDirectory(id: number, newName = 'server') {
    const serverDir = await this.getOpenRCT2ServerDirectoryById(id);
    const repoPrefix = ServerHostRepository.serverDirNamePrefix.replace(
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
class OpenRCT2ServerDirectory extends ConcurrentDirectory {
  private static readonly serverDirNameRegex = /^[sS]([1-9][0-9]*)(?:_(.+))?/;
  private static readonly gameConfigFileName = 'config.ini';
  private static readonly queueFileName = 'queue.json';
  private static readonly startupFileName = 'startup.json';
  private static readonly statusFileName = 'status.json';

  private readonly configFile: ConcurrentObjectFile<OpenRCT2GameConfiguration>;
  private readonly queueFile: ConcurrentObjectFile<ServerQueue>;
  private readonly startupFile: ConcurrentObjectFile<StartupOptions>;
  private readonly statusFile: ConcurrentObjectFile<ServerStatus>;
  private readonly autosaveSubdir: ConcurrentDirectory;
  private readonly chatLogsSubdir: ConcurrentDirectory;
  private readonly screenshotSubdir: ConcurrentDirectory;
  private readonly serverLogsSubdir: ConcurrentDirectory;
  private readonly pluginSubdir: ConcurrentDirectory;

  constructor(dirPath: string) {
    super(dirPath);
    this.configFile = new ConcurrentObjectFile(
      path.join(this.path, OpenRCT2ServerDirectory.gameConfigFileName),
      new OpenRCT2GameConfiguration()
    );
    this.queueFile = new ConcurrentObjectFile(
      path.join(this.path, OpenRCT2ServerDirectory.queueFileName),
      new ServerQueue()
    );
    this.startupFile = new ConcurrentObjectFile(
      path.join(this.path, OpenRCT2ServerDirectory.startupFileName),
      new StartupOptions()
    );
    this.statusFile = new ConcurrentObjectFile(
      path.join(this.path, OpenRCT2ServerDirectory.statusFileName),
      new ServerStatus()
    );
    this.autosaveSubdir = new ConcurrentDirectory(
      path.join(this.path, OpenRCT2ServerSubdirectoryName.Autosave)
    );
    this.chatLogsSubdir = new ConcurrentDirectory(
      path.join(this.path, OpenRCT2ServerSubdirectoryName.ChatLogs)
    );
    this.screenshotSubdir = new ConcurrentDirectory(
      path.join(this.path, OpenRCT2ServerSubdirectoryName.Screenshot)
    );
    this.serverLogsSubdir = new ConcurrentDirectory(
      path.join(this.path, OpenRCT2ServerSubdirectoryName.ServerLogs)
    );
    this.pluginSubdir = new ConcurrentDirectory(
      path.join(this.path, OpenRCT2ServerSubdirectoryName.Plugin)
    );
  };

  /** Gets the name of this directory without the server id prefix. */
  get name() {
    const dirName = path.basename(this.path);
    return dirName.substr(dirName.indexOf('_') + 1);
  };

  /** @override */
  async renameExclusive(newDirName: string) {
    const nameCheck = newDirName.match(OpenRCT2ServerDirectory.serverDirNameRegex);
    if (nameCheck) {
      await super.renameExclusive(newDirName);
    };
    throw new Error(`Invalid name specified for the OpenRCT2 server directory: ${newDirName}`);
  };

  /**
   * Gets a subdirectory that the OpenRCT2 server directory manages.
   * @param subDirName The name of a valid OpenRCT2 server subdirectory.
   * @returns The path to the requested subdirectory.
   */
  getSubdirectoryPath(subDirName: OpenRCT2ServerSubdirectoryName) {
    return path.join(this.path, subDirName);
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
   * @returns A queue data object.
   */
  async getQueue() {
    return this.queueFile.readExclusive();
  };

  /** 
   * Updates the current queue or queue settings for the OpenRCT2 game server.
   * @async
   * @param config The updated queue data object.
   */
  async updateQueue(queue: ServerQueue) {
    return this.queueFile.writeExclusive(queue);
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
   * @param startup The updated server startup options.
   */
  async updateStartupOptions(startup: StartupOptions) {
    return this.startupFile.writeExclusive(startup);
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
   * @returns The full path of the requested autosave file in the autosave directory.
   */
  async getScenarioAutosave(index = 0) {
    const files = await this.autosaveSubdir.getFilesExclusive();
    const autosaves = files.filter(file => {
      return ScenarioSaveFileExtensionArray.some(ext => file.name.endsWith(ext));
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
   * Gets the screenshot file stored in the OpenRCT2 game server directory by name.
   * @async
   * @param name The name of the screenshot file to return.
   * @returns The full path of the requested screenshot file in the screenshot directory.
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
   * Gets all the current plugin files stored in this OpenRCT2 game server directory.
   * @async
   * @returns An array of all the current plugin files in the plugin directory.
   */
  async getPluginFileByName(name: string) {
    const files = await this.pluginSubdir.getFilesExclusive();
    const requestedPlugin = files.find(file => file.name === name);
    if (requestedPlugin) {
      return new PluginFile(path.join(this.pluginSubdir.path, requestedPlugin.name));
    };
    throw new Error('A plugin file with that name does not exist.');
  };

  /**
   * Adds plugin files to the OpenRCT2 game server directory
   * if they are not currently in the plugin directory.
   * @async
   * @param pluginFiles The plugin files to add.
   */
  async addPluginFiles(...pluginFiles: PluginFile[]) {
    const files = await this.pluginSubdir.getFilesExclusive();
    const currentPluginFileNames = files.map(file => file.name);
    for (const pluginFile of pluginFiles) {
      if (!currentPluginFileNames.includes(pluginFile.name)) {
        await this.pluginSubdir.addFileExclusive(pluginFile.path);
      };
    };
  };

  /**
   * Removes the specified plugin files from the OpenRCT2 game server directory.
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
};