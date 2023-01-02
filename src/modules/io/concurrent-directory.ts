import path from 'path';
import { Abortable } from 'events';
import { Stream } from 'stream';
import { mkdirSync } from 'fs';
import { 
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile
} from 'fs/promises';
import { ConcurrentFileSystemObject } from '.';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils';

/** 
 * Represents a class for handling concurrent processes
 * on a file system directory.
 */
export class ConcurrentDirectory extends ConcurrentFileSystemObject {
  constructor(dirPath: string) {
    const resolvedDirPath = path.resolve(dirPath);
    super(dirPath);
    try {
      mkdirSync(resolvedDirPath, { recursive: true });
    } catch (err) {
      throw err;
    };
  };

  /**
   * Adds a file into the managed directory or subdirectory.
   * If the file already exists, it is replaced.
   * @async
   * @param filePath The path to the file to add.
   * @param newFileName If specified, renames the added file.
   * @param subdirNameOrRelPath If specified, places the new file into the relative path to a subdirectory.
   */
  async addFileExclusive(
    filePath: string,
    newFileName = '',
    subdirNameOrRelPath = ''
  ) {
    this.validateActive();
    return this.ioMutex.runExclusive(async () => {
      const fullDirPath = path.join(this.objPath, subdirNameOrRelPath);
      this.validateManagedDirectoryPath(fullDirPath);
      await mkdir(fullDirPath, { recursive: true });

      let fileName = path.basename(filePath);
      if (!isStringNullOrWhiteSpace(newFileName)) {
        this.validateFileName(newFileName);
        fileName = newFileName;
      };
      return copyFile(filePath, path.join(fullDirPath, fileName));
    });
  };

  /**
   * Creates a new subdirectory into the managed directory.
   * @param newSubdirNameOrRelPath The name or relative path to the subdirectory to create.
   */
  async createSubdirectory(newSubdirNameOrRelPath: string) {
    this.validateActive();
    return this.ioMutex.runExclusive(async () => {
      const fullDirPath = path.join(this.objPath, newSubdirNameOrRelPath);
      this.validateManagedDirectoryPath(fullDirPath);
      
      return mkdir(path.basename(fullDirPath), { recursive: true });
    });
  };

  /**
   * Gets all directory entries in the managed directory or subdirectory with locking.
   * @param subdirNameOrRelPath If specified, gets directory entries in the relative path to the subdirectory.
   * @returns An array of directory entries.
   */
  async getDirentsExclusive(subdirNameOrRelPath = '') {
    this.validateActive();
    return this.ioMutex.runExclusive(async () => {
      const fullDirPath = path.join(this.objPath, subdirNameOrRelPath);
      this.validateManagedDirectoryPath(fullDirPath);

      return readdir(fullDirPath, { withFileTypes: true });
    });
  };

  /**
   * Gets all directories in the managed directory or subdirectory with locking.
   * @param subdirNameOrRelPath If specified, gets directories in the relative path to the subdirectory.
   * @returns An array of directory entries that are only directories.
   */
  async getDirectoriesExclusive(subdirNameOrRelPath = '') {
    this.validateActive();
    return this.ioMutex.runExclusive(async () => {
      const fullDirPath = path.join(this.objPath, subdirNameOrRelPath);
      this.validateManagedDirectoryPath(fullDirPath);

      const dirents = await readdir(fullDirPath, { withFileTypes: true });
      return dirents.filter(dirent => {
        return dirent.isDirectory();
      });
    });
  };

  /**
   * Gets all files in the managed directory or subdirectory with locking.
   * @param subdirNameOrRelPath If specified, gets files in the relative path to the subdirectory.
   * @returns An array of directory entries that are only files.
   */
  async getFilesExclusive(subdirNameOrRelPath = '') {
    this.validateActive();
    return this.ioMutex.runExclusive(async () => {
      const fullDirPath = path.join(this.objPath, subdirNameOrRelPath);
      this.validateManagedDirectoryPath(fullDirPath);

      const dirents = await readdir(fullDirPath, { withFileTypes: true });
      return dirents.filter(dirent => {
        return dirent.isFile();
      });
    });
  };

  /**
   * Reads the entire contents of a file with locking.
   * @async
   * @param fileNameOrRelPath The name or relative path to the file to read.
   * @param options Either the encoding for the result, or an object that contains the encoding and an optional flag.
   * If a flag is not provided, it defaults to `'r'`. If no option is specified,
   * the default encoding used is `'utf8'` with the default flag `'r'`.
   * @returns File contents as a string.
   */
  async readFileExclusive(
    fileNameOrRelPath: string,
    options: 
      | ({
          encoding: BufferEncoding;
          flag?: string | undefined;
        } & Abortable)
      | BufferEncoding = 'utf8'
  ) {
    this.validateActive();
    return this.ioMutex.runExclusive(async () => { 
      const fullFilePath = path.join(this.objPath, fileNameOrRelPath);
      this.validateManagedDirectoryPath(path.dirname(fullFilePath));

      return readFile(fullFilePath, options);
    });
  };

  /**
   * Renames the managed directory with locking.
   * @async
   * @param newDirName The new name for the directory.
   */
  async renameExclusive(newDirName: string) {
    this.validateActive();
    if (path.basename(this.objPath) !== path.resolve(newDirName)) {
      return;
    };
    
    return this.ioMutex.runExclusive(async () => {
      this.validateManagedDirectoryPath(newDirName);
      const renamedObjPath = path.join(path.dirname(this.objPath), newDirName);
      this.validateManagedDirectoryPath(renamedObjPath);

      let newDirExists = false;
      try {
        const targetStat = await stat(renamedObjPath);
        if (targetStat.isDirectory()) {
          newDirExists = true;
        };
      } catch { };
      if (newDirExists) {
        throw new Error('A directory with the same name as new requested name for the directory already exists.');
      };

      await rename(this.objPath, renamedObjPath);
      const fsMutex = ConcurrentFileSystemObject.fsObjMutexes.get(this.objPath);
      if (fsMutex !== undefined) {
        ConcurrentFileSystemObject.fsObjMutexes.set(renamedObjPath, fsMutex);
        ConcurrentFileSystemObject.fsObjMutexes.delete(this.objPath);
      } else {
        ConcurrentFileSystemObject.fsObjMutexes.set(
          renamedObjPath,
          { mutex: this.ioMutex, instances: 1 }
        );
      };
      this.objPath = renamedObjPath;
    });
  };

  /**
   * Renames or moves a file or path to a file with locking.
   * If the new file name already exists, the file is overwritten.
   * @async
   * @param fileNameOrRelPath The name or relative path to the file to rename.
   * @param newFileNameOrRelPath The new name or relative path to the file.
   */
  async renameOrMoveFileExclusive(
    fileNameOrRelPath: string,
    newFileNameOrRelPath: string
  ) {
    this.validateActive();
    return this.ioMutex.runExclusive(async () => {
      const fullFilePath = path.join(this.objPath, fileNameOrRelPath);
      const newFullFilePath = path.join(this.objPath, newFileNameOrRelPath);

      const currentStat = await stat(fullFilePath);
      if (currentStat.isFile()) {
        this.validatePath(newFileNameOrRelPath);
      } else {
        throw new Error('Specified path is not a file.');
      };
      this.validateManagedFilePath(fullFilePath);
      this.validatePath(newFullFilePath);
      await mkdir(path.dirname(newFullFilePath), { recursive: true });

      return rename(fullFilePath, newFullFilePath);
    });
  };

  /**
   * Removes a file with locking.
   * @param fileNameOrRelPath The name or relative path to the file to remove.
   */
  async removeFileExclusive(fileNameOrRelPath: string) {
    this.validateActive();
    return this.ioMutex.runExclusive(async () => {
      const fullFilePath = path.join(this.objPath, fileNameOrRelPath);
      this.validateManagedFilePath(fullFilePath);

      return unlink(fullFilePath);
    });
  };

  /**
   * Removes a subdirectory and its contents with locking.
   * @param subdirNameOrRelPath The name or relative path to the subdirectory to remove.
   */
  async removeSubdirectoryExclusive(subdirNameOrRelPath: string) {
    this.validateActive();
    return this.ioMutex.runExclusive(async () => {
      const fullDirPath = path.join(this.objPath, subdirNameOrRelPath);
      this.validateManagedDirectoryPath(fullDirPath); 
      if (path.resolve(fullDirPath) === this.objPath) {
        throw new Error('Cannot remove the managed directory.');
      };

      const direntPaths = await this.getDirectoryDirents(fullDirPath);
      for (const filePath of direntPaths.filePaths) {
        this.validateManagedFilePath(filePath);
      };
      for (const dirPath of direntPaths.dirPaths) {
        this.validateManagedDirectoryPath(dirPath);
      };
      return rm(subdirNameOrRelPath, { recursive: true, force: true });
    });
  };

  /**
   * Writes data to a file or creates a new file with locking.
   * @async
   * @param fileNameOrRelPath The name or relative path to the file to write data to.
   * @param data The data to write. If something other than a Buffer or Uint8Array is provided,
   * the value is coerced to a string.
   */
  async writeFileExclusive(
    fileNameOrRelPath: string,
    data: 
      | string
      | NodeJS.ArrayBufferView
      | Iterable<string | NodeJS.ArrayBufferView>
      | AsyncIterable<string | NodeJS.ArrayBufferView>
      | Stream
  ) {
    this.validateActive();
    return this.ioMutex.runExclusive(async () => { 
      const fullFilePath = path.join(this.objPath, fileNameOrRelPath);
      this.validateManagedFilePath(fullFilePath);
      
      return writeFile(fullFilePath, data);
    });
  };

  /**
   * Resursively gets all directory entries within a directory.
   * @param dirPath The directory to check for directory entries.
   * @param subdirPaths A starting array of current directory entries.
   */
  private async getDirectoryDirents(
    dirPath: string,
    filePaths: string[] = [],
    dirPaths: string[] = []
  ) {
    const fullDirPath = path.join(this.objPath, dirPath);
    const dirents = await readdir(fullDirPath, { withFileTypes: true });
    for (const dirent of dirents) {
      const fullDirentPath = path.join(fullDirPath, dirent.name);
      if (dirent.isFile()) {
        filePaths.push(fullDirentPath);
      };
      if (dirent.isDirectory()) {
        dirPaths.push(fullDirentPath);
        await this.getDirectoryDirents(fullDirentPath, filePaths, dirPaths);
      };
    };
    return { filePaths, dirPaths };
  };

  /**
   * Checks if a directory path can be interacted with by this instance.
   * @param dirPath The path to a directory to validate.
   */
  private validateManagedDirectoryPath(dirPath: string) {
    const resolvedDirPath = path.resolve(dirPath);
    if (resolvedDirPath !== this.objPath) {
      if (!resolvedDirPath.includes(this.objPath)) {
        throw Error(`Invalid path specified. '${dirPath}' is not within '${this.objPath}'.`);
      } else if (ConcurrentFileSystemObject.fsObjMutexes.has(resolvedDirPath)) {
        throw Error(`Cannot interact with '${dirPath}', as it is managed by a different mutex.`);
      };
      this.validatePath(dirPath);
    };
  };

  /**
   * Checks if a file path can be interacted with by this instance.
   * @param filePath The path to a file to validate.
   */
  private validateManagedFilePath(filePath: string) {
    if (ConcurrentFileSystemObject.fsObjMutexes.has(filePath)) {
      throw Error(`Cannot interact with '${filePath}', as it is managed by a different mutex.`);
    };
    this.validateManagedDirectoryPath(path.dirname(filePath));
  };
};