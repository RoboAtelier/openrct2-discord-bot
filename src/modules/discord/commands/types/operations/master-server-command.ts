import {
  bold,
  ChatInputCommandInteraction,
  italic
} from 'discord.js';
import { EOL } from 'os';
import { Configuration } from '@modules/configuration';
import {
  CommandPermissionLevel,
  ResponseBuilder,
  SubcommandsDiscordBotCommand
} from '@modules/discord/commands';
import { 
  OpenRCT2MasterServer,
  PublicOpenRCT2ServerInfo
} from '@modules/openrct2/web';
import { getArraySectionWithDetails } from '@modules/utils/array-utils';

const MasterServerSubcommands = <const>[
  {
    name: 'here',
    description: 'Gets information about the OpenRCT2 game servers here.',
    options: null
  },
  {
    name: 'list',
    description: 'Gets the current list of all public OpenRCT2 game servers.',
    options: [{
      name: 'page',
      type: 'integer',
      description: 'The starting page of the server listing.',
      minValue: 1
    }]
  },
  {
    name: 'search',
    description: 'Searches for specific public OpenRCT2 game servers.',
    options: [
      {
        name: 'name',
        type: 'string',
        description: 'The name of the server to match.'
      },
      {
        name: 'ip',
        type: 'string',
        description: 'The IP address to match.'
      },
      {
        name: 'page',
        type: 'integer',
        description: 'The starting page of the search result listing.',
        minValue: 1
      }
    ]
  }
];

/** 
 * Represents a command for retrieving information about OpenRCT2 game servers
 * from the OpenRCT2 master server.
 */
export class MasterServerCommand extends SubcommandsDiscordBotCommand<undefined, typeof MasterServerSubcommands[number]> {
  private static readonly ipAddressKey = 'ipAddress';
  private static readonly detailMax = 7;

  private readonly hostingIPAddress: string;
  private readonly openRCT2MasterServer: OpenRCT2MasterServer;

  constructor(
    config: Configuration,
    openRCT2MasterServer: OpenRCT2MasterServer
  ) {
    super(
      'master-server',
      'Looks up OpenRCT2 game server information from the master server.',
      undefined,
      MasterServerSubcommands,
      CommandPermissionLevel.User
    );

    this.hostingIPAddress = config.getValue<string>(MasterServerCommand.ipAddressKey);
    this.openRCT2MasterServer = openRCT2MasterServer;
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction) {
    const subcommandName = this.getInteractionSubcommandName(interaction);
    const response = new ResponseBuilder();

    await interaction.deferReply();

    if (subcommandName === 'search') {
      const options = this.getInteractionSubcommandOptions(interaction, 'search');

      await this.getPublicServerInfo(
        response,
        (options.get('page')?.value as number ?? 1) - 1,
        options.get('ip')?.value as string,
        options.get('name')?.value as string
      );
    } else if (subcommandName === 'list') {
      const pageIndex = (this.getInteractionOption(interaction, 'page')?.value as number ?? 1) - 1;
      await this.getPublicServerInfo(response, pageIndex);
    } else if (subcommandName === 'here') {
      await this.getPublicServerInfo(response, 0, this.hostingIPAddress);
    };

    if (!response.hasContent) {
      interaction.deferred 
        ? await interaction.editReply(SubcommandsDiscordBotCommand.unknownCommandErrorMessage)
        : await interaction.reply(SubcommandsDiscordBotCommand.unknownCommandErrorMessage);
    };

    const messagePayload = response.resolve(interaction);
    interaction.deferred
      ? await interaction.editReply(messagePayload)
      : await interaction.reply(messagePayload);
  };

  private async getPublicServerInfo(
    response: ResponseBuilder,
    resultIndex: number,
    ipAddress?: string,
    serverName?: string
  ) {
    if (!serverName && !ipAddress) {
      const publicServers = await this.openRCT2MasterServer.requestPublicOpenRCT2ServerList();
      if (publicServers.length > 0) {
        const serverListSection = getArraySectionWithDetails(publicServers, resultIndex);
        response.addText(this.formatBasicServerInfoListMessage(serverListSection));
      } else {
        response.addErrorText('Could not find any public servers from the master server.');
      };
    } else {
      const publicServers = serverName
        ? await this.openRCT2MasterServer.getPublicOpenRCT2ServersByFuzzySearch(serverName)
        : await this.openRCT2MasterServer.requestPublicOpenRCT2ServerList();

      const requestedServers = ipAddress
        ? publicServers.filter(server => {
          return server.ip.v4[0] === ipAddress || server.ip.v6[0] === ipAddress;
        })
        : publicServers;

      if (0 === requestedServers.length) {
        response.addErrorText(this.formatNoMatchesMessage(serverName, ipAddress));
      } else {
        if (ipAddress) {
          response.addText(this.formatDetailedServerInfoListMessage(requestedServers))
        } else {
          const serverListSection = getArraySectionWithDetails(requestedServers, resultIndex);
          response.addText(this.formatBasicServerInfoListMessage(serverListSection));
        };
      };
    };
  };

  /**
   * Constructs a message of an empty search result with specified parameters.
   * @param ipAddress The ip address used to search if specified.
   * @param serverName The name used to search if specified.
   * @returns A custom formatted message for a specific feature.
   */
  private formatNoMatchesMessage(ipAddress?: string, serverName?: string) {
    const queryParameterSegments = [];

    if (ipAddress) {
      queryParameterSegments.push(`the ip address ${italic(ipAddress)}`);
    };
    if (serverName) {
      queryParameterSegments.push(`the name ${italic(serverName)}`);
    };
    
    return `No servers match ${queryParameterSegments.join(' and ')}.`;
  };

  /**
   * Constructs a message of a simplified information listing of OpenRCT2 server statuses.
   * @param serverListSection - The result set to format the message from.
   */
  private formatBasicServerInfoListMessage(
    serverListSection: {
      section: PublicOpenRCT2ServerInfo[],
      sectionIndex: number,
      totalSections: number
    }
  ) {
    const infoMsgSegments = [];

    for (const server of serverListSection.section) {
      infoMsgSegments.push(`• [${server.players}P] [${bold(server.version)}] ${server.name}`);
    };
    infoMsgSegments.push(`${EOL}Page ${italic(`${serverListSection.sectionIndex + 1}/${serverListSection.totalSections}`)}`);

    return infoMsgSegments.join(EOL);
  };

  /**
   * Constructs a message of a detailed information listing of OpenRCT2 server statuses.
   * @param serverList The result array to format the message from.
   */
  private formatDetailedServerInfoListMessage(serverList: PublicOpenRCT2ServerInfo[]) {
    const infoMsgSegments = [];

    for (const server of serverList.slice(0, MasterServerCommand.detailMax)) {
      let infoBlock = `__${server.name}__ is ${bold('UP')}!${server.requiresPassword ? ' \u{1F512}' : ''}`;
      infoBlock += `${EOL}Description: ${server.description}`;
      infoBlock += `${EOL}Server Version #: ${bold(server.version)}`;
      infoBlock += `${EOL}Players: ${server.players}/${server.maxPlayers}`;
      infoMsgSegments.push(infoBlock);
    };

    return infoMsgSegments.join(`${EOL}${EOL}`);
  };
};