import path from 'path';
import { EOL } from 'os';
import {
  bold,
  ChatInputCommandInteraction,
  inlineCode,
  italic,
  underscore,
} from 'discord.js';
import { 
  CommandPermissionLevel,
  ResponseBuilder,
  SubcommandsDiscordBotCommand
} from '@modules/discord/commands/index.js';
import { BotDataRepository } from '@modules/discord/data/repositories/index.js';
import { OpenRCT2 } from '@modules/openrct2/index.js';
import { OpenRCT2ServerController } from '@modules/openrct2/controllers/index.js';
import {
  ArchitectureType,
  ArchitectureTypeArray,
  PluginOptions,
  ScenarioQueue,
  StartupOptions
} from '@modules/openrct2/data/models/index.js';
import { 
  BuildRepository,
  ScenarioRepository,
  ServerRepository
} from '@modules/openrct2/data/repositories/index.js';
import { fisherYatesShuffle } from '@modules/utils/array-utils.js';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils.js';

type TextAlignment = 'left' | 'centred';
type TextFormat = '[clear]' | '[blank]';

const TextAlignmentChoices: { name: string, value: TextAlignment }[] = [
  { name: 'Left', value: 'left' },
  { name: 'Centered', value: 'centred' }
];
const TextFormatChoices: { name: string, value: TextFormat }[] = [
  { name: 'Clear', value: '[clear]' },
  { name: 'Blank', value: '[blank]' }
];

const ServerSubcommandGroups = <const>[
  {
    name: 'scenario',
    permissionLevel: CommandPermissionLevel.Trusted,
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
    permissionLevel: CommandPermissionLevel.Trusted,
    subcommands: [
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
      },
      { 
        name: 'get',
        description: 'Shows the queue settings of an OpenRCT2 server.',
        permissionLevel: CommandPermissionLevel.User,
        options: [
          {
            name: 'server-id',
            type: 'integer',
            description: 'The id number of the server to check.',
            minValue: 1
          }
        ]
      },
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
        name: 'add',
        description: 'Adds a scenario to the queue of an OpenRCT2 server.',
        options: [
          {
            name: 'name',
            type: 'string',
            description: 'The name of the scenario file to queue up.',
            required: true
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
          name: 'auto-finalize',
          type: 'boolean',
          description: 'To automatically finalize scenario saves on completion or not.',
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
          required: true,
          choices: Array.of(
            { name: 'Windows', value: 'windows' },
            { name: 'MacOS', value: 'macos' },
            { name: 'Linux', value: 'linux' },
            { name: 'Ubuntu', value: 'ubuntu' },
            { name: 'Debian', value: 'debian' }
          )
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
          description: 'The target operating system CPU architecture.',
          choices: ArchitectureTypeArray.map(arch => { return { name: arch, value: arch }})
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
    name: 'messaging',
    subcommands: [{
      name: 'set',
      description: 'Sets messaging plugin properties of an OpenRCT2 server.',
      options: [
        {
          name: 'enable',
          type: 'boolean',
          description: 'To enable the server messaging plugin or not.'
        },
        {
          name: 'plugin-port',
          type: 'integer',
          description: 'The new port number for the messaging plugin.',
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
    permissionLevel: CommandPermissionLevel.Trusted,
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
    name: 'stop',
    description: 'Stops an OpenRCT2 server.',
    options: [
      {
        name: 'server-id',
        type: 'integer',
        description: 'The id number of the server to stop.',
        minValue: 1
      }
    ]
  },
  { 
    name: 'settings',
    description: 'Shows a summary of settings of an OpenRCT2 server.',
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
  private readonly botDataRepo: BotDataRepository;
  private readonly buildRepo: BuildRepository;
  private readonly scenarioRepo: ScenarioRepository;
  private readonly serverRepo: ServerRepository;
  private readonly openRCT2ServerController: OpenRCT2ServerController;

  constructor(
    botDataRepo: BotDataRepository,
    buildRepo: BuildRepository,
    scenarioRepo: ScenarioRepository,
    serverRepo: ServerRepository,
    openRCT2ServerController: OpenRCT2ServerController
  ) {
    super(
      'server',
      'Manages OpenRCT2 game servers.',
      ServerSubcommandGroups,
      ServerSubcommands,
      CommandPermissionLevel.Moderator,
    );

    this.botDataRepo = botDataRepo;
    this.buildRepo = buildRepo;
    this.scenarioRepo = scenarioRepo;
    this.serverRepo = serverRepo;
    this.openRCT2ServerController = openRCT2ServerController;
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction) {
    const groupName = this.getInteractionSubcommandGroupName(interaction);
    const subcommandName = this.getInteractionSubcommandName(interaction);
    const response = new ResponseBuilder();

    if (subcommandName === 'new') {
      //response = await this.createNewServer();
    } else {
      const serverId = this.getInteractionOption(interaction, 'server-id')?.value as number ?? 1;

      // Subcommands
      if (groupName == undefined && subcommandName === 'settings') {
        await this.getServerSettings(response, serverId);
      } else if (subcommandName === 'restart') {
        await interaction.deferReply();

        const options = this.getInteractionSubcommandOptions(interaction, subcommandName);
        await this.startServerOnAutosave(
          response,
          serverId,
          options.get('index')?.value as number ?? 1
        );
      } else if (subcommandName === 'stop') {
        await interaction.deferReply();

        await this.stopServer(response, serverId);

      // Groups
      } else if (groupName === 'scenario') {
        await interaction.deferReply();

        if (subcommandName === 'start') {
          await this.startServerOnScenario(
            response, 
            serverId,
            this.getRequiredInteractionOption(interaction, 'name').value as string
          );
        } else if (subcommandName === 'random-start') {
          await this.startServerOnRandomScenario(response, serverId);
        } else if (subcommandName === 'autosave-start') {
          const options = this.getInteractionSubcommandGroupSubcommandOptions(interaction, groupName, subcommandName);
          await this.startServerOnAutosave(
            response, 
            serverId,
            options.get('index')?.value as number ?? 1
          );
        };
      } else if (groupName === 'queue') {
        if (subcommandName === 'set') {
          const options = this.getInteractionSubcommandGroupSubcommandOptions(interaction, groupName, subcommandName);
          await this.setServerQueueOptions(
            response, 
            serverId,
            options.get('size')?.value as number
          );
        } else if (subcommandName === 'get') {
          await this.getServerQueueSettings(response, serverId);
        } else if (subcommandName === 'start') {
          await interaction.deferReply();

          const options = this.getInteractionSubcommandGroupSubcommandOptions(interaction, groupName, subcommandName);
          await this.startServerFromQueue(
            response,
            serverId,
            options.get('defer')?.value as boolean
          );
        } else if (subcommandName === 'add') {
          await interaction.deferReply();

          const options = this.getInteractionSubcommandGroupSubcommandOptions(interaction, groupName, subcommandName);
          await this.addToServerQueue(
            response,
            serverId,
            options.get('name')?.value as string
          );
        };
      } else if (groupName === 'startup') {
        if (subcommandName === 'set') {
          const options = this.getInteractionSubcommandGroupSubcommandOptions(interaction, groupName, subcommandName);
          await this.setServerStartupOptions(
            response, 
            serverId,
            options.get('headless')?.value as boolean,
            options.get('port')?.value as number,
            options.get('auto-finalize')?.value as boolean
          );
        };
      } else if (groupName === 'build') {
        if (subcommandName === 'set') {
          const options = this.getInteractionSubcommandGroupSubcommandOptions(interaction, groupName, subcommandName);
          await this.setServerBuild(
            response,
            serverId,
            `v${(options.get('version')!.value as string).replace('v', '')}`,
            options.get('os')!.value as string,
            options.get('commit')?.value as string,
            options.get('architecture')?.value as ArchitectureType,
            options.get('codename')?.value as string
          );
        };
      } else if (groupName === 'messaging') {
        if (subcommandName === 'set') {
          const options = this.getInteractionSubcommandGroupSubcommandOptions(interaction, groupName, subcommandName);
          await this.setMessagingPluginOptions(
            response,
            serverId,
            options.get('enable')?.value as boolean,
            options.get('plugin-port')?.value as number
          );
        };
      } else if (groupName === 'welcome') {
        if (subcommandName === 'plugin-set') {
          const options = this.getInteractionSubcommandGroupSubcommandOptions(interaction, groupName, subcommandName);
          await this.setWelcomePluginOptions(
            response,
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
  
          await this.setServerWelcomeText(
            response,
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
  
          await this.setServerWelcomeFormat(
            response,
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

    if (!response.hasContent) {
      interaction.deferred 
        ? await interaction.editReply(SubcommandsDiscordBotCommand.unknownCommandErrorMessage)
        : await interaction.reply(SubcommandsDiscordBotCommand.unknownCommandErrorMessage);
      return;
    };

    const messagePayload = response.resolve(interaction);
    interaction.deferred
      ? await interaction.editReply(messagePayload)
      : await interaction.reply(messagePayload);
  };

  private async getServerSettings(response: ResponseBuilder, serverId: number) {
    const serverDir = await this.serverRepo.getServerDirectoryById(serverId);
    const startupOptions = await serverDir.getStartupOptions();
    const pluginOptions = await serverDir.getPluginOptions();
    const queue = await serverDir.getQueue();
    response.addText(this.formatServerSettingsMessage(
      serverId,
      startupOptions,
      pluginOptions,
      queue
    ));
  };

  private async setServerStartupOptions(
    response: ResponseBuilder,
    serverId: number,
    headless?: boolean,
    portNumber?: number,
    autoFinalize?: boolean
  ) {
    const serverDir = await this.serverRepo.getServerDirectoryById(serverId);
    const startupOptions = await serverDir.getStartupOptions();

    if (headless != undefined) {
      startupOptions.headless = headless;
      response.addText(`Updated to ${headless ? bold('run') : bold('not run')} as a ${bold('headless')} server.`);
    };

    if (portNumber != undefined) {
      startupOptions.port = portNumber;
      response.addText(`Updated to use port number ${bold(`${portNumber}`)}.`);
    };

    if (autoFinalize != undefined) {
      if (autoFinalize) {
        const guildInfo = await this.botDataRepo.getGuildInfo();
        if (isStringNullOrWhiteSpace(guildInfo.scenarioChannelId)) {
          response.addErrorText(
            `Assign the ${italic('Scenario Channel')} with the ${
              inlineCode('/channel')
            } command first to set the ${inlineCode('auto-finalize')} option to ${inlineCode('True')}.`
          );
        } else {
          startupOptions.autoFinalize = true;
          response.addText(`Updated to ${bold('finalize')} scenarios on completion.`);
        };
      } else {
        startupOptions.autoFinalize = false;
        response.addText(`Updated to ${bold('not finalize')} scenarios on completion.`);
      };
    };

    if (!response.hasText) {
      response.addText('No changes were made.');
    } else if (!response.hasError) {
      await serverDir.updateStartupOptions(startupOptions);
      response.addTextToStart(`${underscore(italic(`Server ${serverId}`))}:${EOL}`);
      response.addText(`${EOL}The above changes require a server restart to apply.`);
    };
  };

  private async setServerBuild(
    response: ResponseBuilder,
    serverId: number,
    baseVersion: string,
    operatingSystem: string,
    commit?: string,
    architecture?: ArchitectureType,
    codename?: string
  ) {
    const serverDir = await this.serverRepo.getServerDirectoryById(serverId);
    const startupOptions = await serverDir.getStartupOptions();

    let buildName = commit
      ? `${baseVersion}-${commit}_${operatingSystem}`
      : `${baseVersion}_${operatingSystem}`;
    if (codename) {
      buildName += `-${codename}`;
    };
    if (architecture) {
      buildName += architecture === 'x86_64' ? '_x86-64' : `_${architecture}`;
    };
    const gameBuilds = await this.buildRepo.getBuildsByFuzzySearch(buildName);
    if (!gameBuilds.length) {
      response.addErrorText(`Failed to find a build for ${inlineCode(buildName)}`);
    } else if (gameBuilds.length > 1) {
      response.addErrorText(`Multiple builds match ${inlineCode(buildName)}:`, '');
      for (const gameBuild of gameBuilds.slice(0, 10)) {
        response.addErrorText(`▸ ${inlineCode(gameBuild.name)}`);
      };
    } else {
      startupOptions.openRCT2ExecutablePath = gameBuilds[0].pathToExecutable;
      response.addText(`Changed to build ${bold(gameBuilds[0].name)}.`);
    };

    if (!response.hasText) {
      response.addText('No changes were made.');
    } else if (!response.hasError) {
      await serverDir.updateStartupOptions(startupOptions);
      response.addTextToStart(`${underscore(italic(`Server ${serverId}`))}:${EOL}`);
      response.addText(`${EOL}The above changes require a server restart to apply.`);
    };
  };

  private async getServerQueueSettings(response: ResponseBuilder, serverId: number) {
    const serverDir = await this.serverRepo.getServerDirectoryById(serverId);
    const queue = await serverDir.getQueue();

    response.addText(this.formatServerQueueMessage(serverId, queue));
  };

  private async setServerQueueOptions(
    response: ResponseBuilder,
    serverId: number,
    size?: number
  ) {
    const serverDir = await this.serverRepo.getServerDirectoryById(serverId);
    const queue = await serverDir.getQueue();

    if (size != undefined) {
      queue.limit = size;
      response.addText(`Updated the scenario queue to ${size > 0 ? `be of size ${bold(`${size}`)}` : bold('INACTIVE')}.`);

      if (size < queue.scenarios.length) {
        const removed = queue.scenarios.splice(size);
        const formattedRemoved = removed.map(scenarioFileName => `• ${italic(scenarioFileName)}`);
        if (!size) {
          response.addText(
            `${EOL}Due to being set to inactive, the scenario queue has been cleared out:`,
            ...formattedRemoved
          );
        } else {
          response.addText(
            `${EOL}Due to the smaller queue size, some queued scenarios were removed:`,
            ...formattedRemoved
          );
        };
      };
    };

    if (!response.hasText) {
      response.addText('No changes were made.');
    } else if (!response.hasError) {
      await serverDir.updateQueue(queue);
      response.addTextToStart(`${underscore(italic(`Server ${serverId}`))}:${EOL}`);
    };
  };

  private async addToServerQueue(response: ResponseBuilder, serverId: number, scenarioName: string) {
    const scenarios = await this.scenarioRepo.getScenariosByFuzzySearch(scenarioName);
    if (scenarios.length === 1) {
      const targetScenario = scenarios[0];
      const serverDir = await this.serverRepo.getServerDirectoryById(serverId);
      const queue = await serverDir.getQueue();

      if (queue.scenarios.length < queue.limit) {
        await this.openRCT2ServerController.addToServerScenarioQueue(serverId, targetScenario);
        response.addText(
          `${EOL}Added the ${
            bold(targetScenario.nameNoExtension)
          } scenario to ${underscore(italic(`Server ${serverId}`))}'s scenario queue.`
        );
      } else {
        response.addErrorText(`Cannot add additional scenarios to ${underscore(italic(`Server ${serverId}`))}'s scenario queue.`);
      };
    } else {
      response.addErrorText(
        this.formatNonsingleScenarioError(scenarios.map(scenario => scenario.name), scenarioName)
      );
    };
  };

  private async setMessagingPluginOptions(
    response: ResponseBuilder,
    serverId: number,
    enable?: boolean,
    adapterPortNumber?: number
  ) {
    const serverDir = await this.serverRepo.getServerDirectoryById(serverId);
    const pluginOptions = await serverDir.getPluginOptions();

    if (enable != undefined) {
      if (enable) {
        if (!pluginOptions.plugins.includes(OpenRCT2.PluginFileName.Messaging)) {
          pluginOptions.plugins.push(OpenRCT2.PluginFileName.Messaging);
        };
        response.addText(`Enabled the messaging plugin.`);
      } else {
        pluginOptions.plugins = pluginOptions.plugins.filter(pluginName => pluginName !== OpenRCT2.PluginFileName.Messaging);
        response.addText(`Disabled the messaging plugin.`);
      };
    };

    if (adapterPortNumber != undefined) {
      if (adapterPortNumber < Math.pow(2, 10) + 1 || adapterPortNumber > Math.pow(2, 16) - 1) {
        response.addErrorText(`Invalid port number specified: ${bold(`${adapterPortNumber}`)}`);
      } else {
        const currentPorts = [];
        const serverDirs = await this.serverRepo.getAllServerDirectories();
        for (const [id, serverDir] of serverDirs) {
          const startupOptions = await serverDir.getStartupOptions();
          currentPorts.push(startupOptions.port);
          if (id !== serverId) {
            const pluginOptions = await serverDir.getPluginOptions();
            currentPorts.push(pluginOptions.messagingPluginPort);
          };
        };

        if (currentPorts.includes(adapterPortNumber)) {
          response.addErrorText(`Port number ${bold(`${adapterPortNumber}`)} is already in use by a different game server or plugin.`);
        } else {
          pluginOptions.messagingPluginPort = adapterPortNumber;
          response.addText(`Updated the messaging plugin to use port number ${bold(`${adapterPortNumber}`)}.`);
        };
      };
    };

    if (!response.hasText) {
      response.addText('No changes were made.');
    } else if (!response.hasError) {
      await serverDir.updatePluginOptions(pluginOptions);
      response.addTextToStart(`${underscore(italic(`Server ${serverId}`))}:${EOL}`);
      response.addText(`${EOL}The above changes require a server restart to apply.`);
    };
  };

  private async setWelcomePluginOptions(response: ResponseBuilder, serverId: number, enable?: boolean) {
    const serverDir = await this.serverRepo.getServerDirectoryById(serverId);
    const pluginOptions = await serverDir.getPluginOptions();

    if (enable != undefined) {
      if (enable) {
        if (!pluginOptions.plugins.includes(OpenRCT2.PluginFileName.Welcome)) {
          pluginOptions.plugins.push(OpenRCT2.PluginFileName.Welcome);
        };
        response.addText(`Enabled the welcome plugin.`);
      } else {
        pluginOptions.plugins = pluginOptions.plugins.filter(pluginName => pluginName !== OpenRCT2.PluginFileName.Welcome);
        response.addText(`Disabled the welcome plugin.`);
      };
    };

    if (!response.hasText) {
      response.addText('No changes were made.');
    } else if (!response.hasError) {
      await serverDir.updatePluginOptions(pluginOptions);
      response.addTextToStart(`${underscore(italic(`Server ${serverId}`))}:${EOL}`);
      response.addText(`${EOL}The above changes require a server restart to apply.`);
    };
  }

  private async setServerWelcomeText(
    response: ResponseBuilder,
    serverId: number,
    windowTitle?: string,
    bodyLines = new Map<number, string>(),
    listTitle?: string,
    listLines = new Map<number, string>(),
    footerLines = new Map<number, string>(),
  ) {
    const serverDir = await this.serverRepo.getServerDirectoryById(serverId);
    const pluginOptions = await serverDir.getPluginOptions();

    if (windowTitle != undefined) {
      pluginOptions.welcomeMessage.title = windowTitle;
      response.addText(`Updated the welcome window title to ${bold(windowTitle)}.`);
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
      response.addText('Updated the welcome message body.');
    };

    if (listTitle != undefined) {
      pluginOptions.welcomeMessage.listTitle = listTitle;
      response.addText(`Updated the welcome message list title to ${bold(listTitle)}.`);
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
      response.addText('Updated the welcome message list content.');
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
      response.addText('Updated the welcome message footer.');
    };

    if (!response.hasText) {
      response.addText('No changes were made.');
    } else if (!response.hasError) {
      await serverDir.updatePluginOptions(pluginOptions);
      response.addTextToStart(`${underscore(italic(`Server ${serverId}`))}:${EOL}`);
      response.addText(`${EOL}The above changes require a server restart to apply.`);
    };
  };

  private async setServerWelcomeFormat(
    response: ResponseBuilder,
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
    const serverDir = await this.serverRepo.getServerDirectoryById(serverId);
    const pluginOptions = await serverDir.getPluginOptions();

    if (windowTitleFormat != undefined) {
      pluginOptions.welcomeMessage.title = '';
      response.addText(`Updated the welcome window title to be blank.`);
    };

    if (bodyAlignment != undefined) {
      pluginOptions.welcomeMessage.bodyAlignment = bodyAlignment;
      response.addText(`Updated the welcome message body alignment to ${bold(bodyAlignment)}.`);
    };

    if (listAlignment != undefined) {
      pluginOptions.welcomeMessage.listAlignment = listAlignment;
      response.addText(`Updated the welcome message list alignment to ${bold(listAlignment)}.`);
    };

    if (footerAlignment != undefined) {
      pluginOptions.welcomeMessage.footerAlignment = footerAlignment;
      response.addText(`Updated the welcome message footer alignment to ${bold(footerAlignment)}.`);
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
      response.addText('Updated the welcome message body.');
    };

    if (listTitleFormat != undefined) {
      if (listTitleFormat === '[blank]') {
        pluginOptions.welcomeMessage.listTitle = '';
        response.addText(`Updated the welcome message list title to be blank.`);
      } else {
        pluginOptions.welcomeMessage.listTitle = undefined;
        response.addText(`Cleared the welcome message list title.`);
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
      response.addText('Updated the welcome message list content.');
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
      response.addText('Updated the welcome message footer.');
    };

    if (!response.hasText) {
      response.addText('No changes were made.');
    } else if (!response.hasError) {
      await serverDir.updatePluginOptions(pluginOptions);
      response.addTextToStart(`${underscore(italic(`Server ${serverId}`))}:${EOL}`);
      response.addText(`${EOL}The above changes require a server restart to apply.`);
    };
  };

  private async createNewServer(response: ResponseBuilder) {
    const newDirResult = await this.serverRepo.createServerDirectory();
    response.addText(`Successfully created ${underscore(italic(`Server ${newDirResult.id}`))} and its starting data!`);
  };

  private async startServerOnScenario(response: ResponseBuilder, serverId: number, scenarioName: string) {
    if (this.openRCT2ServerController.isServerProcessActive(serverId, 'start')) {
      response.addErrorText(`Can't start ${underscore(italic(`Server ${serverId}`))}. It's already in the middle of starting a scenario.`);
      return;
    };

    const scenarios = await this.scenarioRepo.getScenariosByFuzzySearch(scenarioName);
    if (scenarios.length === 1) {
      try {
        const targetScenario = scenarios[0];
        await this.openRCT2ServerController.startServer(serverId, targetScenario);
        response.addText(
          `Started ${
            underscore(italic(`Server ${serverId}`))
          } on the ${bold(targetScenario.nameNoExtension)} scenario.`
        );
      } catch (err) {
        response.addErrorText((err as Error).message);
      };
    } else {
      response.addErrorText(
        this.formatNonsingleScenarioError(scenarios.map(scenario => scenario.name), scenarioName)
      );
    };
  };

  private async startServerOnAutosave(response: ResponseBuilder, serverId: number, autosaveIndex: number) {
    if (this.openRCT2ServerController.isServerProcessActive(serverId, 'start')) {
      response.addErrorText(`Can't start ${underscore(italic(`Server ${serverId}`))}. It's already in the middle of starting a scenario.`);
      return;
    }

    try {
      if (autosaveIndex === 1) {
        await this.openRCT2ServerController.startServer(serverId);
        response.addText(`Started ${underscore(italic(`Server ${serverId}`))} on the latest autosave.`);
      } else {
        await this.openRCT2ServerController.startServer(serverId, undefined, autosaveIndex - 1);
        response.addText(`Started ${underscore(italic(`Server ${serverId}`))} on autosave ${autosaveIndex}.`);
      };
    } catch (err) {
      response.addErrorText((err as Error).message);
    };
  };

  private async startServerFromQueue(response: ResponseBuilder, serverId: number, defer?: boolean) {
    if (this.openRCT2ServerController.isServerProcessActive(serverId, 'start')) {
      response.addErrorText(`Can't start ${underscore(italic(`Server ${serverId}`))}. It's already in the middle of starting a scenario.`);
      return;
    }

    const serverDir = await this.serverRepo.getServerDirectoryById(serverId);
    const queue = await serverDir.getQueue();

    if (queue.scenarios.length > 0) {
      try {
        if (defer) {
          this.openRCT2ServerController.startServerFromQueue(serverId, defer);
          response.addText(
            `Initiated to start the next scenario in the ${
              underscore(italic(`Server ${serverId}`))
            } scenario queue.`
          );
        } else {
          await this.openRCT2ServerController.startServerFromQueue(serverId);
          response.addText(
            `Started the next scenario in the ${
              underscore(italic(`Server ${serverId}`))
            } scenario queue.`
          );
        };
      } catch (err) {
        response.addErrorText((err as Error).message);
      };
    } else {
      response.addErrorText(`${underscore(italic(`Server ${serverId}`))} scenario queue is currently empty.`);
    };
  };

  private async startServerOnRandomScenario(response: ResponseBuilder, serverId: number) {
    if (this.openRCT2ServerController.isServerProcessActive(serverId, 'start')) {
      response.addErrorText(`Can't start ${underscore(italic(`Server ${serverId}`))}. It's already in the middle of starting a scenario.`);
      return;
    }

    const scenarios = fisherYatesShuffle(await this.scenarioRepo.getAvailableScenarios());

    if (scenarios.length > 0) {
      try {
        this.openRCT2ServerController.startServer(serverId, scenarios[0]);
        response.addText(
          `Started ${
            underscore(italic(`Server ${serverId}`))
          } on the ${bold(scenarios[0].nameNoExtension)} scenario.`
        );
      } catch (err) {
        response.addErrorText((err as Error).message);
      };
    } else {
      response.addErrorText(`There are currently no available scenarios.`);
    };
  };

  private async stopServer(response: ResponseBuilder, serverId: number) {
    await this.openRCT2ServerController.stopServer(serverId);
    response.addText(`Stopped ${underscore(italic(`Server ${serverId}`))}.`);
  };

  private formatServerSettingsMessage(
    serverId: number,
    startupOptions: StartupOptions,
    pluginOptions: PluginOptions,
    queue: ScenarioQueue
  ) {
    const msgSegments = [`Current settings for ${italic(underscore(`Server ${serverId}`))}:`];

    msgSegments.push('');
    msgSegments.push(`${underscore('Startup Settings:')}`);
    msgSegments.push(`Start Mode: ${startupOptions.headless ? italic('Headless') : italic('Windowed')}`);
    msgSegments.push(`Port Number: ${startupOptions.port}`);
    msgSegments.push(`Auto-finalize: ${startupOptions.autoFinalize ? bold('ON') : bold('OFF')}`);
    msgSegments.push(`Build: ${path.basename(path.dirname(startupOptions.openRCT2ExecutablePath))}`);
    msgSegments.push('');
    msgSegments.push(`${underscore('Plugin Settings:')}`);
    if (pluginOptions.plugins.length) {
      const pluginNameList = pluginOptions.plugins.map(pluginName => `• ${italic(pluginName)}`);
      msgSegments.push('Enabled Plugins:');
      msgSegments.push(...pluginNameList);
    } else {
      msgSegments.push(`Enabled Plugins: ${italic('None')}`);
    };
    msgSegments.push(`Messaging Plugin Port: ${pluginOptions.messagingPluginPort}`);
    msgSegments.push(`Welcome Message: ${pluginOptions.welcomeMessage.bodyLines.length ? bold('SET') : bold('NOT SET')}`);
    msgSegments.push('');
    msgSegments.push(`${underscore('Queue Settings:')}`);
    msgSegments.push(`Limit: ${queue.limit}`);

    return msgSegments.join(EOL);
  };

  private formatServerQueueMessage(serverId: number, queue: ScenarioQueue) {
    const msgSegments = [`${italic(underscore(`Server ${serverId}`))} Queue:`];

    msgSegments.push('');
    msgSegments.push(`Limit: ${queue.limit}`);
    if (queue.scenarios.length) {
      const scenarioNameList = queue.scenarios.map(scenarioName => `• ${italic(scenarioName)}`);
      msgSegments.push('Scenarios:');
      msgSegments.push(...scenarioNameList);
    } else {
      msgSegments.push(`Scenarios: ${italic('None')}`);
    };

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
      for (const name of scenarioNames.slice(0, 10)) {
        errorMsgSegments.push(`▸ ${italic(name)}`);
      };
      errorMsgSegments.push(`${EOL}Enter a more specific name.`);
    } else {
      errorMsgSegments.push(`No scenarios match the name ${italic(nameSearch)}.`)
    };

    return errorMsgSegments.join(EOL);
  };
};