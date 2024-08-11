import { SerializableObject } from '@modules/io';

/** 
 * Represents plugin options for custom OpenRCT2 module plugins.
 * This would not apply to external plugins that were sourced elsewhere.
 */
export class PluginOptions extends SerializableObject<PluginOptions> {
  constructor(
    /** Gets or sets the module plugins in use. */
    public plugins: OpenRCT2Module.PluginFileName[] = [],

    /** Gets or sets the port number for the server adapter plugin. */
    public adapterPluginPort = -1,

    /** Gets or sets the welcome message properties for the welcome plugin. */
    public welcomeMessage: {
      title: string;
      bodyLines: [number, string][];
      bodyAlignment: 'left' | 'centred';
      listTitle?: string;
      listLines?: [number, string][];
      listAlignment?: 'left' | 'centred';
      footerLines?: [number, string][];
      footerAlignment?: 'left' | 'centred';
    } = {
      title: '',
      bodyLines: [],
      bodyAlignment: <const>'left'
    }
  ) {
    super();
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