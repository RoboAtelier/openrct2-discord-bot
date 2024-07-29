import {
  bold,
  ChatInputCommandInteraction,
  User
} from 'discord.js';
import { EOL } from 'os';
import { 
  CommandPermissionLevel,
  ResponseBuilder,
  CommandType,
  SubcommandsDiscordBotCommand
} from '@modules/discord/commands';
import { BotDataRepository } from '@modules/discord/data/repositories';
import { Logger } from '@modules/logging';
import { OpenRCT2ServerController } from '@modules/openrct2/controllers';

const GroupSubcommands = <const>[
  { 
    name: 'list',
    description: 'Gets the player group list on an OpenRCT2 game server.',
    options: null
  }
];

/** Represents a command for getting player group information or managing them on an OpenRCT2 game server. */
export class GroupCommand extends SubcommandsDiscordBotCommand<undefined, typeof GroupSubcommands[number]> {
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
      'group',
      'Gets and manages an OpenRCT2 game server\'s player groups.',
      undefined,
      GroupSubcommands,
      CommandPermissionLevel.User,
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
    await this.getPlayerGroupList(response, gameServerChannel.serverId, interaction.user);
    await interaction.editReply(response.resolve(interaction));
  };

  private async getPlayerGroupList(response: ResponseBuilder, serverId: number, user: User) {
    try {
      const playerGroups = await this.openRCT2ServerController.executePluginAction(serverId, 'group.list', user.id);
      response.addText(this.formatGroupListMessage(playerGroups));
    } catch (err) {
      await this.logger.writeError(err as Error);
      response.addErrorText((err as Error).message);
    };
  };

  private formatGroupListMessage(
    playerGroups: {
      id: number,
      name: string
    }[]
  ) {
    const groupListMsgSegments = ['Groups:'];

    for (const group of playerGroups) {
      groupListMsgSegments.push(`▸ ${bold(group.name.replace(GroupCommand.formatCodeRegex, ''))} (GID ${group.id})`);
    };

    return groupListMsgSegments.join(EOL);
  };
};