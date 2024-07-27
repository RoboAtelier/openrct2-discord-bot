import path from 'path';
import {
  bold,
  ChatInputCommandInteraction,
  italic,
  underscore,
} from 'discord.js';
import { EOL } from 'os';
import { 
  CommandPermissionLevel,
  CommandResponseBuilder,
  SubcommandsDiscordBotCommand
} from '@modules/discord/commands';
import { OpenRCT2ServerController } from '@modules/openrct2/controllers';
import {
  ScenarioQueue,
  StartupOptions,
  PluginOptions
} from '@modules/openrct2/data/models';
import { 
  OpenRCT2BuildRepository,
  PluginRepository,
  ScenarioRepository,
  ServerHostRepository
} from '@modules/openrct2/data/repositories';
import { BotPluginFileName } from '@modules/openrct2/data/types';
import { fisherYatesShuffle } from '@modules/utils/array-utils';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils';

type TextAlignment = 'left' | 'centred';
type TextFormat = '[clear]' | '[blank]';

const TextAlignmentChoices = [
  { name: 'Left', value: 'left' },
  { name: 'Centered', value: 'centred' }
];
const TextFormatChoices = [
  { name: 'Clear', value: '[clear]' },
  { name: 'Blank', value: '[blank]' }
];

const ServerSubcommandGroups = <const>[
  {
    name: 'scenario',
    subcommands: [
      {
        name: 'start',
        description: 'Starts an OpenRCT2 game server on a scenario.',
        options: [
          {
            name: 'name',
            type: 'string',
            description: 'The name of the scenario file to open.',
            required: true
          },
          {
            name: 'server-id',
            type: 'integer',
            description: 'The id number of the server to start.',
            minValue: 1
          }
        ]
      },
      {
        name: 'autosave-start',
        description: 'Starts an OpenRCT2 game server on an autosave.',
        options: [
          {
            name: 'index',
            type: 'integer',
            description: 'The autosave file ordinal to open.',
            minValue: 1
          },
          {
            name: 'server-id',
            type: 'integer',
            description: 'The id number of the server to start.',
            minValue: 1
          }
        ]
      },
      {
        name: 'random-start',
        description: 'Starts an OpenRCT2 game server on a random scenario.',
        options: [{
          name: 'server-id',
          type: 'integer',
          description: 'The id number of the server to start.',
          minValue: 1
        }]
      },
    ]
  },
  {
    name: 'queue',
    subcommands: [
      {
        name: 'start',
        description: 'Opens an OpenRCT2 game server on a queued scenario.',
        options: [
          {
            name: 'defer',
            type: 'boolean',
            description: 'To delay the scenario start or not.',
          },
          {
            name: 'server-id',
            type: 'integer',
            description: 'The id number of the server to start.',
            minValue: 1
          }
        ]
      },
      {
        name: 'set',
        description: 'Sets the queue options of an OpenRCT2 server.',
        permissionLevel: CommandPermissionLevel.Moderator,
        options: [
          {
            name: 'size',
            type: 'integer',
            description: 'The new size for the queue.',
            minValue: 1
          },
          {
            name: 'server-id',
            type: 'integer',
            description: 'The id number of the server to start.',
            minValue: 1
          }
        ]
      }
    ]
  },
  {
    name: 'startup',
    permissionLevel: CommandPermissionLevel.Moderator,
    subcommands: [{
      name: 'set',
      description: 'Sets startup options of an OpenRCT2 server.',
      options: [
        {
          name: 'headless',
          type: 'boolean',
          description: 'To start the server as headless or not.',
        },
        {
          name: 'port',
          type: 'integer',
          description: 'The new port number.',
          minValue: Math.pow(2, 10) + 1,
          maxValue: Math.pow(2, 16) - 1
        },
        {
          name: 'server-id',
          type: 'integer',
          description: 'The id number of the server to update.',
          minValue: 1
        }
      ]
    }]
  },
  {
    name: 'build',
    permissionLevel: CommandPermissionLevel.Moderator,
    subcommands: [{
      name: 'set',
      description: 'Sets the target game version of an OpenRCT2 server.',
      options: [
        {
          name: 'version',
          type: 'string',
          description: 'The build version number. Format is v#.#.#',
          required: true,
          minLength: 5
        },
        {
          name: 'os',
          type: 'string',
          description: 'The operating system name.',
          required: true
        },
        {
          name: 'commit',
          type: 'string',
          description: 'The commit header for a develop build.',
          minLength: 7,
          maxLength: 7
        },
        {
          name: 'codename',
          type: 'string',
          description: 'The version codename for a related Linux operating system.'
        },
        {
          name: 'architecture',
          type: 'string',
          description: 'The target operating system CPU architecture.'
        },
        {
          name: 'server-id',
          type: 'integer',
          description: 'The id number of the server to update.',
          minValue: 1
        }
      ]
    }]
  },
  {
    name: 'adapter',
    permissionLevel: CommandPermissionLevel.Moderator,
    subcommands: [{
      name: 'set',
      description: 'Sets server adapter plugin properties of an OpenRCT2 server.',
      options: [
        {
          name: 'enable',
          type: 'boolean',
          description: 'To enable the server adapter plugin or not.'
        },
        {
          name: 'adapter-port',
          type: 'string',
          description: 'The new port number for the server adapter plugin.',
          minValue: Math.pow(2, 10) + 1,
          maxValue: Math.pow(2, 16) - 1
        },
        {
          name: 'server-id',
          type: 'integer',
          description: 'The id number of the server to update.',
          minValue: 1
        }
      ]
    }]
  },
  {
    name: 'welcome',
    permissionLevel: CommandPermissionLevel.Moderator,
    subcommands: [
      {
        name: 'plugin-set',
        description: 'Sets welcome plugin properties of an OpenRCT2 server.',
        options: [
          {
            name: 'enable',
            type: 'boolean',
            description: 'To enable the server welcome plugin or not.'
          },
          {
            name: 'server-id',
            type: 'integer',
            description: 'The id number of the server to update.',
            minValue: 1
          }
        ]
      },
      {
        name: 'text-set',
        description: 'Sets the welcome plugin message text of an OpenRCT2 server.',
        options: [
          {
            name: 'window-title',
            type: 'string',
            description: 'The title for the welcome window.',
            minLength: 1,
            maxLength: 50
          },
          {
            name: 'body-1',
            type: 'string',
            description: 'Line 1 of the welcome message body.',
            minLength: 1,
            maxLength: 200
          },
          {
            name: 'body-2',
            type: 'string',
            description: 'Line 2 of the welcome message body.',
            minLength: 1,
            maxLength: 200
          },
          {
            name: 'body-3',
            type: 'string',
            description: 'Line 3 of the welcome message body.',
            minLength: 1,
            maxLength: 200
          },
          {
            name: 'list-title',
            type: 'string',
            description: 'The title of a list in the welcome message.',
            minLength: 1,
            maxLength: 50
          },
          {
            name: 'list-1',
            type: 'string',
            description: 'Line 1 of the welcome message list.',
            minLength: 1,
            maxLength: 120
          },
          {
            name: 'list-2',
            type: 'string',
            description: 'Line 2 of the welcome message list.',
            minLength: 1,
            maxLength: 120
          },
          {
            name: 'list-3',
            type: 'string',
            description: 'Line 3 of the welcome message list.',
            minLength: 1,
            maxLength: 120
          },
          {
            name: 'list-4',
            type: 'string',
            description: 'Line 4 of the welcome message list.',
            minLength: 1,
            maxLength: 120
          },
          {
            name: 'list-5',
            type: 'string',
            description: 'Line 5 of the welcome message list.',
            minLength: 1,
            maxLength: 120
          },
          {
            name: 'list-6',
            type: 'string',
            description: 'Line 6 of the welcome message list.',
            minLength: 1,
            maxLength: 120
          },
          {
            name: 'list-7',
            type: 'string',
            description: 'Line 7 of the welcome message list.',
            minLength: 1,
            maxLength: 120
          },
          {
            name: 'list-8',
            type: 'string',
            description: 'Line 8 of the welcome message list.',
            minLength: 1,
            maxLength: 120
          },
          {
            name: 'list-9',
            type: 'string',
            description: 'Line 9 of the welcome message list.',
            minLength: 1,
            maxLength: 120
          },
          {
            name: 'list-10',
            type: 'string',
            description: 'Line 10 of the welcome message list.',
            minLength: 1,
            maxLength: 120
          },
          {
            name: 'footer-1',
            type: 'string',
            description: 'Line 1 of the welcome message footer.',
            minLength: 1,
            maxLength: 200
          },
          {
            name: 'footer-2',
            type: 'string',
            description: 'Line 2 of the welcome message footer.',
            minLength: 1,
            maxLength: 200
          },
          {
            name: 'footer-3',
            type: 'string',
            description: 'Line 3 of the welcome message footer.',
            minLength: 1,
            maxLength: 200
          },
          {
            name: 'server-id',
            type: 'integer',
            description: 'The id number of the server to update.',
            minValue: 1
          }
        ]
      },
      {
        name: 'format-set',
        description: 'Sets the welcome plugin message format of an OpenRCT2 server.',
        options: [
          {
            name: 'body-alignment',
            type: 'string',
            description: 'The text alignment of the welcome message body.',
            choices: TextAlignmentChoices
          },
          {
            name: 'list-alignment',
            type: 'string',
            description: 'The text alignment of the welcome message list.',
            choices: TextAlignmentChoices
          },
          {
            name: 'footer-alignment',
            type: 'string',
            description: 'The text alignment of the welcome message footer.',
            choices: TextAlignmentChoices
          },
          {
            name: 'window-title',
            type: 'string',
            description: 'The title for the welcome window.',
            choices: TextFormatChoices
          },
          {
            name: 'body-1',
            type: 'string',
            description: 'Line 1 of the welcome message body.',
            choices: TextFormatChoices
          },
          {
            name: 'body-2',
            type: 'string',
            description: 'Line 2 of the welcome message body.',
            choices: TextFormatChoices
          },
          {
            name: 'body-3',
            type: 'string',
            description: 'Line 3 of the welcome message body.',
            choices: TextFormatChoices
          },
          {
            name: 'list-title',
            type: 'string',
            description: 'The title of a list in the welcome message.',
            choices: TextFormatChoices
          },
          {
            name: 'list-1',
            type: 'string',
            description: 'Line 1 of the welcome message list.',
            choices: TextFormatChoices
          },
          {
            name: 'list-2',
            type: 'string',
            description: 'Line 2 of the welcome message list.',
            choices: TextFormatChoices
          },
          {
            name: 'list-3',
            type: 'string',
            description: 'Line 3 of the welcome message list.',
            choices: TextFormatChoices
          },
          {
            name: 'list-4',
            type: 'string',
            description: 'Line 4 of the welcome message list.',
            choices: TextFormatChoices
          },
          {
            name: 'list-5',
            type: 'string',
            description: 'Line 5 of the welcome message list.',
            choices: TextFormatChoices
          },
          {
            name: 'list-6',
            type: 'string',
            description: 'Line 6 of the welcome message list.',
            choices: TextFormatChoices
          },
          {
            name: 'list-7',
            type: 'string',
            description: 'Line 7 of the welcome message list.',
            choices: TextFormatChoices
          },
          {
            name: 'list-8',
            type: 'string',
            description: 'Line 8 of the welcome message list.',
            choices: TextFormatChoices
          },
          {
            name: 'list-9',
            type: 'string',
            description: 'Line 9 of the welcome message list.',
            choices: TextFormatChoices
          },
          {
            name: 'list-10',
            type: 'string',
            description: 'Line 10 of the welcome message list.',
            choices: TextFormatChoices
          },
          {
            name: 'footer-1',
            type: 'string',
            description: 'Line 1 of the welcome message footer.',
            choices: TextFormatChoices
          },
          {
            name: 'footer-2',
            type: 'string',
            description: 'Line 2 of the welcome message footer.',
            choices: TextFormatChoices
          },
          {
            name: 'footer-3',
            type: 'string',
            description: 'Line 3 of the welcome message footer.',
            choices: TextFormatChoices
          },
          {
            name: 'server-id',
            type: 'integer',
            description: 'The id number of the server to update.',
            minValue: 1
          }
        ]
      }
    ]
  }
];
const ServerSubcommands = <const>[
  {
    name: 'new',
    description: 'Creates a new server.',
    permissionLevel: CommandPermissionLevel.Administrator,
    options: null
  },
  {
    name: 'restart',
    description: 'Restarts an OpenRCT2 game server.',
    options: [
      {
        name: 'index',
        type: 'integer',
        description: 'The autosave file ordinal to open.',
        minValue: 1
      },
      {
        name: 'server-id',
        type: 'integer',
        description: 'The id number of the server to open.',
        minValue: 1
      }
    ]
  },
  { 
    name: 'settings',
    description: 'Shows the current settings of an OpenRCT2 server.',
    permissionLevel: CommandPermissionLevel.Moderator,
    options: [
      {
        name: 'server-id',
        type: 'integer',
        description: 'The id number of the server to check.',
        minValue: 1
      }
    ]
  }
];

/** Represents a command for interacting with OpenRCT2 game servers. */
export class ServerCommand extends SubcommandsDiscordBotCommand<
  typeof ServerSubcommandGroups[number],
  typeof ServerSubcommands[number]
> {
  private readonly gameBuildRepo: OpenRCT2BuildRepository;
  private readonly pluginRepo: PluginRepository;
  private readonly scenarioRepo: ScenarioRepository;
  private readonly serverHostRepo: ServerHostRepository;
  private readonly openRCT2ServerController: OpenRCT2ServerController;

  constructor(
    gameBuildRepo: OpenRCT2BuildRepository,
    pluginRepo: PluginRepository,
    scenarioRepo: ScenarioRepository,
    serverHostRepo: ServerHostRepository,
    openRCT2ServerController: OpenRCT2ServerController
  ) {
    super(
      'server',
      'Manages OpenRCT2 game servers.',
      ServerSubcommandGroups,
      ServerSubcommands,
      CommandPermissionLevel.Trusted
    );

    this.gameBuildRepo = gameBuildRepo;
    this.pluginRepo = pluginRepo;
    this.scenarioRepo = scenarioRepo;
    this.serverHostRepo = serverHostRepo;
    this.openRCT2ServerController = openRCT2ServerController;
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction) {
    const groupName = this.getInteractionSubcommandGroupName(interaction);
    const subcommandName = this.getInteractionSubcommandName(interaction);
    let commandResponse = new CommandResponseBuilder();

    if (subcommandName === 'new') {
      //commandResponse = await this.createNewServer();
    } else {
      const serverId = this.getInteractionOption(interaction, 'server-id')?.value as number ?? 1;

      // Subcommands
      if (subcommandName === 'settings') {
        commandResponse = await this.getServerSettings(serverId);
      } else if (subcommandName === 'restart') {
        await interaction.deferReply();

        const options = this.getInteractionSubcommandOptions(interaction, subcommandName);
        commandResponse = await this.startServerOnAutosave(
          serverId,
          options.get('index')?.value as number ?? 1
        );
      
      // Groups
      } else if (groupName === 'scenario') {
        await interaction.deferReply();

        if (subcommandName === 'start') {
          commandResponse = await this.startServerOnScenario(
            serverId,
            this.getRequiredInteractionOption(interaction, 'name').value as string
          );
        } else if (subcommandName === 'random-start') {
          commandResponse = await this.startServerOnRandomScenario(serverId);
        } else if (subcommandName === 'autosave-start') {
          const options = this.getInteractionSubcommandGroupSubcommandOptions(interaction, groupName, subcommandName);
          commandResponse = await this.startServerOnAutosave(
            serverId,
            options.get('index')?.value as number ?? 1
          );
        };
      } else if (groupName === 'queue') {
        if (subcommandName === 'start') {
          await interaction.deferReply();

          const options = this.getInteractionSubcommandGroupSubcommandOptions(interaction, groupName, subcommandName);
          commandResponse = await this.startServerFromQueue(
            serverId,
            options.get('defer')?.value as boolean
          );
        } else if (subcommandName === 'set') {
          const options = this.getInteractionSubcommandGroupSubcommandOptions(interaction, groupName, subcommandName);
          commandResponse = await this.setServerQueueOptions(
            serverId,
            options.get('size')?.value as number
          );
        };
      } else if (groupName === 'startup') {
        if (subcommandName === 'set') {
          const options = this.getInteractionSubcommandGroupSubcommandOptions(interaction, groupName, subcommandName);
          commandResponse = await this.setServerStartupOptions(
            serverId,
            options.get('headless')?.value as boolean,
            options.get('port')?.value as number
          );
        };
      } else if (groupName === 'build') {
        if (subcommandName === 'set') {
          const options = this.getInteractionSubcommandGroupSubcommandOptions(interaction, groupName, subcommandName);
          commandResponse = await this.setServerGameBuild(
            serverId,
            `v${(options.get('version')!.value as string).replace('v', '')}`,
            options.get('os')!.value as string,
            options.get('commit')?.value as string,
            options.get('architecture')?.value as string,
            options.get('codename')?.value as string
          );
        };
      } else if (groupName === 'adapter') {
        if (subcommandName === 'set') {
          const options = this.getInteractionSubcommandGroupSubcommandOptions(interaction, groupName, subcommandName);
          commandResponse = await this.setServerAdapterOptions(
            serverId,
            options.get('enable')?.value as boolean,
            options.get('adapter-port')?.value as number
          );
        };
      } else if (groupName === 'welcome') {
        if (subcommandName === 'plugin-set') {
          const options = this.getInteractionSubcommandGroupSubcommandOptions(interaction, groupName, subcommandName);
          commandResponse = await this.setServerWelcomeOptions(
            serverId,
            options.get('enable')?.value as boolean
          );
        } else if (subcommandName === 'text-set') {
          const options = this.getInteractionSubcommandGroupSubcommandOptions(interaction, groupName, subcommandName);
          const bodyLines = new Map<number, string>();
          const listLines = new Map<number, string>();
          const footerLines = new Map<number, string>();
  
          for (let i = 1; i <= 10; ++i) {
            if (i < 4) {
              const bodyValue = options.get(<any>`body-${i}`)?.value as string;
              const footerValue = options.get(<any>`footer-${i}`)?.value as string;
              if (bodyValue) {
                bodyLines.set(i, bodyValue);
              };
              if (footerValue) {
                footerLines.set(i, footerValue);
              };
            };
  
            const listValue = options.get(<any>`list-${i}`)?.value as string;
            if (listValue) {
              listLines.set(i, listValue);
            };
          };
  
          commandResponse = await this.setServerWelcomeText(
            serverId,
            options.get('window-title')?.value as string,
            bodyLines,
            options.get('list-title')?.value as string,
            listLines,
            footerLines
          );
        } else if (subcommandName === 'format-set') {
          const options = this.getInteractionSubcommandGroupSubcommandOptions(interaction, groupName, subcommandName);
          const bodyFormats = new Map<number, TextFormat>();
          const listFormats = new Map<number, TextFormat>();
          const footerFormats = new Map<number, TextFormat>();
  
          for (let i = 1; i <= 10; ++i) {
            if (i < 4) {
              const bodyValue = options.get(<any>`body-${i}`)?.value as TextFormat;
              const footerValue = options.get(<any>`footer-${i}`)?.value as TextFormat;
              if (bodyValue) {
                bodyFormats.set(i, bodyValue);
              };
              if (footerValue) {
                footerFormats.set(i, footerValue);
              };
            };
  
            const listValue = options.get(<any>`list-${i}`)?.value as TextFormat;
            if (listValue) {
              listFormats.set(i, listValue);
            };
          };
  
          commandResponse = await this.setServerWelcomeFormat(
            serverId,
            options.get('window-title')?.value as TextFormat,
            options.get('body-alignment')?.value as TextAlignment,
            options.get('list-alignment')?.value as TextAlignment,
            options.get('footer-alignment')?.value as TextAlignment,
            bodyFormats,
            options.get('list-title')?.value as TextFormat,
            listFormats,
            footerFormats
          );
        };
      };
    };

    if (0 === commandResponse.resolve().length) {
      commandResponse.appendToError('Unknown or unimplemented command specified.');
    };

    interaction.deferred
      ? await interaction.editReply(commandResponse.resolve())
      : await interaction.reply(commandResponse.resolve());
  };

  private async getServerSettings(serverId: number) {
    const commandResponse = new CommandResponseBuilder();

    const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
    const startupOptions = await serverDir.getStartupOptions();
    const pluginOptions = await serverDir.getPluginOptions();
    const queue = await serverDir.getQueue();
    commandResponse.appendToMessage(this.formatServerSettingsMessage(
      serverId,
      startupOptions,
      pluginOptions,
      queue
    ));

    return commandResponse;
  };

  private async setServerStartupOptions(
    serverId: number,
    headless?: boolean,
    portNumber?: number
  ) {
    const commandResponse = new CommandResponseBuilder();

    const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
    const startupOptions = await serverDir.getStartupOptions();

    if (headless != undefined) {
      startupOptions.headless = headless;
      commandResponse.appendToMessage(`Updated to ${headless ? bold('run') : bold('not run')} as a headless server.`);
    };

    if (portNumber != undefined) {
      startupOptions.port = portNumber;
      commandResponse.appendToMessage(`Updated to use port number ${bold(`${portNumber}`)}.`);
    };

    if (isStringNullOrWhiteSpace(commandResponse.message)) {
      commandResponse.appendToMessage('No changes were made.');
    } else if (!commandResponse.hasError) {
      await serverDir.updateStartupOptions(startupOptions);
      commandResponse.appendToMessageBeginning(`${underscore(italic(`Server ${serverId}`))}:${EOL}`);
      commandResponse.appendToMessage(`${EOL}The above changes require a server restart to apply.`);
    };

    return commandResponse;
  };

  private async setServerGameBuild(
    serverId: number,
    baseVersion: string,
    operatingSystem: string,
    commit?: string,
    architecture?: string,
    codename?: string
  ) {
    const commandResponse = new CommandResponseBuilder();

    const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
    const startupOptions = await serverDir.getStartupOptions();

    let buildName = commit
      ? `${baseVersion}_${operatingSystem}`
      : `${baseVersion}-${commit}_${operatingSystem}`;
    if (codename) {
      buildName += `-${codename}`;
    };
    if (architecture) {
      buildName += `_${architecture}`;
    };
    const gameBuilds = await this.gameBuildRepo.getOpenRCT2BuildsByFuzzySearch(buildName);
    if (!gameBuilds.length) {
      commandResponse.appendToError('Specified parameters returned no OpenRCT2 builds.');
    } else if (gameBuilds.length > 1) {
      commandResponse.appendToError('Specified parameters returned multiple OpenRCT2 builds.');
    } else {
      startupOptions.openRCT2ExecutablePath = gameBuilds[0].pathToExecutable;
      commandResponse.appendToMessage(`Changed to build ${bold(gameBuilds[0].name)}.`);
    };

    if (isStringNullOrWhiteSpace(commandResponse.message)) {
      commandResponse.appendToMessage('No changes were made.');
    } else if (!commandResponse.hasError) {
      await serverDir.updateStartupOptions(startupOptions);
      commandResponse.appendToMessageBeginning(`${underscore(italic(`Server ${serverId}`))}:${EOL}`);
      commandResponse.appendToMessage(`${EOL}The above changes require a server restart to apply.`);
    };

    return commandResponse;
  };

  private async setServerQueueOptions(
    serverId: number,
    size?: number
  ) {
    const commandResponse = new CommandResponseBuilder();

    const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
    const queue = await serverDir.getQueue();

    if (size != undefined) {
      queue.size = size;
      commandResponse.appendToMessage(`Updated the scenario queue to ${size > 0 ? `be of size ${bold(`${size}`)}` : bold('INACTIVE')}.`);

      if (size < queue.waitingScenarios.length) {
        const removed = queue.waitingScenarios.splice(size);
        const formattedRemoved = removed.map(scenarioFileName => `• ${italic(scenarioFileName)}`);
        if (0 === size) {
          commandResponse.appendToMessage(
            `${EOL}Due to being set to inactive, the scenario queue has been cleared out:`,
            ...formattedRemoved
          );
        } else {
          commandResponse.appendToMessage(
            `${EOL}Due to the smaller queue size, some queued scenarios were removed:`,
            ...formattedRemoved
          );
        };
      };
    };

    if (isStringNullOrWhiteSpace(commandResponse.message)) {
      commandResponse.appendToMessage('No changes were made.');
    } else if (!commandResponse.hasError) {
      await serverDir.updateQueue(queue);
      commandResponse.appendToMessageBeginning(`${underscore(italic(`Server ${serverId}`))}:${EOL}`);
    };

    return commandResponse;
  };

  private async setServerAdapterOptions(
    serverId: number,
    enable?: boolean,
    adapterPortNumber?: number
  ) {
    const commandResponse = new CommandResponseBuilder();

    const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
    const pluginOptions = await serverDir.getPluginOptions();

    if (enable != undefined) {
      pluginOptions.plugins = pluginOptions.plugins.filter(plugin => plugin === BotPluginFileName.ServerAdapter);
      if (enable) {
        pluginOptions.plugins.push(BotPluginFileName.ServerAdapter);
        commandResponse.appendToMessage(`Enabled the adapter plugin.`);
      } else {
        commandResponse.appendToMessage(`Disabled the adapter plugin.`);
      };
    };

    if (adapterPortNumber != undefined) {
      if (adapterPortNumber < Math.pow(2, 10) + 1 || adapterPortNumber > Math.pow(2, 16) - 1) {
        commandResponse.appendToError(`Invalid port number specified: ${bold(`${adapterPortNumber}`)}`);
      } else {
        const currentPorts = [];
        const serverDirs = await this.serverHostRepo.getAllOpenRCT2ServerRepositories();
        for (const [id, serverDir] of serverDirs) {
          const startupOptions = await serverDir.getStartupOptions();
          currentPorts.push(startupOptions.port);
          if (id !== serverId) {
            const pluginOptions = await serverDir.getPluginOptions();
            currentPorts.push(pluginOptions.adapterPluginPort);
          };
        };

        if (currentPorts.includes(adapterPortNumber)) {
          commandResponse.appendToError(`Port number ${bold(`${adapterPortNumber}`)} is already in use by a different game server or plugin.`);
        } else {
          pluginOptions.adapterPluginPort = adapterPortNumber;
          commandResponse.appendToMessage(`Updated the adapter plugin to use port number ${bold(`${adapterPortNumber}`)}.`);
        };
      };
    };

    if (isStringNullOrWhiteSpace(commandResponse.message)) {
      commandResponse.appendToMessage('No changes were made.');
    } else if (!commandResponse.hasError) {
      await serverDir.updatePluginOptions(pluginOptions);
      commandResponse.appendToMessageBeginning(`${underscore(italic(`Server ${serverId}`))}:${EOL}`);
      commandResponse.appendToMessage(`${EOL}The above changes require a server restart to apply.`);
    };

    return commandResponse;
  };

  private async setServerWelcomeOptions(serverId: number, enable?: boolean) {
    const commandResponse = new CommandResponseBuilder();

    const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
    const pluginOptions = await serverDir.getPluginOptions();

    if (enable != undefined) {
      pluginOptions.plugins = pluginOptions.plugins.filter(plugin => plugin === BotPluginFileName.Welcome);
      if (enable) {
        pluginOptions.plugins.push(BotPluginFileName.ServerAdapter);
        commandResponse.appendToMessage(`Enabled the welcome plugin.`);
      } else {
        commandResponse.appendToMessage(`Disabled the welcome plugin.`);
      };
    };

    if (isStringNullOrWhiteSpace(commandResponse.message)) {
      commandResponse.appendToMessage('No changes were made.');
    } else if (!commandResponse.hasError) {
      await serverDir.updatePluginOptions(pluginOptions);
      commandResponse.appendToMessageBeginning(`${underscore(italic(`Server ${serverId}`))}:${EOL}`);
      commandResponse.appendToMessage(`${EOL}The above changes require a server restart to apply.`);
    };

    return commandResponse;
  }

  private async setServerWelcomeText(
    serverId: number,
    windowTitle?: string,
    bodyLines = new Map<number, string>(),
    listTitle?: string,
    listLines = new Map<number, string>(),
    footerLines = new Map<number, string>(),
  ) {
    const commandResponse = new CommandResponseBuilder();

    const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
    const pluginOptions = await serverDir.getPluginOptions();

    if (windowTitle != undefined) {
      pluginOptions.welcomeMessage.title = windowTitle;
      commandResponse.appendToMessage(`Updated the welcome window title to ${bold(windowTitle)}.`);
    };

    if (bodyLines.size > 0) {
      const bodyLinesMap = new Map(pluginOptions.welcomeMessage.bodyLines);
      for (let i = 1; i <= 3; ++i) {
        const inputLine = bodyLines.get(i);
        if (inputLine) {
          bodyLinesMap.set(i, inputLine);
        };
      };
      const updatedBodyLines = Array.from(bodyLinesMap.entries());
      updatedBodyLines.sort((a, b) => a[0] - b[0]);
      pluginOptions.welcomeMessage.bodyLines = updatedBodyLines;
      commandResponse.appendToMessage('Updated the welcome message body.');
    };

    if (listTitle != undefined) {
      pluginOptions.welcomeMessage.listTitle = listTitle;
      commandResponse.appendToMessage(`Updated the welcome message list title to ${bold(listTitle)}.`);
    };

    if (listLines.size > 0) {
      const listLinesMap = new Map(pluginOptions.welcomeMessage.listLines ?? []);
      for (let i = 1; i <= 10; ++i) {
        const inputLine = listLines.get(i);
        if (inputLine) {
          listLinesMap.set(i, inputLine);
        };
      };
      const updatedListLines = Array.from(listLinesMap.entries());
      updatedListLines.sort((a, b) => a[0] - b[0]);
      pluginOptions.welcomeMessage.listLines = updatedListLines;
      commandResponse.appendToMessage('Updated the welcome message list content.');
    };

    if (footerLines.size > 0) {
      const footerLinesMap = new Map(pluginOptions.welcomeMessage.footerLines ?? []);
      for (let i = 1; i <= 3; ++i) {
        const inputLine = listLines.get(i);
        if (inputLine) {
          footerLinesMap.set(i, inputLine);
        };
      };
      const updatedFooterLines = Array.from(footerLinesMap.entries());
      updatedFooterLines.sort((a, b) => a[0] - b[0]);
      pluginOptions.welcomeMessage.footerLines = updatedFooterLines;
      commandResponse.appendToMessage('Updated the welcome message footer.');
    };

    if (isStringNullOrWhiteSpace(commandResponse.message)) {
      commandResponse.appendToMessage('No changes were made.');
    } else if (!commandResponse.hasError) {
      await serverDir.updatePluginOptions(pluginOptions);
      commandResponse.appendToMessageBeginning(`${underscore(italic(`Server ${serverId}`))}:${EOL}`);
      commandResponse.appendToMessage(`${EOL}The above changes require a server restart to apply.`);
    };

    return commandResponse;
  };

  private async setServerWelcomeFormat(
    serverId: number,
    windowTitleFormat?: TextFormat,
    bodyAlignment?: TextAlignment,
    listAlignment?: TextAlignment,
    footerAlignment?: TextAlignment,
    bodyFormats = new Map<number, TextFormat>(),
    listTitleFormat?: TextFormat,
    listFormats = new Map<number, TextFormat>(),
    footerFormats = new Map<number, TextFormat>(),
  ) {
    const commandResponse = new CommandResponseBuilder();

    const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
    const pluginOptions = await serverDir.getPluginOptions();

    if (windowTitleFormat != undefined) {
      pluginOptions.welcomeMessage.title = '';
      commandResponse.appendToMessage(`Updated the welcome window title to be blank.`);
    };

    if (bodyAlignment != undefined) {
      pluginOptions.welcomeMessage.bodyAlignment = bodyAlignment;
      commandResponse.appendToMessage(`Updated the welcome message body alignment to ${bold(bodyAlignment)}.`);
    };

    if (listAlignment != undefined) {
      pluginOptions.welcomeMessage.listAlignment = listAlignment;
      commandResponse.appendToMessage(`Updated the welcome message list alignment to ${bold(listAlignment)}.`);
    };

    if (footerAlignment != undefined) {
      pluginOptions.welcomeMessage.footerAlignment = footerAlignment;
      commandResponse.appendToMessage(`Updated the welcome message footer alignment to ${bold(footerAlignment)}.`);
    };

    if (bodyFormats.size > 0) {
      const bodyLinesMap = new Map(pluginOptions.welcomeMessage.bodyLines);
      for (let i = 1; i <= 3; ++i) {
        const inputLine = bodyFormats.get(i);
        if (inputLine === '[blank]') {
          bodyLinesMap.set(i, '');
        };
      };
      const updatedBodyLines = Array.from(bodyLinesMap.entries());
      updatedBodyLines.sort((a, b) => a[0] - b[0]);
      pluginOptions.welcomeMessage.bodyLines = updatedBodyLines;
      commandResponse.appendToMessage('Updated the welcome message body.');
    };

    if (listTitleFormat != undefined) {
      if (listTitleFormat === '[blank]') {
        pluginOptions.welcomeMessage.listTitle = '';
        commandResponse.appendToMessage(`Updated the welcome message list title to be blank.`);
      } else {
        pluginOptions.welcomeMessage.listTitle = undefined;
        commandResponse.appendToMessage(`Cleared the welcome message list title.`);
      }
    };

    if (listFormats.size > 0) {
      const listLinesMap = new Map(pluginOptions.welcomeMessage.listLines ?? []);
      for (let i = 1; i <= 10; ++i) {
        const inputLine = listFormats.get(i);
        if (inputLine === '[blank]') {
          listLinesMap.set(i, '');
        };
      };
      const updatedListLines = Array.from(listLinesMap.entries());
      updatedListLines.sort((a, b) => a[0] - b[0]);
      pluginOptions.welcomeMessage.listLines = updatedListLines;
      commandResponse.appendToMessage('Updated the welcome message list content.');
    };

    if (footerFormats.size > 0) {
      const footerLinesMap = new Map(pluginOptions.welcomeMessage.footerLines ?? []);
      for (let i = 1; i <= 10; ++i) {
        const inputLine = listFormats.get(i);
        if (inputLine === '[blank]') {
          footerLinesMap.set(i, '');
        };
      };
      const updatedFooterLines = Array.from(footerLinesMap.entries());
      updatedFooterLines.sort((a, b) => a[0] - b[0]);
      pluginOptions.welcomeMessage.footerLines = updatedFooterLines;
      commandResponse.appendToMessage('Updated the welcome message footer.');
    };

    if (isStringNullOrWhiteSpace(commandResponse.message)) {
      commandResponse.appendToMessage('No changes were made.');
    } else if (!commandResponse.hasError) {
      await serverDir.updatePluginOptions(pluginOptions);
      commandResponse.appendToMessageBeginning(`${underscore(italic(`Server ${serverId}`))}:${EOL}`);
      commandResponse.appendToMessage(`${EOL}The above changes require a server restart to apply.`);
    };

    return commandResponse;
  };

  private async createNewServer() {
    const commandResponse = new CommandResponseBuilder();

    const newDirResult = await this.serverHostRepo.createOpenRCT2ServerDirectory();
    commandResponse.appendToMessage(`Successfully created ${underscore(italic(`Server ${newDirResult.id}`))} and its starting data!`);

    return commandResponse;
  };

  private async startServer(
    serverId: number,
    scenarioName?: string,
    autosaveIndex?: number,
    defer?: boolean
  ) {

  };

  private async startServerOnScenario(serverId: number, scenarioName: string) {
    const commandResponse = new CommandResponseBuilder();

    if (this.openRCT2ServerController.isServerProcessActive(serverId, 'start')) {
      commandResponse.appendToError(`Can't start ${underscore(italic(`Server ${serverId}`))}. It's already in the middle of starting a scenario.`);
      return commandResponse;
    }

    const scenarios = await this.scenarioRepo.getScenariosByFuzzySearch(scenarioName);
    if (1 === scenarios.length) {
      try {
        await this.openRCT2ServerController.startGameServerOnScenario(serverId, scenarios[0]);
        commandResponse.appendToMessage(
          `Started ${
            underscore(italic(`Server ${serverId}`))
          } on the ${bold(scenarios[0].nameNoExtension)} scenario.`
        );
      } catch (err) {
        commandResponse.appendToError((err as Error).message);
      };
    } else {
      commandResponse.appendToError(
        this.formatNonsingleScenarioError(scenarios.map(scenario => scenario.name), scenarioName)
      );
    };

    return commandResponse;
  };

  private async startServerOnAutosave(serverId: number, autosaveIndex: number) {
    const commandResponse = new CommandResponseBuilder();
    
    if (this.openRCT2ServerController.isServerProcessActive(serverId, 'start')) {
      commandResponse.appendToError(`Can't start ${underscore(italic(`Server ${serverId}`))}. It's already in the middle of starting a scenario.`);
      return commandResponse;
    }

    if (autosaveIndex < 1) {
      autosaveIndex = 1;
    };

    try {
      if (1 === autosaveIndex) {
        await this.openRCT2ServerController.startGameServerOnAutosave(serverId);
        commandResponse.appendToMessage(`Started ${underscore(italic(`Server ${serverId}`))} on the latest autosave.`);
      } else {
        await this.openRCT2ServerController.startGameServerOnAutosave(serverId, autosaveIndex - 1);
        commandResponse.appendToMessage(`Started ${underscore(italic(`Server ${serverId}`))} on autosave ${autosaveIndex}.`);
      };
    } catch (err) {
      commandResponse.appendToError((err as Error).message);
    };

    return commandResponse;
  };

  private async startServerFromQueue(serverId: number, defer?: boolean) {
    const commandResponse = new CommandResponseBuilder();

    if (this.openRCT2ServerController.isServerProcessActive(serverId, 'start')) {
      commandResponse.appendToError(`Can't start ${underscore(italic(`Server ${serverId}`))}. It's already in the middle of starting a scenario.`);
      return commandResponse;
    }

    const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
    const queue = await serverDir.getQueue();

    if (queue.waitingScenarios.length > 0) {
      try {
        if (defer) {
          this.openRCT2ServerController.startGameServerFromQueue(serverId, defer);
          commandResponse.appendToMessage(
            `Initiated to start the next scenario in the ${
              underscore(italic(`Server ${serverId}`))
            } scenario queue.`
          );
        } else {
          await this.openRCT2ServerController.startGameServerFromQueue(serverId);
          commandResponse.appendToMessage(
            `Started the next scenario in the ${
              underscore(italic(`Server ${serverId}`))
            } scenario queue.`
          );
        };
      } catch (err) {
        commandResponse.appendToError((err as Error).message);
      };
    } else {
      commandResponse.appendToError(`${underscore(italic(`Server ${serverId}`))} scenario queue is currently empty.`);
    };

    return commandResponse;
  };

  private async startServerOnRandomScenario(serverId: number) {
    const commandResponse = new CommandResponseBuilder();

    if (this.openRCT2ServerController.isServerProcessActive(serverId, 'start')) {
      commandResponse.appendToError(`Can't start ${underscore(italic(`Server ${serverId}`))}. It's already in the middle of starting a scenario.`);
      return commandResponse;
    }

    const scenarios = fisherYatesShuffle(await this.scenarioRepo.getAvailableScenarios());

    if (scenarios.length > 0) {
      try {
        this.openRCT2ServerController.startGameServerOnScenario(serverId, scenarios[0]);
        commandResponse.appendToMessage(
          `Started ${
            underscore(italic(`Server ${serverId}`))
          } on the ${bold(scenarios[0].nameNoExtension)} scenario.`
        );
      } catch (err) {
        commandResponse.appendToError((err as Error).message);
      };
    } else {
      commandResponse.appendToError(`There are currently no available scenarios.`);
    };

    return commandResponse;
  };

  private async stopServer(serverId: number) {
    const commandResponse = new CommandResponseBuilder();

    await this.openRCT2ServerController.stopGameServer(serverId);
    commandResponse.appendToMessage(`Stopped ${underscore(italic(`Server ${serverId}`))}.`);

    return commandResponse;
  };

  private formatServerSettingsMessage(
    serverId: number,
    startupOptions: StartupOptions,
    pluginOptions: PluginOptions,
    queue: ScenarioQueue
  ) {
    const msgSegments = [`Current settings for ${italic(underscore(`Server ${serverId}`))}:`];

    msgSegments.push('');
    msgSegments.push(`${underscore('Startup Options:')}`);
    msgSegments.push(`Port Number: ${startupOptions.port}`);
    msgSegments.push(`Start Mode: ${startupOptions.headless ? italic('Headless') : italic('Windowed')}`);
    msgSegments.push(`Build: ${path.basename(path.dirname(startupOptions.openRCT2ExecutablePath))}`);
    msgSegments.push('');
    msgSegments.push(`${underscore('Plugin Options:')}`);
    if (pluginOptions.plugins.length) {
      const pluginNameList = pluginOptions.plugins.map(pluginName => `• ${italic(pluginName)}`);
      msgSegments.push('Enabled Plugins:');
      msgSegments.push(...pluginNameList);
    } else {
      msgSegments.push(`Enabled Plugins: ${italic('None')}`);
    };
    msgSegments.push(`Adapter Port: ${pluginOptions.adapterPluginPort}`);
    msgSegments.push(`Welcome Message: ${pluginOptions.welcomeMessage.bodyLines.length ? bold('SET') : bold('NOT SET')}`);
    msgSegments.push('');
    msgSegments.push(`${underscore('Queue Options:')}`);
    msgSegments.push(`Scenario Queue Size: ${queue.size}`);

    return msgSegments.join(EOL);
  };

  /**
   * Constructs an error message of the search results for scenarios
   * that don't match into one single result.
   * @param scenarioNames The result array of multiple scenario matches to format the message from.
   * @param nameSearch The query parameter used to get the result set.
   * @returns A custom formatted message for a specific feature.
   */
  private formatNonsingleScenarioError(scenarioNames: string[], nameSearch: string) {
    const errorMsgSegments = [];

    if (scenarioNames.length > 1) {
      errorMsgSegments.push(`Multiple scenarios match ${italic(nameSearch)}:${EOL}`);
      for (const name of scenarioNames) {
        errorMsgSegments.push(`▸ ${italic(name)}`);
      };
      errorMsgSegments.push(`${EOL}Enter a more specific name.`);
    } else {
      errorMsgSegments.push(`No scenarios match the name ${italic(nameSearch)}.`)
    };

    return errorMsgSegments.join(EOL);
  };
};