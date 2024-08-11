declare namespace OpenRCT2Module {

  /** Represents adapter request names and their respective argument types. */
  type AdapterRequest = {
    'chat': string;
    'group.list': undefined;
    'park.entrance.toggle': undefined;
    'pause.toggle': undefined;
    'player.group.set': {
      playerId: number,
      groupId: number
    }; 
    'player.kick': number;
    'player.list': undefined;
    'save': undefined;
    'scenario': undefined;
    'scenario.status': undefined;
    'screenshot': undefined;
  };

  type AdapterRequestResponse = {
    [R in keyof AdapterRequest]: AdapterResponse[R]
  };

  /** Represents adapter response names and their respective return types. */
  type AdapterResponse = {
    'chat': void;
    'group.list': {
      id: number,
      name: string
    }[];
    'park.entrance.toggle': void;
    'pause.toggle': void;
    'player.group.set': {
      id: number,
      name: string,
      group: string,
    }?;
    'player.kick': string?;
    'player.list': {
      id: number,
      name: string,
      groupId: number,
      group: string,
    }[];
    'plugin.error': string;
    'save': string;
    'scenario': {
      name: string,
      details: string,
      fileName: string,
      objective: {
        type:
          | "none"
          | "guestsBy"
          | "parkValueBy"
          | "haveFun"
          | "buildTheBest"
          | "10Rollercoasters"
          | "guestsAndRating"
          | "monthlyRideIncome"
          | "10RollercoastersLength"
          | "finish5Rollercoasters"
          | "repayLoanAndParkValue"
          | "monthlyFoodIncome",
        guests: number,
        year: number,
        length: number,
        excitement: number,
        parkValue: number,
        monthlyIncome: number
      },
      status: 'inProgress' | 'completed' | 'failed'
    };
    'scenario.status': {
      name: string,
      fileName: string,
      status: 'inProgress' | 'completed' | 'failed',
      ticks: number
    };
    'screenshot': string;

    'network.chat': {
      playerName: string,
      message: string
    };
    'network.join': string;
    'network.leave': string;
  };

  /** Represents a supported file extension for precompiled OpenRCT2 builds. */
  type BuildFileExtension = typeof BuildFileExtensionArray[number];
  const BuildFileExtensionArray = <const>['.zip', '.tar.gz'];
  
  /** Represents a category name within the OpenRCT2 configuration file. */
  type ConfigurationCategory = typeof OpenRCT2GameConfigurationCategoryArray[number];
  const ConfigurationCategoryArray = <const>[
    'general',
    'interface',
    'sound',
    'network',
    'notifications',
    'font',
    'plugin'
  ];

  /** Specifies a file name for this module's custom plugins for OpenRCT2. */
  enum PluginFileName {
    ServerAdapter = 'server-adapter.js',
    Welcome = 'welcome.js'
  };

  const ServerAdapterPluginName = 'Server Adapter Plugin';

  /** Represents a valid RollerCoaster Tycoon scenario file extension. */
  type ScenarioFileExtension = typeof ScenarioFileExtensionArray[number];
  const ScenarioFileExtensionArray = <const>['.sc4', '.sv4', '.sc6', '.sv6', '.park'];

  /** Represents a valid RollerCoaster Tycoon scenario save file extension. */
  type ScenarioSaveFileExtension = typeof ScenarioSaveFileExtensionArray[number];
  const ScenarioSaveFileExtensionArray = <const>['.sv4', '.sv6', '.park'];

  /** Specifies the subdirectory name and path within a OpenRCT2 server directory. */
  enum ServerSubdirectoryName {
    Autosave = 'save/autosave',
    ChatLogs = 'chatlogs',
    Plugin = 'plugin',
    Save = 'save',
    Screenshot = 'screenshot',
    ServerLogs = 'serverlogs'
  };
};