import path from 'path';
import { Abortable } from 'events';
import { Stream } from 'stream';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync
} from 'fs';
import {
  appendFile, 
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
  FileHandle
} from 'fs/promises';
import {
  ConcurrentFileSystemObject,
  FixedPathReadStream,
  FixedPathWriteStream
} from '.';
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
   * Creates a read stream on a managed file path.
   * @param fileNameOrRelPath The name or relative path to the file to read data from.
   * @param options An optional encoding or an object that contains optional flags.
   * See https://nodejs.org/api/fs.html#fscreatereadstreampath-options.
   * @returns A read stream to a fixed file path.
   */
  createFixedPathReadStream(
    fileNameOrRelPath: string,
    options?: BufferEncoding | {
      flags?: string,
      encoding?: BufferEncoding,
      fd?: number | FileHandle,
      mode?: number,
      autoClose?: boolean,
      emitClose?: boolean,
      start?: number,
      highWaterMark?: number,
      end?: number
    }
  ) {
    this.validateActive();
    const fullFilePath = path.join(this.objPath, fileNameOrRelPath);
    this.validateManagedFilePath(fullFilePath);

    return createReadStream(fullFilePath, options) as FixedPathReadStream;
  };

  /**
   * Creates a write stream on a managed file path.
   * @param fileNameOrRelPath The name or relative path to the file to write data to.
   * @param options An optional encoding or an object that contains optional flags.
   * See https://nodejs.org/api/fs.html#fscreatewritestreampath-options.
   * @returns A write stream to a fixed file path.
   */
  createFixedPathWriteStream(
    fileNameOrRelPath: string,
    options?: BufferEncoding | {
      flags?: string,
      encoding?: BufferEncoding,
      fd?: number | FileHandle,
      mode?: number,
      autoClose?: boolean,
      emitClose?: boolean,
      start?: number,
      highWaterMark?: number
    }
  ) {
    this.validateActive();
    const fullFilePath = path.join(this.objPath, fileNameOrRelPath);
    this.validateManagedFilePath(fullFilePath);

    return createWriteStream(fullFilePath, options) as FixedPathWriteStream;
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
   * @async
   * @param newSubdirNameOrRelPath The name or relative path to the subdirectory to create.
   * @param options An object optionally specifying the file mode and whether subdirectories are created recursively.
   * If a string for the file mode is passed, it is parsed as an octal integer.
   * If a file mode is not specified, defaults to `0o777`.
   * If no options are specified, subdirectories are created recursively by default.
   */
  async createSubdirectoryExclusive(
    newSubdirNameOrRelPath: string,
    options: {
      mode?: string | number,
      recursive?: boolean
    } = { recursive: true }
  ) {
    this.validateActive();
    return this.ioMutex.runExclusive(async () => {
      const fullDirPath = path.join(this.objPath, newSubdirNameOrRelPath);
      this.validateManagedDirectoryPath(fullDirPath);
      
      return mkdir(fullDirPath, options);
    });
  };

  /**
   * Gets all directory entries in the managed directory or subdirectory with locking.
   * @async
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
   * @async
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
   * @async
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
   * Reads the entire contents of a file as a string with locking.
   * @async
   * @param fileNameOrRelPath The name or relative path to the file to read.
   * @param options Either the encoding for the result, or an object that contains the encoding and an optional flag.
   * If a flag is not provided, it defaults to `'r'`.
   * @returns File contents as a string of the specified encoding.
   */
  async readFileAsStringExclusive(
    fileNameOrRelPath: string,
    options: 
      | ({
          encoding: BufferEncoding;
          flag?: number | string;
        } & Abortable)
      | BufferEncoding
  ) {
    this.validateActive();
    return this.ioMutex.runExclusive(async () => { 
      const fullFilePath = path.join(this.objPath, fileNameOrRelPath);
      this.validateManagedDirectoryPath(path.dirname(fullFilePath));

      return readFile(fullFilePath, options);
    });
  };

  /**
   * Reads the entire contents of a file as a buffer with locking.
   * @async
   * @param fileNameOrRelPath The name or relative path to the file to read.
   * @param options An object that contains an optional flag.
   * If a flag is not provided or no option is specified, it defaults to `'r'`.
   * @returns File contents as a buffer.
   */
    async readFileAsBufferExclusive(
      fileNameOrRelPath: string,
      options?: 
        ({
          flag?: number | string;
        } & Abortable)
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
        throw new Error(`A directory with the name ${newDirName} already exists in the same parent directory.`);
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
        this.validateManagedFilePath(fullFilePath);
        this.validateManagedFilePath(newFullFilePath);
      } else {
        throw new Error(`Specified name ${fileNameOrRelPath} did not point to a file.`);
      };
      
      await mkdir(path.dirname(newFullFilePath), { recursive: true });
      return rename(fullFilePath, newFullFilePath);
    });
  };

  /**
   * Renames or moves a subdirectory or path to a subdirectory with locking.
   * If the new subdirectory name already exists, the operation will fail.
   * @async
   * @param subdirNameOrRelPath The name or relative path to the subdirectory to rename.
   * @param newSubdirNameOrRelPath The new name or relative path to the subdirectory.
   */
  async renameOrMoveSubdirectoryExclusive(
    subdirNameOrRelPath: string,
    newSubdirNameOrRelPath: string
  ) {
    this.validateActive();
    return this.ioMutex.runExclusive(async () => {
      const fullDirPath = path.join(this.objPath, subdirNameOrRelPath);
      const newFullDirPath = path.join(this.objPath, newSubdirNameOrRelPath);

      const currentStat = await stat(fullDirPath);
      if (currentStat.isDirectory()) {
        this.validateManagedDirectoryPath(fullDirPath);
        this.validateManagedDirectoryPath(newFullDirPath);
      } else {
        throw new Error(`Specified name ${subdirNameOrRelPath} did not point to a directory.`);
      };
      if (existsSync(newFullDirPath)) {
        throw new Error(`Can't rename ${subdirNameOrRelPath} as ${newSubdirNameOrRelPath} already exists.`);
      };

      const direntPaths = await this.getSubdirectoryDirentPaths(subdirNameOrRelPath);
      for (const filePath of direntPaths.filePaths) {
        this.validateManagedFilePath(filePath);
      };
      for (const dirPath of direntPaths.subdirPaths) {
        this.validateManagedDirectoryPath(dirPath);
      };
      return rename(fullDirPath, newFullDirPath);
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
      if (existsSync(fullFilePath)) {
        return unlink(fullFilePath);
      };
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
        throw new Error(`Cannot remove the managed directory ${fullDirPath}.`);
      } else if (existsSync(fullDirPath)) {
        const direntPaths = await this.getSubdirectoryDirentPaths(subdirNameOrRelPath);
        for (const filePath of direntPaths.filePaths) {
          this.validateManagedFilePath(filePath);
        };
        for (const dirPath of direntPaths.subdirPaths) {
          this.validateManagedDirectoryPath(dirPath);
        };
        return rm(fullDirPath, { recursive: true, force: true });
      };
    });
  };

  /**
   * Writes data to a file or creates a new file with locking.
   * @async
   * @param fileNameOrRelPath The name or relative path to the file to write data to.
   * @param data The data to write. If something other than a Buffer or Uint8Array is provided,
   * the value is coerced to a string.
   * @param options An encoding name or an object that contains the encoding and an optional flag.
   * If an encoding is not provided or no option is specified, it defaults to `'utf8'`.
   */
  async writeFileExclusive(
    fileNameOrRelPath: string,
    data: 
      | string
      | NodeJS.ArrayBufferView
      | Iterable<string | NodeJS.ArrayBufferView>
      | AsyncIterable<string | NodeJS.ArrayBufferView>
      | Stream,
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
      this.validateManagedFilePath(fullFilePath);
      
      return writeFile(fullFilePath, data, options);
    });
  };

  /**
   * Appends data to a file or creates a new file with locking.
   * @async
   * @param fileNameOrRelPath The name or relative path to the file to append data to.
   * @param data The data to append to the file.
   * @param options A buffer encoding or an object that contains the encoding and an optional flag.
   * If an encoding is not provided or no option is specified, it defaults to `'utf8'`.
   */
  async appendFileExclusive(
    fileNameOrRelPath: string,
    data: 
      | string
      | Uint8Array,
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
      this.validateManagedFilePath(fullFilePath);
      
      return appendFile(fullFilePath, data, options);
    });
  };

  /**
   * Resursively gets all directory entries within a subdirectory.
   * @param subdirPath The directory to check for directory entries.
   * @param filePaths A starting array of current file paths.
   * @param subdirPaths A starting array of current directory paths.
   * @returns All discovered directory entry paths in the specified directory.
   */
  private async getSubdirectoryDirentPaths(
    subdirPath: string,
    filePaths: string[] = [],
    subdirPaths: string[] = []
  ) {
    const fullDirPath = path.join(this.objPath, subdirPath);
    const dirents = await readdir(fullDirPath, { withFileTypes: true });
    for (const dirent of dirents) {
      const fullDirentPath = path.join(fullDirPath, dirent.name);
      if (dirent.isFile()) {
        filePaths.push(fullDirentPath);
      };
      if (dirent.isDirectory()) {
        subdirPaths.push(fullDirentPath);
        const innerSubdirPath = path.join(subdirPath, dirent.name);
        await this.getSubdirectoryDirentPaths(innerSubdirPath, filePaths, subdirPaths);
      };
    };
    return { filePaths, subdirPaths };
  };

  /**
   * Checks if a directory path can be interacted with by this instance.
   * @param dirPath The path to a directory to validate.
   */
  private validateManagedDirectoryPath(dirPath: string) {
    const resolvedDirPath = path.resolve(dirPath);
    if (resolvedDirPath !== this.objPath) {
      if (!resolvedDirPath.includes(this.objPath)) {
        throw Error(`Invalid path specified. ${dirPath} is not within ${this.objPath}.`);
      } else if (ConcurrentFileSystemObject.fsObjMutexes.has(resolvedDirPath)) {
        throw Error(`Cannot interact with ${dirPath}, as it is managed by a different mutex.`);
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
      throw Error(`Cannot interact with ${filePath}, as it is managed by a different mutex.`);
    };
    this.validateManagedDirectoryPath(path.dirname(filePath));
  };
};