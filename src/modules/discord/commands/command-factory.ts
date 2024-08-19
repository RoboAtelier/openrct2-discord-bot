import { Client } from 'discord.js';
import { Configuration } from '@modules/configuration/index.js';
import * as Commands from '@modules/discord/commands/index.js';
import { BotDataRepository } from '@modules/discord/data/repositories/index.js';
import { Logger } from '@modules/logging/index.js';
import { OpenRCT2ServerController } from '@modules/openrct2/controllers/index.js';
import * as OpenRCT2Repositories from '@modules/openrct2/data/repositories/index.js';
import {
  BuildDownloadService,
  MasterServerService
} from '@modules/openrct2/services/index.js';

export class CommandFactory {
  private readonly commandCache = new Map<string, Commands.DiscordBotCommand>();

  constructor(
    config: Configuration,
    discordClient: Client<true>,
    logger: Logger,
    botDataRepo: BotDataRepository,
    buildRepo: OpenRCT2Repositories.BuildRepository,
    scenarioRepo: OpenRCT2Repositories.ScenarioRepository,
    serverRepo: OpenRCT2Repositories.ServerRepository,
    buildDownloadService: BuildDownloadService,
    openRCT2MasterServer: MasterServerService,
    openRCT2ServerController: OpenRCT2ServerController,
  ) {
    const commands: Commands.DiscordBotCommand[] = [
      new Commands.ChannelCommand(botDataRepo),
      new Commands.ChatCommand(logger, botDataRepo, openRCT2ServerController),
      new Commands.BuildCommand(logger, buildRepo, buildDownloadService),
      new Commands.GroupCommand(logger, botDataRepo, openRCT2ServerController),
      new Commands.MasterServerCommand(config, openRCT2MasterServer),
      new Commands.ScenarioCommand(scenarioRepo),
      new Commands.ServerCommand(botDataRepo, buildRepo, scenarioRepo, serverRepo, openRCT2ServerController),
      new Commands.SnapshotCommand(logger, botDataRepo, serverRepo, openRCT2ServerController),
      new Commands.PauseCommand(logger, botDataRepo, openRCT2ServerController),
      new Commands.PlayerCommand(logger, botDataRepo, openRCT2ServerController),
      new Commands.RoleCommand(discordClient, botDataRepo),
      new Commands.VoteCommand(logger, botDataRepo, scenarioRepo, serverRepo, openRCT2ServerController)
    ];
    commands.push(new Commands.HelpCommand(commands.map(command => command.data)));
    for (const command of commands) {
      if (this.commandCache.has(command.data.name)) {
        throw new Error(`A command with the name '${command.data.name}' already exists.`);
      };
      this.commandCache.set(command.data.name, command);
    };
  };

  /** Gets the current command data array. */
  get commandDataArray() {
    return [...this.commandCache.values()].map(command => {
      return command.data.toJSON();
    });
  };

  /**
   * Returns a command by name.
   * @param name The name of the command to get.
   */
  getCommand(name: string) {
    return this.commandCache.get(name);
  };
};