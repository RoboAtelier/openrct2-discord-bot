import {
  bold,
  ChatInputCommandInteraction,
  inlineCode,
  italic
} from 'discord.js';
import {
  platform,
  EOL
} from 'os';
import {
  CommandPermissionLevel,
  ResponseBuilder,
  SubcommandsDiscordBotCommand
} from '@modules/discord/commands';
import { Logger } from '@modules/logging';
import {
  BuildDirectory,
  OpenRCT2LinuxDistro,
  OpenRCT2Platform,
  OpenRCT2PlatformInfo
} from '@modules/openrct2/data/models';
import { BuildDownloadService } from '@modules/openrct2/services';
import { BuildRepository } from '@modules/openrct2/data/repositories';
import { wait } from '@modules/utils/runtime-utils';

const OperatingSystemChoices = [
  { name: 'Windows', value: 'win32' },
  { name: 'MacOS', value: 'darwin' },
  { name: 'Ubuntu/Debian', value: 'linux/ubuntu' }
];

const GameBuildSubcommands = <const>[
  {
    name: 'check',
    description: 'Checks for available downloads for an OpenRCT2 build.',
    options: [
      {
        name: 'version',
        type: 'string',
        description: 'The build version number. Format is v#.#.#',
        minLength: 5
      },
      {
        name: 'commit',
        type: 'string',
        description: 'The commit header for a develop build.',
        minLength: 7,
        maxLength: 7
      },
      {
        name: 'index',
        type: 'integer',
        description: 'The index ordinal of the latest develop builds.',
        minValue: 1,
        maxValue: 30
      }
    ]
  },
  {
    name: 'download',
    description: 'Downloads a game build.',
    options: [
      {
        name: 'version',
        type: 'string',
        description: 'The build version number. Format is v#.#.#',
        required: true,
        minLength: 5
      },
      {
        name: 'commit',
        type: 'string',
        description: 'The commit header for a develop build.',
        minLength: 7,
        maxLength: 7
      },
      {
        name: 'os',
        type: 'string',
        description: 'The target operating system to download for.',
        choices: OperatingSystemChoices
      },
      {
        name: 'codename',
        type: 'string',
        description: 'The version codename for a related Linux operating system.'
      },
      {
        name: 'architecture',
        type: 'string',
        description: 'The target operating system CPU architecture.'
      }
    ]
  },
  {
    name: 'list',
    description: 'Gets the current list of downloaded OpenRCT2 builds.',
    options: null
  },
];
  
/** Represents a command for downloading, installing, and managing OpenRCT2 builds. */
export class GameBuildCommand extends SubcommandsDiscordBotCommand<
  undefined,
  typeof GameBuildSubcommands[number]
> {
  private readonly logger: Logger;
  private readonly buildRepo: BuildRepository;
  private readonly buildDownloadService: BuildDownloadService;

  constructor(
    logger: Logger,
    buildRepo: BuildRepository,
    buildDownloadService: BuildDownloadService
  ) {
    super(
      'game-build',
      'Manages OpenRCT2 builds.',
      undefined,
      GameBuildSubcommands,
      CommandPermissionLevel.Moderator
    );

    this.logger = logger;
    this.buildRepo = buildRepo;
    this.buildDownloadService = buildDownloadService;
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction) {
    const subcommandName = this.getInteractionSubcommandName(interaction);
    const response = new ResponseBuilder();

    await interaction.deferReply();

    if (subcommandName === 'check') {
      const options = this.getInteractionSubcommandOptions(interaction, 'check');
      let baseVersion = options.get('version')?.value as string;
      if (baseVersion && !baseVersion.startsWith('v')) {
        baseVersion = `v${baseVersion}`;
      };

      await this.requestBuildInfo(
        response,
        options.get('index')?.value as number ?? 1,
        baseVersion,
        options.get('commit')?.value as string
      );
    } else if (subcommandName === 'download') {
      const options = this.getInteractionSubcommandOptions(interaction, 'download');
      let baseVersion = options.get('version')?.value as string;
      if (baseVersion && !baseVersion.startsWith('v')) {
        baseVersion = `v${baseVersion}`;
      };

      let distro;
      let operatingSystem = options.get('os')?.value as string ?? platform();
      if (operatingSystem && operatingSystem.startsWith('linux')) {
        distro = operatingSystem.substring(operatingSystem.indexOf('/') + 1) as OpenRCT2LinuxDistro;
        operatingSystem = 'linux';
      };

      const platformInfo = new OpenRCT2PlatformInfo(
        operatingSystem as OpenRCT2Platform,
        options.get('architecture')?.value as string,
        undefined,
        distro,
        options.get('codename')?.value as string
      );
      await this.downloadOpenRCT2Build(
        response,
        interaction,
        platformInfo,
        baseVersion,
        options.get('commit')?.value as string
      );
    } else if (subcommandName === 'list') {
      await this.getGameBuildVersionList(response);
    }

    if (!response.hasContent) {
      interaction.deferred 
        ? await interaction.editReply(SubcommandsDiscordBotCommand.unknownCommandErrorMessage)
        : await interaction.reply(SubcommandsDiscordBotCommand.unknownCommandErrorMessage);
      return;
    };

    const messagePayload = response.resolve(interaction);
    interaction.deferred 
      ? await interaction.editReply(messagePayload)
      : await interaction.reply(messagePayload);
  };

  private async requestBuildInfo(
    response: ResponseBuilder,
    buildIndex: number,
    baseVersion?: string,
    commitHeader?: string
  ) {
    try {
      const gameBuild = baseVersion
        ? await this.buildDownloadService.queryBuild(baseVersion, commitHeader)
        : await this.buildDownloadService.queryDevelopBuildByIndex(buildIndex);

      if (gameBuild) {
        response.addText(`${italic(gameBuild.version)}`, '');
        for (const assetName of gameBuild.assetNames) {
          response.addText(bold(assetName));
        };
      };

    } catch (err) {
      let errMsg = 'Failed to get development build information.';
      if (baseVersion) {
        const version = `${baseVersion}${commitHeader ? `-${commitHeader}` : ''}`;
        errMsg = `Failed to get build information for version ${inlineCode(version)}.`;
      };
      await this.logger.writeError(errMsg);
      await this.logger.writeError(err as Error);
      response.addErrorText(errMsg);
    };
  };

  private async downloadOpenRCT2Build(
    response: ResponseBuilder,
    interaction: ChatInputCommandInteraction,
    platform: OpenRCT2PlatformInfo,
    baseVersion: string,
    commitHeader?: string
  ) {
    try {
      const downloadInfo = await this.buildDownloadService.getBuildInfo(
        platform,
        baseVersion,
        commitHeader
      );
      if (downloadInfo) {
        const writeStream = this.buildRepo.createBuildWriteStream(downloadInfo.fileName);

        let ticked = false;
        await this.buildDownloadService.downloadBuild(
          downloadInfo.downloadUrl,
          writeStream,
          async (percentage: string) => {
            if (!ticked) {
              ticked = true;
              await interaction.editReply(`Downloading ${inlineCode(downloadInfo.fileName)}: ${percentage} complete`);
              await wait(3, 's');
              ticked = false;
            };
          }
        );
  
        await interaction.editReply(`Unpacking ${inlineCode(downloadInfo.fileName)}...`);
        await this.buildRepo.extractBuild(downloadInfo.fileName);
  
        response.addText(`Successfully downloaded and unpacked ${inlineCode(downloadInfo.fileName)}.`);
      } else {
        response.addErrorText('Failed to retrieve a build with the specified parameters.');
      };
    } catch (err) {
      const versionHeader = `${baseVersion}${commitHeader ? `-${commitHeader}` : ''}`;
      const errMsg = `Failed to download and install build version ${inlineCode(versionHeader)}.`;
      await this.logger.writeError(errMsg);
      await this.logger.writeError(err as Error);
      response.addErrorText(errMsg);
    };
  };

  private async getGameBuildVersionList(response: ResponseBuilder) {
    try {
      const gameBuilds = await this.buildRepo.getAvailableBuilds();
      response.addText(this.formatGameBuildVersionListMessage(gameBuilds));
    } catch (err) {
      const errMsg = 'Failed to return current list of downloaded game builds.';
      await this.logger.writeError(errMsg);
      await this.logger.writeError(err as Error);
      response.addErrorText(errMsg);
    };
  };

  private formatGameBuildVersionListMessage(gameBuilds: BuildDirectory[]) {
    const msgSegments = [];

    for (const gameBuild of gameBuilds) {
      let versionSegment = `▸ ${bold(gameBuild.name)}`;
      msgSegments.push(versionSegment);
    };

    return msgSegments.join(EOL);
  };
};