//import 'module-alias/register.js';
import { 
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes
} from 'discord.js';
import { ConfigurationBuilder } from '@modules/configuration/index.js';
import {
  CommandExecutor,
  CommandFactory
} from '@modules/discord/commands/index.js';
import { EventNotifier } from '@modules/discord/runtime/index.js';
import { BotDataRepository } from '@modules/discord/data/repositories/index.js';
import { Logger } from '@modules/logging/index.js';
import { OpenRCT2 } from '@modules/openrct2/index.js';
import { OpenRCT2ServerController } from '@modules/openrct2/controllers/index.js';
import { 
  BuildRepository,
  PluginRepository,
  ScenarioRepository,
  ServerRepository
} from '@modules/openrct2/data/repositories/index.js';
import {
  BuildDownloadService,
  GameService,
  MasterServerService,
  PluginService
} from '@modules/openrct2/services/index.js';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils.js';

/** Main application entry point. */
async function main() {
  const configBuilder = new ConfigurationBuilder();
  configBuilder.addJSONFile('bot-config.json');
  const config = configBuilder.build();

  const discordClient = new Client(
    { 
      intents:
      [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent
      ]
    }
  );
  const logger = new Logger(config);
  const botDataRepo = new BotDataRepository(config);
  const buildRepo = new BuildRepository(config);
  const pluginRepo = new PluginRepository(config);
  const scenarioRepo = new ScenarioRepository(config);
  const serverHostRepo = new ServerRepository(config);
  const openRCT2ProcessEngine = new GameService();
  const pluginService = new PluginService(pluginRepo, serverHostRepo);
  const openRCT2MasterServer = new MasterServerService();
  const openRCT2BuildDownloader = new BuildDownloadService(buildRepo);
  const openRCT2ServerController = new OpenRCT2ServerController(logger, openRCT2ProcessEngine, pluginService, scenarioRepo, serverHostRepo);
  const commandFactory = new CommandFactory(
    config,
    logger,
    botDataRepo,
    buildRepo,
    scenarioRepo,
    serverHostRepo,
    openRCT2BuildDownloader,
    openRCT2MasterServer,
    openRCT2ServerController
  );
  const commandExecutor = new CommandExecutor(discordClient, logger, commandFactory, botDataRepo);
  new EventNotifier(discordClient, logger, botDataRepo, openRCT2ServerController);

  discordClient.on(Events.ClientReady, async () => {
    if (discordClient.user === null) {
      throw new Error('Bot client user object was null on startup.');
    };

    const guildInfo = await botDataRepo.getGuildInfo();
    if (isStringNullOrWhiteSpace(guildInfo.guildId)) {
      const guilds = [...discordClient.guilds.cache.values()];
      if (guilds.length) {
        guildInfo.guildId = guilds[0].id;
        await botDataRepo.updateGuildInfo(guildInfo);
      } else {
        throw new Error('Bot client is not in a guild.');
      };
    };

    const rest = new REST({ version: '10' }).setToken(config.getValue('token'));
    await rest.put(
      Routes.applicationGuildCommands(config.getValue('clientId'), guildInfo.guildId),
      { body: commandFactory.commandDataArray }
      //{ body: [] }
      //{ body: commandFactory.commandDataArray.filter(cmd => cmd.name === 'build') }
    );

    console.log(`${discordClient.user.tag} has logged in!`);
  });

  discordClient.on(Events.Error, err => {
    console.log(err);
  });

  discordClient.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
      await commandExecutor.runCommandInteraction(interaction);
    };
  });

  discordClient.login(config.getValue('token'));
};

main();