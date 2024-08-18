import path from 'path';
import { OpenRCT2 } from '@modules/openrct2/index.js';
import { areStringsEqualCaseInsensitive } from '@modules/utils/string-utils.js';

/** Represents a RollerCoaster Tycoon scenario file. */
export class ScenarioFile {

  /** Gets the file path to the scenario file. */
  readonly path: string;

  /** Gets the file extension of the scenario file. */
  readonly fileExtension: OpenRCT2.ScenarioFileExtension;

  constructor(path: string) {
    const scenarioExtension = OpenRCT2.ScenarioFileExtensionArray.find(ext => {
      const filePath = path.toLocaleLowerCase();
      return filePath.endsWith(ext);
    });
    if (scenarioExtension) {
      this.path = path;
      this.fileExtension = scenarioExtension;
    } else {
      throw new Error('A scenario file must have a valid OpenRCT2 scenario file extension.');
    };
  };

  /** Gets the name of the scenario file. */
  get name() {
    return path.basename(this.path);
  };

  /** Gets the name of the scenario file without its file extension. */
  get nameNoExtension() {
    return this.name.substring(0, this.name.lastIndexOf('.'));
  };

  /**
   * Checks if the scenario file has any of the specified file extensions.
   * @returns `true` if a file extension was matched; otherwise, `false`
   */
  hasFileExtension(...fileExtensions: OpenRCT2.ScenarioFileExtension[]) {
    return fileExtensions.some(ext => {
      return areStringsEqualCaseInsensitive(ext, this.fileExtension);
    });
  };
};