import {
  bold,
  inlineCode,
  italic,
  underscore,
  ChatInputCommandInteraction,
} from 'discord.js';
import { EOL } from 'os';
import { 
  BotCommand,
  CommandPermissionLevel,
  CommandResponseBuilder
} from '@modules/discord/commands';
import { OpenRCT2ServerController } from '@modules/openrct2/controllers';
import {
  StartupOptions,
  ServerQueue,
  PluginOptions
} from '@modules/openrct2/data/models';
import { 
  PluginRepository,
  ScenarioRepository,
  ServerHostRepository
} from '@modules/openrct2/data/repositories';
import { BotPluginFileName } from '@modules/openrct2/data/types';
import { fisherYatesShuffle } from '@modules/utils/array-utils';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils';

type ServerCommandOptions =
  | 'server-id'
  | 'name' // scenario
  | 'index' // autosave, restart
  | 'defer' // start queue
  | 'port' | 'headless' // modify startup
  | 'size' | 'clear' // modify queue
  | 'use' | 'adapter-port' // modify plugin
type ServerCommandSubcommands =
  | 'create'
  | 'restart'
  | 'stop'
  | 'scenario' | 'autosave' | 'queue' | 'random' // start
  | 'queue' | 'plugin' | 'startup' // modify, check
type ServerCommandSubcommandGroups =
  | 'start'
  | 'check'
  | 'modify'

/** Represents a command for interacting with OpenRCT2 game servers. */
export class ServerCommand extends BotCommand<
  ServerCommandOptions,
  ServerCommandSubcommands,
  ServerCommandSubcommandGroups
> {
  private readonly pluginRepo: PluginRepository;
  private readonly scenarioRepo: ScenarioRepository;
  private readonly serverHostRepo: ServerHostRepository;
  private readonly openRCT2ServerController: OpenRCT2ServerController;

  constructor(
    pluginRepo: PluginRepository,
    scenarioRepo: ScenarioRepository,
    serverHostRepo: ServerHostRepository,
    openRCT2ServerController: OpenRCT2ServerController
  ) {
    super(CommandPermissionLevel.User);
    this.data
      .setName('server')
      .setDescription('Manages OpenRCT2 game servers.')
      .addSubcommand(subcommand =>
        subcommand
          .setName(this.reflectSubcommandName('create'))
          .setDescription('Creates a new server.')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(this.reflectSubcommandName('restart'))
          .setDescription(`Restarts an OpenRCT2 game server instance. Same as ${inlineCode('server start autosave')} with latest autosave.`)
          .addIntegerOption(option =>
            option
              .setName(this.reflectOptionName('server-id'))
              .setDescription('The id number of the server to restart.')
              .setMinValue(1)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(this.reflectSubcommandName('stop'))
          .setDescription('Stops a running OpenRCT2 game server instance.')
          .addIntegerOption(option =>
            option
              .setName(this.reflectOptionName('server-id'))
              .setDescription('The id number of the server to stop.')
              .setMinValue(1)
          )
      )
      .addSubcommandGroup(subcommandGroup =>
        subcommandGroup
          .setName(this.reflectSubcommandGroupName('start'))
          .setDescription('Starts an OpenRCT2 server.')
          .addSubcommand(subcommand =>
            subcommand
              .setName(this.reflectSubcommandName('scenario'))
              .setDescription('Starts an OpenRCT2 game server on a scenario.')
              .addStringOption(option =>
                option
                  .setName(this.reflectOptionName('name'))
                  .setDescription('The name of the scenario file to run.')
                  .setRequired(true)
              )
              .addIntegerOption(option =>
                option
                  .setName(this.reflectOptionName('server-id'))
                  .setDescription('The id number of the server to launch.')
                  .setMinValue(1)
              )
          )
          .addSubcommand(subcommand =>
            subcommand
              .setName(this.reflectSubcommandName('autosave'))
              .setDescription('Starts an OpenRCT2 game server on an autosave.')
              .addIntegerOption(option =>
                option
                  .setName(this.reflectOptionName('index'))
                  .setDescription('The autosave order number by age to restart from.')
                  .setMinValue(1)
              )
              .addIntegerOption(option =>
                option
                  .setName(this.reflectOptionName('server-id'))
                  .setDescription('The id number of the server to launch.')
                  .setMinValue(1)
              )
          )
          .addSubcommand(subcommand =>
            subcommand
              .setName(this.reflectSubcommandName('queue'))
              .setDescription('Starts an OpenRCT2 game server on a queued scenario.')
              .addBooleanOption(option =>
                option
                  .setName(this.reflectOptionName('defer'))
                  .setDescription('To delay the scenario start or not.')
              )
              .addIntegerOption(option =>
                option
                  .setName(this.reflectOptionName('server-id'))
                  .setDescription('The id number of the server to launch.')
                  .setMinValue(1)
              )
          )
          .addSubcommand(subcommand =>
            subcommand
              .setName(this.reflectSubcommandName('random'))
              .setDescription('Starts an OpenRCT2 game server on a random scenario.')
          )
      )
      .addSubcommandGroup(subcommandGroup =>
        subcommandGroup
          .setName(this.reflectSubcommandGroupName('check'))
          .setDescription('Checks OpenRCT2 game server properties.')
          .addSubcommand(subcommand =>
            subcommand
              .setName(this.reflectSubcommandName('queue'))
              .setDescription('Checks the current queue for a OpenRCT2 game server.')
              .addIntegerOption(option =>
                option
                  .setName(this.reflectOptionName('server-id'))
                  .setDescription('The id number of the server to check.')
                  .setMinValue(1)
              )
          )
          .addSubcommand(subcommand =>
            subcommand
              .setName(this.reflectSubcommandName('plugin'))
              .setDescription('Checks the current bot plugin options for a OpenRCT2 game server.')
              .addIntegerOption(option =>
                option
                  .setName(this.reflectOptionName('server-id'))
                  .setDescription('The id number of the server to check.')
                  .setMinValue(1)
              )
          )
          .addSubcommand(subcommand =>
            subcommand
              .setName(this.reflectSubcommandName('startup'))
              .setDescription('Checks the current startup options for a OpenRCT2 game server.')
              .addIntegerOption(option =>
                option
                  .setName(this.reflectOptionName('server-id'))
                  .setDescription('The id number of the server to check.')
                  .setMinValue(1)
              )
          )
      )
      .addSubcommandGroup(subcommandGroup =>
        subcommandGroup
          .setName(this.reflectSubcommandGroupName('modify'))
          .setDescription('Changes server properties.')
          .addSubcommand(subcommand =>
            subcommand
              .setName(this.reflectSubcommandName('queue'))
              .setDescription('Modifies the queue for an OpenRCT2 game server.')
              .addIntegerOption(option =>
                option
                  .setName(this.reflectOptionName('size'))
                  .setDescription('The new size for the queue.')
                  .setMinValue(0)
                  .setMaxValue(20)
              )
              .addBooleanOption(option =>
                option
                  .setName(this.reflectOptionName('clear'))
                  .setDescription('Clears out the queue.')
              )
              .addIntegerOption(option =>
                option
                  .setName(this.reflectOptionName('server-id'))
                  .setDescription('The id number of the server to modify.')
                  .setMinValue(1)
              )
          )
          .addSubcommand(subcommand =>
            subcommand
              .setName(this.reflectSubcommandName('plugin'))
              .setDescription('Sets the bot plugin options of an OpenRCT2 server.')
              .addBooleanOption(option =>
                option
                  .setName(this.reflectOptionName('use'))
                  .setDescription('To use bot plugins or not.')
              )
              .addIntegerOption(option =>
                option
                  .setName(this.reflectOptionName('adapter-port'))
                  .setDescription('The new port number for the server adapter plugin.')
                  .setMinValue(Math.pow(2, 10) + 1)
                  .setMaxValue(Math.pow(2, 16) - 1)
              )
              .addIntegerOption(option =>
                option
                  .setName(this.reflectOptionName('server-id'))
                  .setDescription('The id number of the server to modify.')
                  .setMinValue(1)
              )
          )
          .addSubcommand(subcommand =>
            subcommand
              .setName(this.reflectSubcommandName('startup'))
              .setDescription('Sets the startup options of an OpenRCT2 server.')
              .addIntegerOption(option =>
                option
                  .setName(this.reflectOptionName('port'))
                  .setDescription('The new port number.')
                  .setMinValue(Math.pow(2, 10) + 1)
                  .setMaxValue(Math.pow(2, 16) - 1)
              )
              .addBooleanOption(option =>
                option
                  .setName(this.reflectOptionName('headless'))
                  .setDescription('To run headless or not.')
              )
              .addIntegerOption(option =>
                option
                  .setName(this.reflectOptionName('server-id'))
                  .setDescription('The id number of the server to modify.')
                  .setMinValue(1)
              )
          )
      );

    this.pluginRepo = pluginRepo;
    this.scenarioRepo = scenarioRepo;
    this.serverHostRepo = serverHostRepo;
    this.openRCT2ServerController = openRCT2ServerController;
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction, userLevel: CommandPermissionLevel) {
    let commandResponse = new CommandResponseBuilder();

    if (this.isInteractionUsingSubcommand(interaction, 'create')) {
      if (userLevel > CommandPermissionLevel.Trusted) {
        commandResponse = await this.createNewServer();
      } else {
        commandResponse.appendToError(this.formatSubcommandPermissionError(null, 'create'));
      };
    } else {
      const serverId = this.doesInteractionHaveOption(interaction, 'server-id')
        ? this.getInteractionOption(interaction, 'server-id').value as number
        : 1;

      if (this.isInteractionUnderSubcommandGroup(interaction, 'modify')) {
        if (userLevel > CommandPermissionLevel.Trusted) {
          if (this.isInteractionUsingSubcommand(interaction, 'queue')) {
            const queueSize = this.doesInteractionHaveOption(interaction, 'size') 
              ? this.getInteractionOption(interaction, 'size').value as number
              : null;
            const clearFlag = this.doesInteractionHaveOption(interaction, 'clear') 
              ? this.getInteractionOption(interaction, 'clear').value as boolean
              : null;
            commandResponse = await this.setServerScenarioQueue(serverId, queueSize, clearFlag);
          } else if (this.isInteractionUsingSubcommand(interaction, 'plugin')) {
            const useBotPlugins = this.doesInteractionHaveOption(interaction, 'use') 
              ? this.getInteractionOption(interaction, 'use').value as boolean
              : null;
            const adapterPluginPortNumber = this.doesInteractionHaveOption(interaction, 'adapter-port') 
              ? this.getInteractionOption(interaction, 'adapter-port').value as number
              : null;
            commandResponse = await this.setServerPluginOptions(serverId, useBotPlugins, adapterPluginPortNumber);
          } else if (this.isInteractionUsingSubcommand(interaction, 'startup')) {
            const portNumber = this.doesInteractionHaveOption(interaction, 'port') 
              ? this.getInteractionOption(interaction, 'port').value as number
              : null;
            const headless = this.doesInteractionHaveOption(interaction, 'headless') 
              ? this.getInteractionOption(interaction, 'headless').value as boolean
              : null;
            commandResponse = await this.setServerStartupOptions(serverId, portNumber, headless);
          };
        } else {
          commandResponse.appendToError(this.formatSubcommandGroupPermissionError('modify'));
        };

      } else if (this.isInteractionUnderSubcommandGroup(interaction, 'check')) {
        if (this.isInteractionUsingSubcommand(interaction, 'queue')) {
          commandResponse = await this.showServerQueue(serverId);
        } else if (this.isInteractionUsingSubcommand(interaction, 'plugin')) {
          if (userLevel > CommandPermissionLevel.Trusted) {
            commandResponse = await this.showServerPluginOptions(serverId);
          } else {
            commandResponse.appendToError(this.formatSubcommandPermissionError('check', 'plugin'));
          };
        } else if (this.isInteractionUsingSubcommand(interaction, 'startup')) {
          if (userLevel > CommandPermissionLevel.Trusted) {
            commandResponse = await this.showServerStartupOptions(serverId);
          } else {
            commandResponse.appendToError(this.formatSubcommandPermissionError('check', 'startup'));
          };
        };

      } else {
        if (this.isInteractionUnderSubcommandGroup(interaction, 'start')) {
          if (userLevel > CommandPermissionLevel.User) {
            if (this.openRCT2ServerController.isServerProcessActive(serverId, 'start')) {
              commandResponse.appendToError(`Can't start ${underscore(italic(`Server ${serverId}`))}. It's already in the middle of starting a scenario.`);
            } else {
              await interaction.deferReply();

              if (this.isInteractionUsingSubcommand(interaction, 'scenario')) {
                const scenarioName = this.getInteractionOption(interaction, 'name').value as string;
                commandResponse = await this.startServerOnScenario(serverId, scenarioName);
              } else if (this.isInteractionUsingSubcommand(interaction, 'autosave')) {
                const autosaveIndex = this.doesInteractionHaveOption(interaction, 'index') 
                  ? this.getInteractionOption(interaction, 'index').value as number
                  : 1;
                commandResponse = await this.startServerOnAutosave(serverId, autosaveIndex);
              } else if (this.isInteractionUsingSubcommand(interaction, 'queue')) {
                const defer = this.doesInteractionHaveOption(interaction, 'defer') 
                  ? this.getInteractionOption(interaction, 'defer').value as boolean
                  : false;
                commandResponse = await this.startServerFromQueue(serverId, defer);
              } else if (this.isInteractionUsingSubcommand(interaction, 'random')) {
                commandResponse = await this.startServerOnRandomScenario(serverId);
              };
            };
          } else {
            commandResponse.appendToError(this.formatSubcommandGroupPermissionError('start'));
          };
        } else if (this.isInteractionUsingSubcommand(interaction, 'restart')) {
          await interaction.deferReply();

          if (userLevel > CommandPermissionLevel.User) {
            commandResponse = await this.startServerOnAutosave(serverId, 1);
          } else {
            commandResponse.appendToError(this.formatSubcommandPermissionError(null, 'restart'));
          };
        } else if (this.isInteractionUsingSubcommand(interaction, 'stop')) {
          if (userLevel > CommandPermissionLevel.Trusted) {
            commandResponse = await this.stopServer(serverId);
          } else {
            commandResponse.appendToError(this.formatSubcommandPermissionError(null, 'stop'));
          };
        };
      };
    };
    
    if (0 === commandResponse.resolve().length) {
      commandResponse.appendToError('Unknown or unimplemented command specified.');
    };

    if (interaction.deferred) {
      await interaction.editReply(commandResponse.resolve());
    } else {
      await interaction.reply(commandResponse.resolve());
    };
  };

  private async setServerStartupOptions(
    serverId: number,
    portNumber: number | null,
    headless: boolean | null
  ) {
    const commandResponse = new CommandResponseBuilder();

    const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
    const startupOptions = await serverDir.getStartupOptions();

    if (portNumber !== null) {
      if (portNumber < Math.pow(2, 10) + 1 || portNumber > Math.pow(2, 16) - 1) {
        commandResponse.appendToError(`Invalid port number specified: ${portNumber}`);
      } else {
        startupOptions.port = portNumber;
        commandResponse.appendToMessage(`Updated ${underscore(italic(`Server ${serverId}`))} to use port number ${italic(`${portNumber}`)}.`);
      };
    };

    if (headless !== null) {
      startupOptions.headless = headless;
      commandResponse.appendToMessage(`Updated ${underscore(italic(`Server ${serverId}`))} to${headless ? '' : ' not'} run as a headless server.`);
    };

    if (isStringNullOrWhiteSpace(commandResponse.message)) {
      commandResponse.appendToMessage('No changes were made.');
    } else if (!commandResponse.hasError) {
      await serverDir.updateStartupOptions(startupOptions);
      commandResponse.appendToMessage(`${EOL}These changes may require a server restart or backend configuration to apply correctly.`);
    };

    return commandResponse;
  };

  private async setServerScenarioQueue(
    serverId: number,
    queueSize: number | null,
    clear: boolean | null
  ) {
    const commandResponse = new CommandResponseBuilder();

    const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
    const queue = await serverDir.getQueue();

    if (clear !== null) {
      if (queue.scenarioQueue.length > 0) {
        const removed = queue.scenarioQueue.splice(0);
        const formattedRemoved = removed.map(scenarioFileName => italic(scenarioFileName));
        commandResponse.appendToMessage(
          `The scenario queue has been cleared out:`,
          ...formattedRemoved,
          ''
        );
      } else {
        commandResponse.appendToMessage('The scenario queue is already empty.');
      };
      queue.scenarioQueue = [];
    };

    if (queueSize !== null) {
      queue.scenarioQueueSize = queueSize;
      commandResponse.appendToMessage(
        `Updated the ${
          underscore(italic(`Server ${serverId}`))
        } scenario queue to ${queueSize > 0 ? `be of size ${queueSize}` : bold('INACTIVE')}.`
      );

      if (queueSize < queue.scenarioQueue.length) {
        const removed = queue.scenarioQueue.splice(queueSize);
        const formattedRemoved = removed.map(scenarioFileName => `• ${italic(scenarioFileName)}`);
        if (0 === queueSize) {
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
    };

    return commandResponse;
  };

  private async setServerPluginOptions(
    serverId: number,
    useBotPlugins: boolean | null,
    adapterPluginPortNumber: number | null
  ) {
    const commandResponse = new CommandResponseBuilder();

    const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
    const pluginOptions = await serverDir.getPluginOptions();
    const updateActions: (() => Promise<void>)[] = [];
    const performUpdates = async () => { for (const action of updateActions) { await action(); }; };

    if (useBotPlugins !== null) {
      pluginOptions.useBotPlugins = useBotPlugins;
      const botPlugins = await this.pluginRepo.getPluginFiles();

      if (useBotPlugins) {
        updateActions.push(async () => {
          const defaultErrors = [];
          if (pluginOptions.adapterPluginPort < 0) {
            defaultErrors.push('A port must be specified for the server adapter plugin first.');
          };
          if (defaultErrors.length > 0) {
            throw new Error(defaultErrors.join(EOL));
          };
          await serverDir.addPluginFiles(...botPlugins);
          const adapterPlugin = await serverDir.getPluginFileByName(BotPluginFileName.ServerAdapter);
          await adapterPlugin.setGlobalVariables(
            ['serverId', serverId],
            ['port', pluginOptions.adapterPluginPort]
          );
        });
      } else {
        updateActions.push(() => serverDir.removePluginFiles(...botPlugins.map(botPlugin => botPlugin.name)));
      };
      commandResponse.appendToMessage(`Updated ${underscore(italic(`Server ${serverId}`))} to${useBotPlugins ? '' : ' not'} run bot plugins.`);
    };

    if (adapterPluginPortNumber !== null) {
      if (adapterPluginPortNumber < Math.pow(2, 10) + 1 || adapterPluginPortNumber > Math.pow(2, 16) - 1) {
        commandResponse.appendToError(`Invalid port number specified: ${adapterPluginPortNumber}`);
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

        if (currentPorts.includes(adapterPluginPortNumber)) {
          commandResponse.appendToError(`Port number ${adapterPluginPortNumber} is already in use by a game server or plugin.`);
        } else {
          pluginOptions.adapterPluginPort = adapterPluginPortNumber;
          if (pluginOptions.useBotPlugins) {
            updateActions.push(async () => {
              const adapterPlugin = await serverDir.getPluginFileByName(BotPluginFileName.ServerAdapter);
              await adapterPlugin.setGlobalVariables(
                ['serverId', serverId],
                ['port', pluginOptions.adapterPluginPort]
              );
            });
          };
          commandResponse.appendToMessage(`Updated the ${
            underscore(italic(`Server ${serverId}`))
          } adapter plugin to use port number ${italic(`${adapterPluginPortNumber}`)}.`);
        };
      };
    };

    if (isStringNullOrWhiteSpace(commandResponse.message)) {
      commandResponse.appendToMessage('No changes were made.');
    } else if (!commandResponse.hasError) {
      try {
        await performUpdates();
        await serverDir.updatePluginOptions(pluginOptions);
        commandResponse.appendToMessage(`${EOL}These changes may require a server restart or backend configuration to apply correctly.`);
      } catch (err) {
        commandResponse.appendToError((err as Error).message);
      };
    };

    return commandResponse;
  };

  private async showServerQueue(serverId: number) {
    const commandResponse = new CommandResponseBuilder();

    const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
    const queue = await serverDir.getQueue();
    commandResponse.appendToMessage(this.formatServerQueueMessage(serverId, queue));

    return commandResponse;
  };

  private async showServerPluginOptions(serverId: number) {
    const commandResponse = new CommandResponseBuilder();

    const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
    const pluginOptions = await serverDir.getPluginOptions();
    commandResponse.appendToMessage(this.formatPluginOptionsMessage(serverId, pluginOptions));

    return commandResponse;
  };

  private async showServerStartupOptions(serverId: number) {
    const commandResponse = new CommandResponseBuilder();

    const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
    const startupOptions = await serverDir.getStartupOptions();
    commandResponse.appendToMessage(this.formatStartupOptionsMessage(serverId, startupOptions));

    return commandResponse;
  };

  private async createNewServer() {
    const commandResponse = new CommandResponseBuilder();

    const newDirResult = await this.serverHostRepo.createOpenRCT2ServerDirectory();
    commandResponse.appendToMessage(`Successfully created ${underscore(italic(`Server ${newDirResult.id}`))} and its starting data!`);

    return commandResponse;
  };

  private async startServerOnScenario(serverId: number, scenarioName: string) {
    const commandResponse = new CommandResponseBuilder();

    const scenarios = await this.scenarioRepo.getScenarioByFuzzySearch(scenarioName);
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

  private async startServerFromQueue(serverId: number, defer: boolean) {
    const commandResponse = new CommandResponseBuilder();

    const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
    const queue = await serverDir.getQueue();

    if (queue.scenarioQueue.length > 0) {
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

  private formatStartupOptionsMessage(serverId: number, startupOptions: StartupOptions) {
    const channelMsgSegments = [`Current startup options for ${italic(underscore(`Server ${serverId}`))}:${EOL}`];

    channelMsgSegments.push(`Port Number: ${startupOptions.port}`);
    channelMsgSegments.push(`Start Mode: ${startupOptions.headless ? italic('Headless') : italic('Windowed')}`);

    return channelMsgSegments.join(EOL);
  };

  private formatPluginOptionsMessage(serverId: number, pluginOptions: PluginOptions) {
    const channelMsgSegments = [`Current bot plugin options for ${italic(underscore(`Server ${serverId}`))}:${EOL}`];

    channelMsgSegments.push(`Using Bot Plugins: ${pluginOptions.useBotPlugins ? bold('YES') : bold('NO')}`);
    channelMsgSegments.push(`Adapter Plugin Port Number: ${pluginOptions.adapterPluginPort}`);

    return channelMsgSegments.join(EOL);

  };

  private formatServerQueueMessage(serverId: number, queue: ServerQueue) {
    const channelMsgSegments = [`Current queue values for ${italic(underscore(`Server ${serverId}`))}:${EOL}`];

    if (queue.scenarioQueueSize > 0) {
      const formattedQueue = queue.scenarioQueue.map(queued => `• ${italic(queued)}`);
      channelMsgSegments.push(`Scenario Queue Size: ${queue.scenarioQueueSize}`);
      channelMsgSegments.push(`Scenario Queue: ${formattedQueue.length > 0 ? `${EOL}${formattedQueue.join(EOL)}` : italic('Empty')}`);
    } else {
      channelMsgSegments.push(`Scenario Queue: ${bold('INACTIVE')}`);
    };

    return channelMsgSegments.join(EOL);
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