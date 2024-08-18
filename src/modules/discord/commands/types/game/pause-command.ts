import {
  ChatInputCommandInteraction,
  User
} from 'discord.js';
import { 
  CommandPermissionLevel,
  ResponseBuilder,
  CommandType,
  OptionsDiscordBotCommand
} from '@modules/discord/commands/index.js';
import { BotDataRepository } from '@modules/discord/data/repositories/index.js';
import { Logger } from '@modules/logging/index.js';
import { OpenRCT2ServerController } from '@modules/openrct2/controllers/index.js';

const PauseCommandOptions = <const>[];

/** Represents a command to toggle pausing an OpenRCT2 game server. */
export class PauseCommand extends OptionsDiscordBotCommand<typeof PauseCommandOptions[number]> {
  private readonly logger: Logger;
  private readonly botDataRepo: BotDataRepository;
  private readonly openRCT2ServerController: OpenRCT2ServerController;

  constructor(
    logger: Logger,
    botDataRepo: BotDataRepository,
    openRCT2ServerController: OpenRCT2ServerController
  ) {
    super(
      'pause',
      'Toggles pausing on an OpenRCT2 game server.',
      PauseCommandOptions,
      CommandPermissionLevel.Trusted,
      CommandType.Game
    );

    this.logger = logger;
    this.botDataRepo = botDataRepo;
    this.openRCT2ServerController = openRCT2ServerController;
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction) {
    const response = new ResponseBuilder();

    const guildInfo = await this.botDataRepo.getGuildInfo();
    const gameServerChannel = guildInfo.gameServerChannels.find(channel => channel.channelId === interaction.channelId)!;

    await interaction.deferReply();
    await this.togglePause(response, gameServerChannel.serverId, interaction.user);
    await interaction.editReply(response.resolve(interaction));
  };

  private async togglePause(response: ResponseBuilder, serverId: number, user: User) {
    try {
      await this.openRCT2ServerController.executePluginRequest(serverId, 'pause.toggle', user.id);
      response.addText('Toggled pause.');
    } catch (err) {
      await this.logger.writeError(err as Error);
      response.addErrorText((err as Error).message);
    };
  };
};