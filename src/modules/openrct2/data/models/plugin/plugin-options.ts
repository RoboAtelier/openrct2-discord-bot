import { SerializableObject } from '@modules/io';

/** 
 * Represents bot plugin options for a hosted OpenRCT2 game server instance.
 * This should not apply to external plugins that were sourced elsewhere.
 */
export class PluginOptions extends SerializableObject<PluginOptions> {

  /** Specifies if a game server will use managed bot plugins. */
  useBotPlugins: boolean;

  /** Gets or sets the port number for the server adapter plugin. */
  adapterPluginPort: number;

  constructor(
    useBotPlugins = false,
    adapterPluginPort = -1
  ) {
    super();
    this.useBotPlugins = useBotPlugins;
    this.adapterPluginPort = adapterPluginPort;
  };

  fromDataString(dataStr: string) {
    const json = JSON.parse(dataStr);
    if (this.isPartialType(json)) {
      const defaultObj = { ...new PluginOptions() } as any;
      const objProperties = Object.getOwnPropertyNames(defaultObj);
      for (const property of objProperties) {
        if (json[property] !== undefined) {
          defaultObj[property] = json[property];
        };
      };
      return new PluginOptions(...(Object.values(defaultObj) as any[]));
    };
    throw new Error(`The data could not be converted to '${PluginOptions.name}'.`);
  };

  toDataString() {
    return JSON.stringify(this, null, 2);
  };
};