import { EOL } from 'os';
import { Configuration } from '@modules/configuration';
import { ConcurrentDirectory } from '@modules/io';
import { createDateTimestamp } from '@modules/utils/string-utils';

/** Represents a generic logger. */
export class Logger {
  private static readonly dirKey = 'logs';

  private readonly logDir: ConcurrentDirectory;

  constructor(config: Configuration) {
    this.logDir = new ConcurrentDirectory(config.getDirectoryPath(Logger.dirKey));
  };

  /**
   * Adds a log message to today's log file.
   * @async
   * @param log The log message to write.
   */
  async writeLog(log: string) {
    const logFileName = `${this.getDateString(new Date())}.log`;
    const fullLog = `[${createDateTimestamp()}] ${log}${EOL}`;
    await this.logDir.appendFileExclusive(logFileName, fullLog);
  };

  /**
   * Adds an error message to today's error log file.
   * @async
   * @param err The error object to write with its message and stack data.
   */
  async writeError(err: Error) {
    const logFileName = `${this.getDateString(new Date())}.error`;
    const fullLog = `[${createDateTimestamp()}] ${err.message}${err.stack ? ` ${err.stack}` : ''}${EOL}`;
    await this.logDir.appendFileExclusive(logFileName, fullLog);
  };

  private getDateString(date: Date) {
    return `${
      date.getUTCFullYear().toString().padStart(4, '0')
    }${
      (date.getUTCMonth() + 1).toString().padStart(2, '0')
    }${
      date.getUTCDate().toString().padStart(2, '0')
    }`;
  };
};