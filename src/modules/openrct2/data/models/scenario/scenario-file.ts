import path from 'path';
import { 
  ScenarioFileExtension,
  ScenarioFileExtensionArray
} from '@modules/openrct2/data/types';
import { areStringsEqualCaseInsensitive } from '@modules/utils/string-utils';

/** Represents a RollerCoaster Tycoon scenario file. */
export class ScenarioFile {

  /** Gets the file path to the scenario file. */
  readonly path: string;

  /** Gets the file extension of the scenario file. */
  readonly fileExtension: ScenarioFileExtension;

  constructor(path: string) {
    const scenarioExtension = ScenarioFileExtensionArray.find(ext => {
      const fileExtension = path.substring(path.lastIndexOf('.'));
      return areStringsEqualCaseInsensitive(fileExtension, ext);
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
  hasFileExtension(...fileExtensions: ScenarioFileExtension[]) {
    return fileExtensions.some(ext => {
      return areStringsEqualCaseInsensitive(ext, this.fileExtension);
    });
  };
};