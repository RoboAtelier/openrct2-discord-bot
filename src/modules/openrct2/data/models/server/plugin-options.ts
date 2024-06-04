import { SerializableObject } from '@modules/io';

/** 
 * Represents bot plugin options for a hosted OpenRCT2 game server instance.
 * This should not apply to external plugins that were sourced elsewhere.
 */
export class PluginOptions extends SerializableObject<PluginOptions> {

  /** Gets or sets the plugins in use. */
  plugins: string[];

  /** Gets or sets the port number for the server adapter plugin. */
  adapterPluginPort: number;

  /** Gets or sets the welcome message properties for the welcome plugin. */
  welcomeMessage: {
    title: string;
    bodyLines: [number, string][];
    bodyAlignment: 'left' | 'centred';
    listTitle?: string;
    listLines?: [number, string][];
    listAlignment?: 'left' | 'centred';
    footerLines?: [number, string][];
    footerAlignment?: 'left' | 'centred';
  };

  constructor(
    plugins = [],
    adapterPluginPort = -1,
    welcomeMessage = {
      title: '',
      bodyLines: [],
      bodyAlignment: <const>'left'
    }
  ) {
    super();
    this.plugins = plugins;
    this.adapterPluginPort = adapterPluginPort;
    this.welcomeMessage = welcomeMessage;
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