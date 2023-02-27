import path from 'path';
import { 
  ScenarioFileExtension,
  ScenarioFileExtensionArray
} from '@modules/openrct2/data/types';

/** Represents a RollerCoaster Tycoon scenario file. */
export class ScenarioFile {

  /** Gets the file path to the scenario file. */
  readonly path: string;

  /** Gets the file extension of the scenario file. */
  readonly fileExtension: string;

  constructor(path: string) {
    const scenarioExtension = ScenarioFileExtensionArray.find(ext => {
      return path.endsWith(ext);
    });
    if (!scenarioExtension) {
      throw new Error('A scenario file must have a valid OpenRCT2 scenario file extension.');
    };

    this.path = path;
    this.fileExtension = scenarioExtension;
  };

  /** Gets the name of the scenario file. */
  get name() {
    return path.basename(this.path);
  };

  /** Gets the name of the scenario file without its file extension. */
  get nameNoExtension() {
    return this.name.substr(0, this.name.lastIndexOf(this.fileExtension));
  };

  /**
   * Checks if the scenario file has any of the specified file extensions.
   * @returns `true` if a file extension was matched; otherwise, `false`
   */
  hasFileExtension(...fileExtensions: ScenarioFileExtension[]) {
    return fileExtensions.some(ext => {
      return this.fileExtension.toLowerCase() === ext;
    });
  };
};