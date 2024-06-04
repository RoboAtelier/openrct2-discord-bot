import {
  bold,
  italic,
  ChatInputCommandInteraction,
  User
} from 'discord.js';
import { EOL } from 'os';
import { 
  CommandPermissionLevel,
  CommandResponseBuilder,
  CommandType,
  SubcommandsDiscordBotCommand
} from '@modules/discord/commands';
import { BotDataRepository } from '@modules/discord/data/repositories';
import { Logger } from '@modules/logging';
import { OpenRCT2ServerController } from '@modules/openrct2/controllers';

const PlayerSubcommands = <const>[
  { 
    name: 'list',
    description: 'Gets the current player list on an OpenRCT2 game server.',
    options: null
  }
];

/** Represents a command for getting player information or managing them on an OpenRCT2 game server. */
export class PlayerCommand extends SubcommandsDiscordBotCommand<undefined, typeof PlayerSubcommands[number]> {
  private static readonly formatCodeRegex = /{[A-Z0-9_]+}/g;

  private readonly logger: Logger;
  private readonly botDataRepo: BotDataRepository;
  private readonly openRCT2ServerController: OpenRCT2ServerController;

  constructor(
    logger: Logger,
    botDataRepo: BotDataRepository,
    openRCT2ServerController: OpenRCT2ServerController
  ) {
    super(
      'player',
      'Gets and manages an OpenRCT2 game server\'s current players.',
      undefined,
      PlayerSubcommands,
      CommandPermissionLevel.User,
      CommandType.Game
    );

    this.logger = logger;
    this.botDataRepo = botDataRepo;
    this.openRCT2ServerController = openRCT2ServerController;
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction) {
    let commandResponse = new CommandResponseBuilder();

    const guildInfo = await this.botDataRepo.getGuildInfo();
    const gameServerChannel = guildInfo.gameServerChannels.find(channel => channel.channelId === interaction.channelId)!;

    await interaction.deferReply();
    commandResponse = await this.getServerPlayerList(gameServerChannel.serverId, interaction.user);

    await interaction.editReply(commandResponse.resolve());
  };

  private async getServerPlayerList(serverId: number, user: User) {
    const commandResponse = new CommandResponseBuilder();

    try {
      const serverPlayers = await this.openRCT2ServerController.executePluginAction(serverId, 'player.list', user.id);
      commandResponse.appendToMessage(this.formatPlayerListMessage(serverPlayers));
    } catch (err) {
      await this.logger.writeError(err as Error);
      commandResponse.appendToError((err as Error).message);
    };

    return commandResponse;
  };

  private formatPlayerListMessage(
    serverPlayers: {
      name: string,
      group: string
    }[]
  ) {
    const playerListMsgSegments = [serverPlayers.length > 0 ? 'Current Players:' : `Current Players: ${italic('None')}`];

    for (const player of serverPlayers) {
      playerListMsgSegments.push(`▸ ${bold(player.name.replace(PlayerCommand.formatCodeRegex, ''))}: ${player.group}`);
    };

    return playerListMsgSegments.join(EOL);
  };
};