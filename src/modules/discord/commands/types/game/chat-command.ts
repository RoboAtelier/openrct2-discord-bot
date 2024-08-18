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

const ChatCommandOptions = <const>[
  { 
    name: 'message',
    type: 'string',
    description: 'The chat message to send (max length 200).',
    required: true,
    minLength: 1,
    maxLength: 200
  }
];

/** Represents a command for sending chat messages to an OpenRCT2 game server. */
export class ChatCommand extends OptionsDiscordBotCommand<typeof ChatCommandOptions[number]> {
  private readonly logger: Logger;
  private readonly botDataRepo: BotDataRepository;
  private readonly openRCT2ServerController: OpenRCT2ServerController;

  constructor(
    logger: Logger,
    botDataRepo: BotDataRepository,
    openRCT2ServerController: OpenRCT2ServerController
  ) {
    super(
      'chat',
      'Sends a chat message to an OpenRCT2 game server.',
      ChatCommandOptions,
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
    await this.sendGameChatMessage(
      response,
      gameServerChannel.serverId,
      interaction.user,
      this.getRequiredInteractionOption(interaction, 'message').value as string
    );
    await interaction.editReply(response.resolve(interaction));
  };

  private async sendGameChatMessage(response: ResponseBuilder, serverId: number, user: User, message: string) {
    try {
      const fullMessage = `{DISCORD}{PALELAVENDER}${user.username}#${user.discriminator}: {WHITE}${message}`;
      await this.openRCT2ServerController.executePluginRequest(serverId, 'chat', user.id, fullMessage);
      response.addText(message);
    } catch (err) {
      await this.logger.writeError(err as Error);
      response.addErrorText((err as Error).message);
    };
  };
};