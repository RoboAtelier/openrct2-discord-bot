import path from 'path';
import Fuse from 'fuse.js'
import tar from 'tar';
import { Unzip } from 'zip-lib';
import { Configuration } from '@modules/configuration';
import { 
  ConcurrentDirectory,
  FileSystemRepository,
} from '@modules/io';
import { BuildDirectory } from '@modules/openrct2/data/models';
import { 
  areStringsEqualCaseInsensitive,
  isStringValidForFileName
} from '@modules/utils/string-utils';

/** Represents a data repository for OpenRCT2 game release and development builds. */
export class BuildRepository extends FileSystemRepository {
  private static readonly dirKey = 'build';
  private static readonly fuseOptions = { keys: ['name'], threshold: 0.2 };

  private readonly inProgress: string[] = [];

  protected readonly dataDir: ConcurrentDirectory;

  constructor(config: Configuration) {
    super(config);
    this.dataDir = new ConcurrentDirectory(config.getDirectoryPath(BuildRepository.dirKey));
  };

  /** @override */
  dispose() {
    this.dataDir.dispose();
  };

  /**
   * Creates a write stream fixed for a specific OpenRCT2 build name.
   * @param fileName The name of the compressed OpenRCT2 build file to write data to.
   * @returns A write stream for the requested OpenRCT2 build name.
   */
  createBuildWriteStream(fileName: string) {
    if (this.inProgress.includes(fileName)) {
      throw new Error(`${fileName} is already is use.`);
    };

    this.validateBuildFileName(fileName);
    const writeStream = this.dataDir.createFixedPathWriteStream(fileName);
    this.inProgress.push(fileName);
    return writeStream;
  };

  /**
   * Extracts a OpenRCT2 build file package.
   * @async
   * @param fileName The name of the file to extract.
   */
  async extractBuild(fileName: string) {
    if (!this.inProgress.includes(fileName)) {
      throw new Error(`${fileName} was not used to generate an initial write stream.`);
    };
    await this.extractBuildToDirectory(fileName);
  };

  /**
   * Gets all of the current decompiled OpenRCT2 builds.
   * @async
   * @returns An array of the current decompiled OpenRCT2 builds within the bot application. 
   */
  async getAvailableBuilds() {
    return await this.readBuilds();
  };

  /**
   * Gets OpenRCT2 builds by specifying version parameters.
   * @async
   * @param baseVersion The primary version number.
   * @param commitHeader The commit header for returning develop versions.
   * @returns An array of matching OpenRCT2 builds.
   */
  async getBuildsByVersion(baseVersion: string, commitHeader?: string) {
    const baseVersionV = baseVersion.startsWith('v') ? baseVersion : `v${baseVersion}`;
    const targetVersion = commitHeader ? `${baseVersionV}-${commitHeader}` : baseVersionV;

    const openRCT2Builds = await this.readBuilds(baseVersionV);
    return openRCT2Builds.filter(build => build.version.startsWith(targetVersion));
  };

  /**
   * 
   * @async
   * @param name
   * @returns 
   */
  async getBuildsByFuzzySearch(name: string) {
    const openRCT2Builds = await this.readBuilds();
    const requestedOpenRCT2Build = openRCT2Builds.find(openRCT2Build => {
      return areStringsEqualCaseInsensitive(openRCT2Build.name, name);
    });
    if (requestedOpenRCT2Build) {
      return [requestedOpenRCT2Build];
    };
    const fuse = new Fuse(openRCT2Builds, BuildRepository.fuseOptions);
    const result = fuse.search(name);
    return result.map(resultElement => resultElement.item);
  };

  private async readBuilds(baseVersion?: string) {
    const versionDirs = await this.readVersionDirectories();
    const buildRelPaths = [];
    
    if (baseVersion) {
      const targetVersionDir = versionDirs.find(dir => 
        dir.name === baseVersion || dir.name.substring(1) === baseVersion
      );
      if (targetVersionDir) {
        buildRelPaths.push(...(await this.dataDir.getDirectoriesExclusive(baseVersion)).map(dir =>
          path.join(baseVersion, dir.name)
        ));
      };
    } else {
      for (const versionDir of versionDirs) {
        buildRelPaths.push(...(await this.dataDir.getDirectoriesExclusive(versionDir.name)).map(dir =>
          path.join(versionDir.name, dir.name)
        ));
      };
    };

    const buildNameRegex = new RegExp(`\\${path.sep}v\\d+\\.\\d+\\.\\d+(?:\\-[0-9a-f]{7})?_[a-z\\-]+_[a-z0-9\\-]+$`)
    const validRelPaths = buildRelPaths.filter(relPath => buildNameRegex.test(relPath));
    return validRelPaths.map(relPath => new BuildDirectory(path.join(this.dataDir.path, relPath)));
  };

  private async readVersionDirectories() {
    const dirs = await this.dataDir.getDirectoriesExclusive();
    return dirs.filter(dir => /^v\d+\.\d+\.\d+$/.test(dir.name));
  };

  private async extractBuildToDirectory(fileName: string) {
    const fileExtension = OpenRCT2Module.BuildFileExtensionArray.find(ext => fileName.endsWith(ext));
    if (!fileExtension) {
      throw new Error(`Cannot extract ${fileName}. Unsupported file extension found.`);
    };

    const version = fileName.substring(0, fileName.indexOf('_'));
    const baseVersion = version.includes('-') ? version.substring(0, version.indexOf('-')) : version;
    const dirName = fileName.substring(0, fileName.lastIndexOf(fileExtension));
    const targetDirPath = path.join(baseVersion, dirName);
    const fullGameBuildFilePath = path.join(this.dataDir.path, fileName);
    const fullTargetDirPath = path.join(this.dataDir.path, targetDirPath);

    try {
      await this.dataDir.createSubdirectoryExclusive(targetDirPath);
      switch (fileExtension) {
        case '.zip':
          try {
            const unzip = new Unzip({ overwrite: true });
            await unzip.extract(
              fullGameBuildFilePath,
              fullTargetDirPath
            );
          } catch (err) {
            await this.dataDir.removeSubdirectoryExclusive(targetDirPath);
            throw err;
          };
          break;
        case '.tar.gz':
          const tempDirPath = path.join(baseVersion, `${dirName}_temp`);
          const extractedDirPath = path.join(targetDirPath, 'OpenRCT2');
          try {
            await tar.extract({
              file: fullGameBuildFilePath,
              cwd: fullTargetDirPath
            });
            const extractedDirs = await this.dataDir.getDirectoriesExclusive(targetDirPath);
            if (extractedDirs.length === 1 && extractedDirs[0].name === 'OpenRCT2') {
              await this.dataDir.renameOrMoveSubdirectoryExclusive(extractedDirPath, tempDirPath);
              await this.dataDir.removeSubdirectoryExclusive(targetDirPath);
              await this.dataDir.renameOrMoveSubdirectoryExclusive(tempDirPath, targetDirPath);
            };
          } catch (err) {
            await this.dataDir.removeSubdirectoryExclusive(tempDirPath);
            await this.dataDir.removeSubdirectoryExclusive(targetDirPath);
            throw err;
          };
          break;
        default:
          throw new Error(`Cannot currently extract ${fileExtension} files for ${fileName}.`);
      };
    } catch (err) {
      throw err;
    } finally {
      this.inProgress.splice(this.inProgress.indexOf(fileName), 1);
      await this.dataDir.removeFileExclusive(fileName);
    };
  };

  private validateBuildFileName(fileName: string) {
    if (!isStringValidForFileName(fileName)) {
      throw new Error(`Invalid characters specified for build file name: ${fileName}`);
    } else if (!OpenRCT2Module.BuildFileExtensionArray.some(ext => fileName.endsWith(ext))) {
      throw new Error(`Expected the build file name to have a supported file extension: ${fileName}`);
    } else if (this.inProgress.includes(fileName)) {
      throw new Error(`${fileName} is currently being utilized.`);
    };
  };
};