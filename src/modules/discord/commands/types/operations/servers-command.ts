import {
  ChatInputCommandInteraction,
  bold,
  italic
} from 'discord.js';
import { EOL } from 'os';
import { Configuration } from '@modules/configuration';
import { 
  BotCommand,
  CommandPermissionLevel,
  CommandResponseBuilder
} from '@modules/discord/commands';
import { 
  OpenRCT2MasterServer,
  PublicOpenRCT2ServerInfo
} from '@modules/openrct2/web';
import { getArraySectionWithDetails } from '@modules/utils/array-utils';

type ServersCommandOptions = 'address' | 'name' | 'page';
type ServersCommandSubcommands = 'here' | 'list' | 'ip' | 'name';
type ServersCommandSubcommandGroups = 'by';

/** 
 * Represents a command for retrieving webinformation about OpenRCT2 game servers
 * from the OpenRCT2 master server.
 */
export class ServersCommand extends BotCommand<
  ServersCommandOptions,
  ServersCommandSubcommands,
  ServersCommandSubcommandGroups
> {
  private static readonly ipAddressKey = 'ipAddress';
  private static readonly detailMax = 7;

  private readonly hostingIPAddress: string;
  private readonly openRCT2MasterServer: OpenRCT2MasterServer;

  constructor(
    config: Configuration,
    openRCT2MasterServer: OpenRCT2MasterServer
  ) {
    super(CommandPermissionLevel.User);
    this.data
      .setName('servers')
      .setDescription('Gets OpenRCT2 game server information from the master server.')
      .addSubcommand(subcommand =>
        subcommand
          .setName(this.reflectSubcommandName('here'))
          .setDescription('Gets web information about the OpenRCT2 game servers here.')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(this.reflectSubcommandName('list'))
          .setDescription('Gets the current list of all public OpenRCT2 game servers.')
          .addIntegerOption(option => 
            option
              .setName(this.reflectOptionName('page'))
              .setDescription('The starting page of the server listing.')
              .setMinValue(1)
          )
      )
      .addSubcommandGroup(subcommandGroup =>
        subcommandGroup
          .setName(this.reflectSubcommandGroupName('by'))
          .setDescription('Search by.')
          .addSubcommand(subcommand =>
            subcommand
              .setName(this.reflectSubcommandName('ip'))
              .setDescription('Gets OpenRCT2 game server web information by IP address.')
              .addStringOption(option =>
                option
                  .setName(this.reflectOptionName('address'))
                  .setDescription('The IP address to match.')
                  .setRequired(true)
              )
          )
          .addSubcommand(subcommand =>
            subcommand
              .setName(this.reflectSubcommandName('name'))
              .setDescription('Gets OpenRCT2 game server web information by name.')
              .addStringOption(option =>
                option
                  .setName(this.reflectOptionName('name'))
                  .setDescription('The name of the server to match.')
                  .setRequired(true)
              )
              .addIntegerOption(option => 
                option
                  .setName(this.reflectOptionName('page'))
                  .setDescription('The starting page of the search result listing.')
                  .setMinValue(1)
              )
          )
      );

    this.hostingIPAddress = config.getValue<string>(ServersCommand.ipAddressKey);
    this.openRCT2MasterServer = openRCT2MasterServer;
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction) {
    let commandResponse = new CommandResponseBuilder();

    await interaction.deferReply();

    if (this.isInteractionUnderSubcommandGroup(interaction, 'by')) {
      if (this.isInteractionUsingSubcommand(interaction, 'ip')) {
        const ipAddress = this.getInteractionOption(interaction, 'address').value as string;
        commandResponse = await this.searchServerInfoByIP(ipAddress);
      } else if (this.isInteractionUsingSubcommand(interaction, 'name')) {
        const serverName = this.getInteractionOption(interaction, 'name').value as string;
        const pageIndex = this.doesInteractionHaveOption(interaction, 'page')
          ? this.getInteractionOption(interaction, 'page').value as number - 1
          : 0;
        commandResponse = await this.searchServerInfoByName(serverName, pageIndex);
      };
    } else if (this.isInteractionUsingSubcommand(interaction, 'list')) {
      const pageIndex = this.doesInteractionHaveOption(interaction, 'page')
        ? this.getInteractionOption(interaction, 'page').value as number - 1
        : 0;
      commandResponse = await this.getServerInfoList(pageIndex);
    } else if (this.isInteractionUsingSubcommand(interaction, 'here')) {
      commandResponse = await this.getThisServerInfo();
    };

    if (0 === commandResponse.resolve().length) {
      commandResponse.appendToError('Unknown or unimplemented command specified.');
    };

    if (interaction.deferred) {
      await interaction.editReply(commandResponse.resolve());
    } else {
      await interaction.reply(commandResponse.resolve());
    };
  };

  private async searchServerInfoByIP(ipAddress: string) {
    const commandResponse = new CommandResponseBuilder();
    const infoResult = await this.openRCT2MasterServer.getOpenRCT2ServerInfoByIP(ipAddress);
    if (infoResult.length > 0) {
      commandResponse.appendToMessage(this.formatDetailedInfoListMessage(infoResult));
    } else {
      commandResponse.appendToError(`No servers found with the IP address ${italic(ipAddress)}.`);
    };
    return commandResponse;
  };

  private async searchServerInfoByName(serverName: string, resultIndex: number) {
    const commandResponse = new CommandResponseBuilder();
    const infoResult = await this.openRCT2MasterServer.getOpenRCT2ServerInfoByFuzzySearch(serverName);
    if (infoResult.length > 0) {
      const infoSet = getArraySectionWithDetails(infoResult, resultIndex);
      commandResponse.appendToMessage(this.formatSimpleInfoListMessage(infoSet));
    } else {
      commandResponse.appendToError(`No servers found with the name ${italic(serverName)}.`);
    };
    return commandResponse;
  };

  private async getServerInfoList(resultIndex: number) {
    const commandResponse = new CommandResponseBuilder();
    const infoResult = await this.openRCT2MasterServer.requestOpenRCT2ServerInfoList();
    if (infoResult.length > 0) {
      const infoSet = getArraySectionWithDetails(infoResult, resultIndex);
      commandResponse.appendToMessage(this.formatSimpleInfoListMessage(infoSet));
    } else {
      commandResponse.appendToError('Could not find any public OpenRCT2 servers from the master server.');
    };
    return commandResponse;
  };

  private async getThisServerInfo() {
    const commandResponse = new CommandResponseBuilder();
    const hostServerInfos = await this.openRCT2MasterServer.getOpenRCT2ServerInfoByIP(this.hostingIPAddress);
    if (hostServerInfos.length > 0) {
      commandResponse.appendToMessage(this.formatDetailedInfoListMessage(hostServerInfos));
    } else {
      commandResponse.appendToError('Could not find our hosted servers on the master server list.');
    };
    return commandResponse;
  };

  /**
   * Constructs a message of a simplified information listing of OpenRCT2 server statuses.
   * @param infoSet - The result set to format the message from.
   */
  private formatSimpleInfoListMessage(
    infoSet: {
      section: PublicOpenRCT2ServerInfo[],
      sectionIndex: number,
      totalSections: number
    }
  ) {
    const infoMsgSegments = [];

    for (const info of infoSet.section) {
      infoMsgSegments.push(`• [${info.players}P] [${bold(info.version)}] ${info.name}`);
    };
    infoMsgSegments.push(`${EOL}Page ${italic(`${infoSet.sectionIndex + 1}/${infoSet.totalSections}`)}`);

    return infoMsgSegments.join(EOL);
  };

  /**
   * Constructs a message of a detailed information listing of OpenRCT2 server statuses.
   * @param infoArray The result array to format the message from.
   */
  private formatDetailedInfoListMessage(infoArray: PublicOpenRCT2ServerInfo[]) {
    const infoMsgSegments = [];

    for (const info of infoArray.slice(0, ServersCommand.detailMax)) {
      let infoBlock = `__${info.name}__ is ${bold('UP')}!${info.requiresPassword ? ' \u{1F512}' : ''}`;
      infoBlock += `${EOL}Description: ${info.description}`;
      infoBlock += `${EOL}Server Version #: ${bold(info.version)}`;
      infoBlock += `${EOL}Players: ${info.players}/${info.maxPlayers}`;
      infoMsgSegments.push(infoBlock);
    };

    return infoMsgSegments.join(`${EOL}${EOL}`);
  };
};