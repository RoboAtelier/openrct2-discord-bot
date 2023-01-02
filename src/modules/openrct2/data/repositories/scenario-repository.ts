import path from 'path';
import Fuse from 'fuse.js'
import { 
  ConcurrentDirectory,
  ConcurrentObjectArrayFile,
  FileSystemCachedRepository
} from '@modules/io';
import { 
  ScenarioFile,
  ScenarioMetadata
} from '@modules/openrct2/data/models/scenario';
import { 
  ScenarioFileExtension,
  ScenarioFileExtensionArray
} from '@modules/openrct2/data/types';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils';
import { Configuration } from '@modules/configuration';

/** Represents a data repository for OpenRCT2 scenario files. */
export class ScenarioRepository extends FileSystemCachedRepository<string, any> {
  private static readonly dirKey = 'scenario';
  private static readonly metadataFileName = 'metadata.json';
  private static readonly fuseOptions = { keys: ['name'], threshold: 0.1 };
  private static readonly refreshInterval = 1000 * 60 * 0.1; //ms/sec * sec/min * # of min

  private readonly metadataFile: ConcurrentObjectArrayFile<ScenarioMetadata>;
  private readonly refreshLog = new Map<string, number>();

  protected readonly dataDir: ConcurrentDirectory;
  protected readonly dataCache = new Map<string, any>();

  constructor(config: Configuration) {
    super(config);
    this.dataDir = new ConcurrentDirectory(config.getDirectoryPath(ScenarioRepository.dirKey));
    this.metadataFile = new ConcurrentObjectArrayFile<ScenarioMetadata>(
      path.join(this.dataDir.path, ScenarioRepository.metadataFileName),
      new ScenarioMetadata()
    );
  };

  dispose() {
    this.metadataFile.dispose();
    this.dataDir.dispose();
  };

  /**
   * Gets all available scenario files.
   * @async
   * @returns An array of all available scenarios within the data directory.
   */
  async getAvailableScenarios() {
    return this.loadOrGetFromCache(ScenarioFile.name, () => this.readScenarioFiles());
  };

  /**
   * Gets scenario files that have the specified file extension(s).
   * @param fileExtensions The file extensions to match for the scenarios.
   */
  async getScenariosByFileExtension(...fileExtensions: ScenarioFileExtension[]) {
    const scenarioFiles = await this.getAvailableScenarios();
    const requestedScenarioFiles = scenarioFiles.filter(scenarioFile => {
      return scenarioFile.hasFileExtension(...fileExtensions);
    });
    return requestedScenarioFiles;
  };

  /**
   * Gets a scenario file by name.
   * @async
   * @param name The name of the scenario file including its file extension.
   * @returns The scenario file that matches the name.
   */
  async getScenarioByName(name: string) {
    const scenarioFiles = await this.getAvailableScenarios();
    const requestedScenarioFile = scenarioFiles.find(scenarioFile => {
      return scenarioFile.name === name;
    });
    return requestedScenarioFile;
  };

  /**
   * Gets scenario files by an approximate search.
   * @async
   * @param name The name of the scenario file.
   * @param fileExtensions The file extensions to match for the scenarios.
   * @returns An array of scenario files that closely match the parameters.
   */
  async getScenarioByFuzzySearch(name: string, ...fileExtensions: ScenarioFileExtension[]) {
    const scenarioFiles = fileExtensions.length > 0
      ? await this.getScenariosByFileExtension(...fileExtensions)
      : await this.getAvailableScenarios()
    const fuse = new Fuse(scenarioFiles, ScenarioRepository.fuseOptions);
    const result = fuse.search(name);
    return result.map(resultElement => resultElement.item);
  };

  /**
   * Adds a new scenario into the scenario collection and adds a metadata entry.
   * If a scenario with the same name already exists, it is overwritten.
   * @async
   * @param scenarioFilePath The path to the scenario file to add.
   * @param newName A new name for the scenario file if specified.
   * @param tags Metadata tags about the scenario.
   * @returns Metadata of the new scenario that was added.
   */
  async addScenario(scenarioFilePath: string, newName = '', ...tags: string[]) {
    const fileExtension = this.getScenarioFileExtension(path.basename(scenarioFilePath));
    let fullNewName = path.basename(scenarioFilePath);
    if (!isStringNullOrWhiteSpace(newName)) {
      fullNewName = newName.endsWith(fileExtension)
        ? newName
        : `${newName}${fileExtension}`;
    };

    const newInfo = new ScenarioMetadata(fullNewName, tags);
    const metadata = await this.getScenarioMetadata();
    metadata.push(newInfo);
    await this.updateCacheAndSource(
      ScenarioMetadata.name,
      metadata,
      newValue => this.metadataFile.writeExclusive(newValue)
    );
    await this.dataDir.addFileExclusive(scenarioFilePath, fullNewName);
    return newInfo;
  };
    
  /**
   * Removes a scenario from the scenario collection.
   * @async
   * @param scenarioFile The scenario file to remove.
   */
  async removeScenario(scenarioFile: ScenarioFile) {
    await this.dataDir.removeFileExclusive(scenarioFile.name);
    const metadata = await this.getScenarioMetadata();
    const metadataIndex = metadata.findIndex(scenario => {
      return scenario.fileName === scenarioFile.name;
    });
    if (metadataIndex > -1) {
      metadata.splice(metadataIndex, 1);
      await this.updateCacheAndSource(
        ScenarioMetadata.name,
        metadata,
        newValue => this.metadataFile.writeExclusive(newValue)
      );
    };
  };

  /**
   * Renames an existing scenario.
   * @async
   * @param scenarioFile The scenario file being renamed.
   * @param newName The new name for the scenario.
   */
  async renameScenario(scenarioFile: ScenarioFile, newName: string) {
    const fullNewName = newName.endsWith(scenarioFile.fileExtension)
      ? newName
      : `${newName}${scenarioFile.fileExtension}`;

    await this.dataDir.renameOrMoveFileExclusive(scenarioFile.name, fullNewName);
    const metadata = await this.getScenarioMetadata();
    const metadataIndex = metadata.findIndex(scenario => {
      return scenario.fileName === scenarioFile.name;
    });
    if (metadataIndex > -1) {
      const existingNewIndex = metadata.findIndex(scenario => {
        return scenario.fileName === fullNewName;
      });
      const currentInfo = metadata[metadataIndex];
      const updatedInfo = new ScenarioMetadata(
        fullNewName,
        currentInfo.tags,
        currentInfo.plays,
        currentInfo.wins,
        currentInfo.losses,
        currentInfo.active
      );
      metadata[metadataIndex] = updatedInfo;
      if (existingNewIndex > -1) {
        metadata.splice(existingNewIndex, 1);
      };
      await this.updateCacheAndSource(
        ScenarioMetadata.name,
        metadata,
        newValue => this.metadataFile.writeExclusive(newValue)
      );
    };
  };

  /**
   * Gets the current records of supplemental scenario metadata.
   * @async
   * @returns An array of the current scenario metadata records.
   */
  async getScenarioMetadata() {
    return this.loadOrGetFromCache(
      ScenarioMetadata.name,
      () => this.readAndFillScenarioMetadata()
    );
  };

  /**
   * Gets supplemental scenario metadata by name.
   * @async
   * @param name The name of the scenario including its file extension.
   * @returns The scenario metadata record that matches the name.
   */
  async getScenarioMetadataByName(name: string) {
    const metadata = await this.getScenarioMetadata();
    const requestedMetadata = metadata.find(scenarioData => {
      return scenarioData.fileName === name;
    });
    return requestedMetadata;
  };

  /**
   * Gets supplemental scenario metadata by file extension.
   * @async
   * @param fileExtensions The file extensions to match for the scenarios.
   * @returns An array of scenario metadata records that contain the specified file extensions.
   */
  async getScenarioMetadataByFileExtension(...fileExtensions: ScenarioFileExtension[]) {
    const requestedScenarioFiles = await this.getScenariosByFileExtension(...fileExtensions);
    const metadata = await this.getScenarioMetadata();
    return requestedScenarioFiles.map(file => {
      const currentInfo = metadata.find(scenarioData => {
        return scenarioData.fileName === file.name;
      });
      if (!currentInfo) {
        throw new Error(`Unexpected file returned that is not in the managed directory. ${file.path}`);
      };
      return currentInfo;
    });
  };

  /**
   * Gets supplemental scenario metadata for a managed scenario file.
   * If there isn't any metadata for a scenario, default values are given instead.
   * @async
   * @param scenarioFile The scenario file to get metadata for.
   * @returns The scenario metadata record.
   */
  async getScenarioMetadataForFile(scenarioFile: ScenarioFile) {
    const metadata = await this.getScenarioMetadata();
    const requestedMetadata = metadata.find(scenarioData => {
      return scenarioData.fileName === scenarioFile.name;
    });
    if (!requestedMetadata) {
      throw new Error('Could not find specified scenario file in the managed directory.');
    };
    return requestedMetadata;
  };

  /**
   * Gets supplemental scenario metadata for scenario files by an approximate search.
   * If there isn't any metadata for a scenario, default values are given instead.
   * @async
   * @param scenarioFileName The scenario file name to search.
   * @param fileExtensions The file extensions to match for the scenarios.
   * @returns An array of scenario metadata records that closely match the parameters.
   */
  async getScenarioMetadataByFuzzySearch(scenarioFileName: string, ...fileExtensions: ScenarioFileExtension[]) {
    const requestedScenarioFiles = await this.getScenarioByFuzzySearch(scenarioFileName, ...fileExtensions);
    const metadata = await this.getScenarioMetadata();
    const requestedMetadata = requestedScenarioFiles.map(file => {
      const currentInfo = metadata.find(scenarioData => {
        return scenarioData.fileName === file.name;
      });
      if (!currentInfo) {
        throw new Error(`Unexpected file returned that is not in the managed directory. ${file.path}`);
      };
      return currentInfo;
    });
    return requestedMetadata;
  };

  /**
   * Updates supplemental scenario metadata for a scenario file.
   * @async
   * @param scenarioInfo The updated scenario metadata record.
   */
  async updateScenarioMetadata(scenarioInfo: ScenarioMetadata) {
    const metadata = await this.getScenarioMetadata();
    const metadataIndex = metadata.findIndex(scenarioData => {
      return scenarioData.fileName === scenarioInfo.fileName;
    });
    metadata[metadataIndex] = scenarioInfo;
    await this.updateCacheAndSource(
      ScenarioMetadata.name,
      metadata,
      newValue => this.metadataFile.writeExclusive(newValue)
    );
    this.refreshLog.set(ScenarioMetadata.name, new Date(0).getMilliseconds());
  };

  /** @override */
  protected async loadOrGetFromCache<T>(
    keyName: string,
    getter: () => Promise<T>
  ) {
    const refreshTimestamp = this.refreshLog.get(keyName);
    if (refreshTimestamp && Date.now() - refreshTimestamp < ScenarioRepository.refreshInterval) {
      const data = this.dataCache.get(keyName);
      if (data) {
        return data as T;
      };
    };
    const currentData = await getter();
    this.dataCache.set(keyName, currentData);
    this.refreshLog.set(keyName, Date.now());
    return currentData;
  };

  /** @override */
  protected async updateCacheAndSource(
    keyName: string,
    newData: any,
    updater: (arg: any) => Promise<void>,
  ) {
    await super.updateCacheAndSource(keyName, newData, updater);
    this.refreshLog.set(keyName, new Date(0).getMilliseconds());
  };

  /** 
   * Reads for all scenario files in the data directory.
   * @async
   * @returns An array of all discovered scenario files.
   */
  private async readScenarioFiles() {
    const files = await this.dataDir.getFilesExclusive();
    const scenarioDirents = files.filter(file => {
      return ScenarioFileExtensionArray.some(ext => file.name.endsWith(ext));
    });
    return scenarioDirents.map(dirent => new ScenarioFile(path.join(this.dataDir.path, dirent.name)));
  };

  /**
   * Reads the metadata file for all scenario metadata records
   * and fills in missing records based on the current available scenario files.
   * @async
   * @returns An array of the current scenario metadata records.
   */
  private async readAndFillScenarioMetadata() {
    const metadata = await this.metadataFile.readExclusive();
    const scenarioFiles = await this.getAvailableScenarios();
    const updatedMetadata = scenarioFiles.map(scenarioFile => {
      const metadataIndex = metadata.findIndex(scenarioData => scenarioData.fileName === scenarioFile.name);
      return metadataIndex < 0 
        ? new ScenarioMetadata(scenarioFile.name)
        : metadata.splice(metadataIndex, 1)[0];
    });
    await this.metadataFile.writeExclusive(updatedMetadata);
    return updatedMetadata;
  };

  /**
   * Gets the file extension of a scenario file.
   * @param scenarioFileName The scenario file name to parse.
   */
  private getScenarioFileExtension(scenarioFileName: string) {
    const fileExtension = ScenarioFileExtensionArray.find(ext => {
      return scenarioFileName.endsWith(ext);
    });
    if (fileExtension === undefined) {
      throw new Error('A scenario file name did not contain a scenario file extension.');
    };
    return fileExtension;
  };
};