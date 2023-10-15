import crypto from 'crypto';
import path from 'path';
import Fuse from 'fuse.js'
import tar from 'tar';
import { Unzip } from 'zip-lib';
import { Configuration } from '@modules/configuration';
import { 
  ConcurrentDirectory,
  FileSystemRepository,
} from '@modules/io';
import { OpenRCT2BuildFileExtensionArray } from '@modules/openrct2/data/types';
import { OpenRCT2Build } from '@modules/openrct2/data/models';
import { isStringValidForFileName } from '@modules/utils/string-utils';

/** Represents a data repository for OpenRCT2 game release and development builds. */
export class OpenRCT2BuildRepository extends FileSystemRepository {
  private static readonly dirKey = 'game-build';
  private static readonly fuseOptions = { keys: ['name'], threshold: 0.05 };

  private readonly inProgress: string[] = [];

  protected readonly dataDir: ConcurrentDirectory;

  constructor(config: Configuration) {
    super(config);
    this.dataDir = new ConcurrentDirectory(config.getDirectoryPath(OpenRCT2BuildRepository.dirKey));
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
  createOpenRCT2BuildWriteStream(fileName: string) {
    if (this.inProgress.includes(fileName)) {
      throw new Error(`${fileName} is already is use.`);
    };

    this.validateOpenRCT2BuildFileName(fileName);
    const writeStream = this.dataDir.createFixedPathWriteStream(fileName);
    this.inProgress.push(fileName);
    return writeStream;
  };

  /**
   * Extracts a OpenRCT2 build file package.
   * @async
   * @param fileName The name of the file to extract.
   * @param sha256Checksum The SHA-256 checksum to check against to validate file integrity.
   */
  async extracOpenRCT2Build(fileName: string, sha256Checksum: string) {
    if (!this.inProgress.includes(fileName)) {
      throw new Error(`${fileName} was not used to generate an initial write stream.`);
    };

    await this.validateHashes(fileName, sha256Checksum);
    await this.extractOpenRCT2BuildToDirectory(fileName);
  };

  /**
   * Gets all of the current decompiled OpenRCT2 builds.
   * @async
   * @returns An array of the current decompiled OpenRCT2 builds within the bot application. 
   */
  async getAvailableOpenRCT2Builds() {
    return await this.readOpenRCT2Builds();
  };

  /**
   * Gets OpenRCT2 builds by specifying version parameters.
   * @async
   * @param baseVersion The primary version number.
   * @param commitHeader The commit header for returning develop versions.
   * @returns An array of matching OpenRCT2 builds.
   */
  async getOpenRCT2BuildsByVersion(baseVersion: string, commitHeader?: string) {
    const baseVersionV = baseVersion.startsWith('v') ? baseVersion : `v${baseVersion}`;
    const targetVersion = commitHeader ? `${baseVersionV}-${commitHeader}` : baseVersionV;

    const openRCT2Builds = await this.readOpenRCT2Builds(baseVersionV);
    return openRCT2Builds.filter(build => build.version.startsWith(targetVersion));
  };

  /**
   * 
   * @param name
   * @returns 
   */
  async getOpenRCT2BuildsByFuzzySearch(name: string) {
    const openRCT2Builds = await this.readOpenRCT2Builds();
    const fuse = new Fuse(openRCT2Builds, OpenRCT2BuildRepository.fuseOptions);
    const result = fuse.search(name);
    return result.map(resultElement => resultElement.item);
  };

  private async readOpenRCT2Builds(baseVersion?: string) {
    const versionDirs = await this.readOpenRCT2VersionDirectories();
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
    return validRelPaths.map(relPath => new OpenRCT2Build(path.join(this.dataDir.path, relPath)));
  };

  private async readOpenRCT2VersionDirectories() {
    const dirs = await this.dataDir.getDirectoriesExclusive();
    return dirs.filter(dir => /^v\d+\.\d+\.\d+$/.test(dir.name));
  };

  private async extractOpenRCT2BuildToDirectory(fileName: string) {
    const fileExtension = OpenRCT2BuildFileExtensionArray.find(ext => fileName.endsWith(ext));
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

  private async validateHashes(fileName: string, sha256Checksum: string) {
    const hash = crypto.createHash('sha256');
    const gameBuildBuffer = await this.dataDir.readFileAsBufferExclusive(fileName);
    hash.update(gameBuildBuffer);
    const sha256Hex = hash.digest('hex');
    if (sha256Hex !== sha256Checksum) {
      throw new Error('The SHA-256 build file hash did not match the checksum value.');
    };
  };

  private validateOpenRCT2BuildFileName(fileName: string) {
    if (!isStringValidForFileName(fileName)) {
      throw new Error(`Invalid characters specified for build file name: ${fileName}`);
    } else if (!OpenRCT2BuildFileExtensionArray.some(ext => fileName.endsWith(ext))) {
      throw new Error(`Expected the build file name to have a supported file extension: ${fileName}`);
    } else if (this.inProgress.includes(fileName)) {
      throw new Error(`${fileName} is currently being utilized.`);
    };
  };
};