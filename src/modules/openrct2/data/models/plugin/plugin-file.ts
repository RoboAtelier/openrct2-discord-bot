import path from 'path';

/** Represents an OpenRCT2 plugin file. */
export class PluginFile {
  constructor(
    /** Gets the file path to the plugin file. */
    public readonly path: string
  ) { };

  /** Gets the name of the plugin file. */
  get name() {
    return path.basename(this.path);
  };
};