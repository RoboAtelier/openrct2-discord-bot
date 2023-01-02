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
import { DiscordMessenger } from '@modules/discord/runtime';
import { BotDataRepository } from '@modules/discord/data/repositories';
import { OpenRCT2ServerController } from '@modules/openrct2/controllers';
import { 
  PluginRepository,
  ScenarioRepository,
  ServerHostRepository
} from '@modules/openrct2/data/repositories';
import { OpenRCT2MasterServer } from '@modules/openrct2/web';
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
  const discordMessenger = new DiscordMessenger(discordClient);
  const botDataRepo = new BotDataRepository(config);
  const pluginRepo = new PluginRepository(config);
  const scenarioRepo = new ScenarioRepository(config);
  const serverHostRepo = new ServerHostRepository(config);
  const openRCT2MasterServer = new OpenRCT2MasterServer();
  const openRCT2ServerController = new OpenRCT2ServerController(config, scenarioRepo, serverHostRepo);
  const commandFactory = new CommandFactory(
    config,
    discordMessenger,
    botDataRepo,
    pluginRepo,
    scenarioRepo,
    serverHostRepo,
    openRCT2MasterServer,
    openRCT2ServerController
  );
  const commandExecutor = new CommandExecutor(discordClient, commandFactory, botDataRepo);

  discordClient.on(Events.ClientReady, async () => {
    if (discordClient.user === null) {
      throw new Error('Bot client user object was null on startup.');
    };

    const guildInfo = await botDataRepo.getGuildInfo();
    if (isStringNullOrWhiteSpace(guildInfo.guildId)) {
      const guilds = [...discordClient.guilds.cache.values()];
      if (guilds.length > 0) {
        guildInfo.guildId = (guilds[0] as any).id; // expose id
        await botDataRepo.updateGuildInfo(guildInfo);
      } else {
        throw new Error('Bot client is not in a guild.');
      };
    };

    const rest = new REST({ version: '10' }).setToken(config.getValue('token'));
    await rest.put(
      (Routes as any).applicationGuildCommands(config.getValue('clientId'), guildInfo.guildId),
      { body: commandFactory.commandDataArray }
    );

    console.log(`${discordClient.user.tag} has logged in!`);
  });

  discordClient.on(Events.Error, err => {
    console.log(err);
    discordClient.destroy();
  });

  discordClient.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
      await commandExecutor.runCommandInteraction(interaction);
    };
  });

  discordClient.login(config.getValue('token'));
};

main();