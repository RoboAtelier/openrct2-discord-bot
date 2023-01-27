import {
  ChatInputCommandInteraction,
  User
} from 'discord.js';
import { 
  BotCommand,
  CommandPermissionLevel,
  CommandResponseBuilder,
  CommandType
} from '@modules/discord/commands';
import { BotDataRepository } from '@modules/discord/data/repositories';
import { Logger } from '@modules/logging';
import { OpenRCT2ServerController } from '@modules/openrct2/controllers';

type ChatCommandOptions = 'message'

/** Represents a command for sending chat messages to an OpenRCT2 game server. */
export class ChatCommand extends BotCommand<ChatCommandOptions, null, null> {
  private readonly logger: Logger;
  private readonly botDataRepo: BotDataRepository;
  private readonly openRCT2ServerController: OpenRCT2ServerController;

  constructor(
    logger: Logger,
    botDataRepo: BotDataRepository,
    openRCT2ServerController: OpenRCT2ServerController
  ) {
    super(CommandPermissionLevel.User, CommandType.Game);
    this.data
      .setName('chat')
      .setDescription('Sends a chat message to an OpenRCT2 game server.')
      .addStringOption(option =>
        option
          .setName(this.reflectOptionName('message'))
          .setDescription('The chat message to send (max length 100).')
          .setMinLength(1)
          .setMaxLength(100)
          .setRequired(true)
      )

    this.logger = logger;
    this.botDataRepo = botDataRepo;
    this.openRCT2ServerController = openRCT2ServerController;
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction, userLevel: CommandPermissionLevel) {
    let commandResponse = new CommandResponseBuilder();

    const guildInfo = await this.botDataRepo.getGuildInfo();
    const gameServerChannel = guildInfo.gameServerChannels.find(channel => channel.channelId === interaction.channelId)!;
    const message = this.getInteractionOption(interaction, 'message').value as string;

    commandResponse = await this.sendGameChatMessage(gameServerChannel.serverId, interaction.user, message);

    if (commandResponse.hasError) {
      await interaction.reply({ content: commandResponse.resolve(), ephemeral: true });
    } else {
      await interaction.reply(commandResponse.resolve());
    };
  };

  private async sendGameChatMessage(serverId: number, user: User, message: string) {
    const commandResponse = new CommandResponseBuilder();

    try {
      const fullMessage = `{DISCORD}{PALELAVENDER}${user.username}#${user.discriminator}: {WHITE}${message}`;
      await this.openRCT2ServerController.executePluginAction(serverId, 'chat', user.id, fullMessage);
      commandResponse.appendToMessage(message);
    } catch (err) {
      await this.logger.writeError(err as Error);
      commandResponse.appendToError((err as Error).message);
    };

    return commandResponse;
  };
};