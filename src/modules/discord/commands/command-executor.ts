import { 
  ChatInputCommandInteraction,
  Client,
  Guild,
  GuildMember,
  inlineCode,
  PermissionFlagsBits
} from 'discord.js';
import { 
  DiscordBotCommand,
  CommandFactory,
  CommandPermissionLevel,
  CommandType
 } from '.';
import { GuildInfo } from '@modules/discord/data/models/bot';
import { BotDataRepository } from '@modules/discord/data/repositories';
import { Logger } from '@modules/logging';

export class CommandExecutor {
  private readonly discordClient: Client<true>;
  private readonly logger: Logger;
  private readonly commandFactory: CommandFactory;
  private readonly botDataRepo: BotDataRepository;

  constructor(
    discordClient: Client<true>,
    logger: Logger,
    commandFactory: CommandFactory,
    botDataRepo: BotDataRepository
  ) {
    this.discordClient = discordClient;
    this.logger = logger;
    this.commandFactory = commandFactory;
    this.botDataRepo = botDataRepo;
  };

  async runCommandInteraction(interaction: ChatInputCommandInteraction) {
    const commandSettings = await this.botDataRepo.getCommandSettings();
    const guildInfo = await this.botDataRepo.getGuildInfo();
    const userPermLevel = await this.identifyInvokerPermissionLevel(interaction, guildInfo);
    
    if (commandSettings.adminRestricted) {
      if (userPermLevel === CommandPermissionLevel.Administrator) {
        const command = this.commandFactory.getCommand(interaction.commandName);
        if (command) {
          await command.execute(interaction);
        };
      } else {
        await interaction.reply({ content: 'Commands are locked down.', ephemeral: true });
      };
    } else {
      const command = this.commandFactory.getCommand(interaction.commandName);

      if (command && this.canUserCallCommandInChannel(command, userPermLevel, interaction, guildInfo)) {
        const accessResult = command.confirmCommandAccess(interaction, userPermLevel);
        if (accessResult.isSuccess) {
          try {
            const log = `${interaction.user.username} called the '${command.data.name}' command.`;
            await this.logger.writeLog(log);
            await command.execute(interaction);
          } catch (err) {
            console.error(err);
            await this.logger.writeError(err as Error);
            if (interaction.deferred) {
              interaction.editReply((err as Error).message);
            };
          };
        } else {
          let errorMsg = '';
          if (accessResult.deniedSubcommandGroup) {
            errorMsg += `You cannot use the subcommand under the ${inlineCode(accessResult.deniedSubcommandGroup)} subcommand group`
            errorMsg += accessResult.deniedOptions?.length
              ? ` with the specified options: ${accessResult.deniedOptions.map(option => inlineCode(option)).join(' ')}`
              : '.';
          } else if (accessResult.deniedSubcommand) {
            errorMsg += `You cannot use the ${inlineCode(accessResult.deniedSubcommand)} subcommand`
            errorMsg += accessResult.deniedOptions?.length
              ? ` with the specified options: ${accessResult.deniedOptions.map(option => inlineCode(option)).join(' ')}`
              : '.';
          } else if (accessResult.deniedOptions?.length) {
            errorMsg += `You cannot use that command with the specified options: ${accessResult.deniedOptions.map(option => inlineCode(option)).join(' ')}`;
          } else {
            errorMsg += 'You cannot use that command.';
          };
          await interaction.reply({ content: errorMsg, ephemeral: true });
        };
      } else {
        await interaction.reply({ content: 'You cannot use that command here.', ephemeral: true });
      };
    };
  };

  private canUserCallCommandInChannel(
    command: DiscordBotCommand,
    userPermLevel: CommandPermissionLevel,
    interaction: ChatInputCommandInteraction,
    guildInfo: GuildInfo
  ) {
    if (command.type === CommandType.Game) {
      return guildInfo.gameServerChannels.find(channel => channel.channelId === interaction.channelId) !== undefined;
    } else {
      return userPermLevel > CommandPermissionLevel.Trusted
        || !guildInfo.botChannelIds.length
        || guildInfo.botChannelIds.includes(interaction.channelId);
    };
  };

  private async identifyInvokerPermissionLevel(interaction: ChatInputCommandInteraction, guildInfo: GuildInfo) {
    let currentGuild = this.discordClient.guilds.cache.get(guildInfo.guildId);
    if (currentGuild && interaction.member) {
      return this.identifyUserPermissionLevelFromGuildInfo(
        currentGuild,
        interaction.member as GuildMember,
        guildInfo
      );
    } else if (guildInfo.restrictedUserIds.includes(interaction.user.id)) {
      return CommandPermissionLevel.Restricted;
    } else {
      return CommandPermissionLevel.User;
    };
  };

  private async identifyUserPermissionLevelFromGuildInfo(guild: Guild, member: GuildMember, guildInfo: GuildInfo) {
    if (guild.ownerId === member.id || member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return CommandPermissionLevel.Administrator;
    } else if (member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return CommandPermissionLevel.Moderator;
    } else if (member.roles.cache.some(role => guildInfo.trustedRoleIds.includes(role.id))) {
      return CommandPermissionLevel.Trusted;
    } else if (guildInfo.restrictedUserIds.includes(member.id)) {
      return CommandPermissionLevel.Restricted;
    } else {
      return CommandPermissionLevel.User;
    };
  };
};