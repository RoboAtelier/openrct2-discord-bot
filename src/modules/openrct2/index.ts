
export namespace OpenRCT2 {


  /** Represents a supported file extension for precompiled OpenRCT2 builds. */
  export type BuildFileExtension = typeof BuildFileExtensionArray[number];
  export const BuildFileExtensionArray = <const>['.zip', '.tar.gz'];
  
  /** Represents a category name within the OpenRCT2 configuration file. */
  export type ConfigurationCategory = typeof ConfigurationCategoryArray[number];
  export const ConfigurationCategoryArray = <const>[
    'general',
    'interface',
    'sound',
    'network',
    'notifications',
    'font',
    'plugin'
  ];

  /** Specifies a file name for this module's custom plugins for OpenRCT2. */
  export enum PluginFileName {
    ServerAdapter = 'server-adapter.js',
    Welcome = 'welcome.js'
  };

  export const ServerAdapterPluginName = 'Server Adapter Plugin';

  /** Represents a valid RollerCoaster Tycoon scenario file extension. */
  export type ScenarioFileExtension = typeof ScenarioFileExtensionArray[number];
  export const ScenarioFileExtensionArray = <const>['.sc4', '.sv4', '.sc6', '.sv6', '.park'];

  /** Represents a valid RollerCoaster Tycoon scenario save file extension. */
  export type ScenarioSaveFileExtension = typeof ScenarioSaveFileExtensionArray[number];
  export const ScenarioSaveFileExtensionArray = <const>['.sv4', '.sv6', '.park'];

  /** Specifies the subdirectory name and path within a OpenRCT2 server directory. */
  export enum ServerSubdirectoryName {
    Autosave = 'save/autosave',
    ChatLogs = 'chatlogs',
    Plugin = 'plugin',
    Save = 'save',
    Screenshot = 'screenshot',
    ServerLogs = 'serverlogs'
  };
};
