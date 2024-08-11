import {
  bold,
  italic,
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

const PlayerSubcommandGroups = <const>[
  { 
    name: 'group',
    subcommands: [
      { 
        name: 'set',
        description: 'Sets the player group for an active player.',
        options: [
          { 
            name: 'player-id',
            type: 'integer',
            description: 'The id number of the player in the server.',
            required: true,
            minValue: 1
          },
          { 
            name: 'group-id',
            type: 'integer',
            description: 'The id number of the player group to assign in the server.',
            required: true,
            minValue: 0
          }
        ]
      }
    ]
  }
];
const PlayerSubcommands = <const>[
  {
    name: 'kick',
    description: 'Kicks an active player out from an OpenRCT2 game server.',
    options: [
      { 
        name: 'player-id',
        type: 'integer',
        description: 'The id number of the player in the server.',
        required: true,
        minValue: 1
      },
    ]
  },
  { 
    name: 'list',
    description: 'Gets the current player list on an OpenRCT2 game server.',
    permissionLevel: CommandPermissionLevel.User,
    options: null
  }
];

/** Represents a command for getting player information or managing them on an OpenRCT2 game server. */
export class PlayerCommand extends SubcommandsDiscordBotCommand<typeof PlayerSubcommandGroups[number], typeof PlayerSubcommands[number]> {
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
      PlayerSubcommandGroups,
      PlayerSubcommands,
      CommandPermissionLevel.Moderator,
      CommandType.Game
    );

    this.logger = logger;
    this.botDataRepo = botDataRepo;
    this.openRCT2ServerController = openRCT2ServerController;
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction) {
    const groupName = this.getInteractionSubcommandGroupName(interaction);
    const subcommandName = this.getInteractionSubcommandName(interaction);
    const response = new ResponseBuilder();

    const guildInfo = await this.botDataRepo.getGuildInfo();
    const gameServerChannel = guildInfo.gameServerChannels.find(channel => channel.channelId === interaction.channelId)!;

    await interaction.deferReply();

    if (subcommandName === 'kick') {
      const options = this.getInteractionSubcommandOptions(interaction, subcommandName);
      await this.kickPlayer(
        response,
        gameServerChannel.serverId,
        interaction.user,
        options.get('player-id')?.value as number
      );
    } else if (subcommandName === 'list') {
      await this.getPlayerList(response, gameServerChannel.serverId, interaction.user);
    } else if (groupName === 'group') {
      if (subcommandName === 'set') {
        const options = this.getInteractionSubcommandGroupSubcommandOptions(interaction, groupName, subcommandName);
        await this.setPlayerGroup(
          response,
          gameServerChannel.serverId,
          interaction.user,
          options.get('player-id')?.value as number,
          options.get('group-id')?.value as number
        );
      };
    };

    if (!response.hasContent) {
      interaction.deferred 
        ? await interaction.editReply(SubcommandsDiscordBotCommand.unknownCommandErrorMessage)
        : await interaction.reply(SubcommandsDiscordBotCommand.unknownCommandErrorMessage);
      return;
    };

    await interaction.editReply(response.resolve(interaction));
  };

  private async kickPlayer(
    response: ResponseBuilder,
    serverId: number,
    user: User,
    playerId: number
  ) {
    try {
      const kickedPlayer = await this.openRCT2ServerController.executePluginRequest(
        serverId,
        'player.kick',
        user.id,
        playerId
      );
      if (kickedPlayer) {
        response.addText(`${bold(kickedPlayer)} has been kicked.`);
      } else {
        response.addErrorText('Failed to kick a player.');
      };
    } catch (err) {
      await this.logger.writeError(err as Error);
      response.addErrorText((err as Error).message);
    };
  };

  private async getPlayerList(response: ResponseBuilder, serverId: number, user: User) {
    try {
      const serverPlayers = await this.openRCT2ServerController.executePluginRequest(serverId, 'player.list', user.id);
      response.addText(this.formatPlayerListMessage(serverPlayers));
    } catch (err) {
      await this.logger.writeError(err as Error);
      response.addErrorText((err as Error).message);
    };
  };

  private async setPlayerGroup(
    response: ResponseBuilder,
    serverId: number,
    user: User,
    playerId: number,
    groupId: number
  ) {
    try {
      const updatedPlayer = await this.openRCT2ServerController.executePluginRequest(
        serverId,
        'player.group.set',
        user.id,
        { playerId: playerId, groupId: groupId }
      );
      if (updatedPlayer) {
        response.addText(`Successfully assigned player group ${bold(updatedPlayer.group)} to ${
          bold(updatedPlayer.name.replace(PlayerCommand.formatCodeRegex, ''))
        } (PID ${updatedPlayer.id}).`);
      } else {
        response.addErrorText('Failed to assign player group.');
      };
    } catch (err) {
      await this.logger.writeError(err as Error);
      response.addErrorText((err as Error).message);
    };
  };

  private formatPlayerListMessage(
    serverPlayers: {
      id: number,
      name: string,
      group: string
    }[]
  ) {
    const playerListMsgSegments = [serverPlayers.length > 0 ? 'Current Players:' : `Current Players: ${italic('None')}`];

    for (const player of serverPlayers) {
      playerListMsgSegments.push(`▸ ${bold(player.name.replace(PlayerCommand.formatCodeRegex, ''))} (PID ${player.id}): ${player.group}`);
    };

    return playerListMsgSegments.join(EOL);
  };
};