import 'module-alias/register';
import { 
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes
} from 'discord.js';
import { ConfigurationBuilder } from '@modules/configuration';
import {
  CommandExecutor,
  CommandFactory
} from '@modules/discord/commands';
import { EventNotifier } from '@modules/discord/runtime';
import { BotDataRepository } from '@modules/discord/data/repositories';
import { Logger } from '@modules/logging';
import { OpenRCT2ServerController } from '@modules/openrct2/controllers';
import { 
  OpenRCT2BuildRepository,
  PluginRepository,
  ScenarioRepository,
  ServerHostRepository
} from '@modules/openrct2/data/repositories';
import { BotPluginFileName } from '@modules/openrct2/data/types';
import { OpenRCT2ProcessEngine } from '@modules/openrct2/runtime';
import {
  OpenRCT2MasterServer,
  OpenRCT2BuildDownloader
} from '@modules/openrct2/web';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils';

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
  const gameBuildRepo = new OpenRCT2BuildRepository(config);
  const pluginRepo = new PluginRepository(config);
  const scenarioRepo = new ScenarioRepository(config);
  const serverHostRepo = new ServerHostRepository(config);
  const openRCT2ProcessEngine = new OpenRCT2ProcessEngine();
  const openRCT2MasterServer = new OpenRCT2MasterServer();
  const openRCT2BuildDownloader = new OpenRCT2BuildDownloader();
  const openRCT2ServerController = new OpenRCT2ServerController(logger, openRCT2ProcessEngine, scenarioRepo, serverHostRepo);
  const commandFactory = new CommandFactory(
    config,
    logger,
    botDataRepo,
    gameBuildRepo,
    pluginRepo,
    scenarioRepo,
    serverHostRepo,
    openRCT2BuildDownloader,
    openRCT2MasterServer,
    openRCT2ServerController
  );
  const commandExecutor = new CommandExecutor(discordClient, logger, commandFactory, botDataRepo);
  new EventNotifier(discordClient, logger, botDataRepo, openRCT2ServerController);

  const serverDirs = await serverHostRepo.getAllOpenRCT2ServerRepositories();
  const botPlugins = await pluginRepo.getPluginFiles();
  for (const [serverId, serverDir] of serverDirs) {
    await serverDir.removePluginFiles(...botPlugins.map(botPlugin => botPlugin.name));
    const pluginOptions = await serverDir.getPluginOptions();
    if (pluginOptions.useBotPlugins) {
      await serverDir.addPluginFiles(...botPlugins);
      const adapterPlugin = await serverDir.getPluginFileByName(BotPluginFileName.ServerAdapter);
      await adapterPlugin.setGlobalVariables(
        ['serverId', serverId],
        ['port', pluginOptions.adapterPluginPort]
      );
    };
  };

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
      //{ body: commandFactory.commandDataArray.filter(data => ['game-build', 'server'].includes(data.name)) }
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