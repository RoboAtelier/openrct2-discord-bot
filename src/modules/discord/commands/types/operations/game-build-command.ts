import {
  bold,
  inlineCode,
  italic,
  ChatInputCommandInteraction
} from 'discord.js';
import {
  platform,
  EOL
} from 'os';
import { 
  BotCommand,
  CommandPermissionLevel,
  CommandResponseBuilder
} from '@modules/discord/commands';
import { Logger } from '@modules/logging';
import {
  OpenRCT2Build,
  OpenRCT2LinuxDistro,
  OpenRCT2Platform,
  OpenRCT2PlatformInfo
} from '@modules/openrct2/data/models';
import { OpenRCT2BuildDownloader } from '@modules/openrct2/web';
import { OpenRCT2BuildRepository } from '@modules/openrct2/data/repositories';
import { wait } from '@modules/utils/runtime-utils';

type GameBuildCommandOptions =
  | 'version' | 'commit'
  | 'os' | 'codename' | 'architecture'
  | 'index'
type GameBuildCommandSubcommands =
  | 'check'
  | 'download'
  | 'list'

const OperatingSystemChoices = [
  { name: 'Windows', value: 'win32' },
  { name: 'MacOS', value: 'darwin' },
  { name: 'Ubuntu/Debian', value: 'linux/ubuntu' }
];

/** Represents a command for downloading, installing, and managing OpenRCT2 builds. */
export class GameBuildCommand extends BotCommand<
  GameBuildCommandOptions,
  GameBuildCommandSubcommands,
  null
> {
  private readonly logger;
  private readonly gameBuildRepo;
  private readonly openRCT2BuildDownloader;

  constructor(
    logger: Logger,
    gameBuildRepo: OpenRCT2BuildRepository,
    openRCT2BuildDownloader: OpenRCT2BuildDownloader
  ) {
    super(CommandPermissionLevel.Moderator);
    this.data
      .setName('game-build')
      .setDescription('Manages OpenRCT2 builds.')
      .addSubcommand(subcommand =>
        subcommand
          .setName(this.reflectSubcommandName('check'))
          .setDescription('Checks for available downloads for an OpenRCT2 build.')
          .addStringOption(option =>
            option
              .setName(this.reflectOptionName('version'))
              .setDescription('The build version number. Format is v#.#.#')
              .setMinLength(5)
          )
          .addStringOption(option =>
            option
              .setName(this.reflectOptionName('commit'))
              .setDescription('The commit header for a develop build.')
              .setMinLength(7)
              .setMaxLength(7)
          )
          .addIntegerOption(option =>
            option
              .setName(this.reflectOptionName('index'))
              .setDescription('The index ordinal of the latest develop builds.')
              .setMinValue(1)
              .setMaxValue(30)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(this.reflectSubcommandName('download'))
          .setDescription('Downloads a game build.')
          .addStringOption(option =>
            option
              .setName(this.reflectOptionName('version'))
              .setDescription('The build version number. Format is v#.#.#')
              .setMinLength(5)
              .setRequired(true)
          )
          .addStringOption(option =>
            option
              .setName(this.reflectOptionName('commit'))
              .setDescription('The commit header for a develop build.')
              .setMinLength(7)
              .setMaxLength(7)
          )
          .addStringOption(option => 
            option
              .setName(this.reflectOptionName('os'))
              .setDescription('The target operating system to download for.')
              .setChoices(...OperatingSystemChoices)
          )
          .addStringOption(option =>
            option
              .setName(this.reflectOptionName('codename'))
              .setDescription('The version codename for a related Linux operating system.')
          )
          .addStringOption(option =>
            option
              .setName(this.reflectOptionName('architecture'))
              .setDescription('The target operating system CPU architecture.'))
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(this.reflectSubcommandName('list'))
          .setDescription('Gets the current installed OpenRCT2 build.')
      );

    this.logger = logger;
    this.gameBuildRepo = gameBuildRepo;
    this.openRCT2BuildDownloader = openRCT2BuildDownloader;
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction) {
    let commandResponse = new CommandResponseBuilder();

    await interaction.deferReply();

    if (this.isInteractionUsingSubcommand(interaction, 'check')) {
      let baseVersion = this.doesInteractionHaveOption(interaction, 'version')
        ? this.getInteractionOption(interaction, 'version').value as string
        : undefined;
      if (baseVersion && !baseVersion.startsWith('v')) {
        baseVersion = `v${baseVersion}`;
      };
      const commitHeader = this.doesInteractionHaveOption(interaction, 'commit')
        ? this.getInteractionOption(interaction, 'commit').value as string
        : undefined;
      const buildIndex = this.doesInteractionHaveOption(interaction, 'index')
        ? this.getInteractionOption(interaction, 'index').value as number
        : 1;

      commandResponse = await this.requestOpenRCT2BuildInfo(buildIndex, baseVersion, commitHeader);
    } else if (this.isInteractionUsingSubcommand(interaction, 'download')) {
      let baseVersion = this.getInteractionOption(interaction, 'version').value as string;
      if (baseVersion && !baseVersion.startsWith('v')) {
        baseVersion = `v${baseVersion}`;
      };
      const commitHeader = this.doesInteractionHaveOption(interaction, 'commit')
        ? this.getInteractionOption(interaction, 'commit').value as string
        : undefined;
      let distro;
      let operatingSystem = this.doesInteractionHaveOption(interaction, 'os')
        ? this.getInteractionOption(interaction, 'os').value as string
        : platform();
      if (operatingSystem && operatingSystem.startsWith('linux')) {
        distro = operatingSystem.substring(operatingSystem.indexOf('/') + 1) as OpenRCT2LinuxDistro;
        operatingSystem = 'linux';
      };
      let architecture = this.doesInteractionHaveOption(interaction, 'architecture')
        ? this.getInteractionOption(interaction, 'architecture').value as string
        : undefined;
      const codename = this.doesInteractionHaveOption(interaction, 'codename')
        ? this.getInteractionOption(interaction, 'codename').value as string
        : undefined;

      const platformInfo = new OpenRCT2PlatformInfo(
        operatingSystem as OpenRCT2Platform,
        architecture,
        undefined,
        distro,
        codename
      );
      commandResponse = await this.downloadOpenRCT2Build(
        interaction,
        platformInfo,
        baseVersion,
        commitHeader
      );
    } else if (this.isInteractionUsingSubcommand(interaction, 'list')) {
      commandResponse = await this.getGameBuildVersionList();
    };

    if (0 === commandResponse.resolve().length) {
      commandResponse.appendToError('Unknown or unimplemented command specified.');
    };

    interaction.deferred 
      ? await interaction.editReply(commandResponse.resolve())
      : await interaction.reply(commandResponse.resolve());
  };

  private async requestOpenRCT2BuildInfo(
    buildIndex: number,
    baseVersion?: string,
    commitHeader?: string
  ) {
    const commandResponse = new CommandResponseBuilder();

    try {
      const gameBuild = baseVersion
        ? await this.openRCT2BuildDownloader.checkGameBuild(baseVersion, commitHeader)
        : await this.openRCT2BuildDownloader.checkDevelopGameBuildByIndex(buildIndex);

      commandResponse.appendToMessage(`${italic(gameBuild.version)}`, '');
      for (const platformTarget of gameBuild.platformTargets) {
        commandResponse.appendToMessage(bold(platformTarget.name));
        for (const type of platformTarget.types) {
          commandResponse.appendToMessage(type);
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
      commandResponse.appendToError(errMsg);
    };

    return commandResponse;
  };

  private async downloadOpenRCT2Build(
    interaction: ChatInputCommandInteraction,
    platform: OpenRCT2PlatformInfo,
    baseVersion: string,
    commitHeader?: string
  ) {
    const commandResponse = new CommandResponseBuilder();

    try {
      const downloadInfo = await this.openRCT2BuildDownloader.getOpenRCT2BuildDownloadInfo(
        platform,
        baseVersion,
        commitHeader
      );
      const writeStream = this.gameBuildRepo.createOpenRCT2BuildWriteStream(downloadInfo.fileName);

      let ticked = false;
      await this.openRCT2BuildDownloader.downloadOpenRCT2Build(
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
      await this.gameBuildRepo.extracOpenRCT2Build(downloadInfo.fileName, downloadInfo.sha256Checksum);

      commandResponse.appendToMessage(`Successfully downloaded and unpacked ${inlineCode(downloadInfo.fileName)}.`);
    } catch (err) {
      const versionHeader = `${baseVersion}${commitHeader ? `-${commitHeader}` : ''}`;
      const errMsg = `Failed to download and install build version ${inlineCode(versionHeader)}.`;
      await this.logger.writeError(errMsg);
      await this.logger.writeError(err as Error);
      commandResponse.appendToError(errMsg);
    };

    return commandResponse;
  };

  private async getGameBuildVersionList() {
    const commandResponse = new CommandResponseBuilder();

    try {
      const gameBuilds = await this.gameBuildRepo.getAvailableOpenRCT2Builds();
      commandResponse.appendToMessage(this.formatGameBuildVersionListMessage(gameBuilds));
    } catch (err) {
      const errMsg = 'Failed to return current list of downloaded game builds.';
      await this.logger.writeError(errMsg);
      await this.logger.writeError(err as Error);
      commandResponse.appendToError(errMsg);
    };

    return commandResponse;
  };

  private formatGameBuildVersionListMessage(gameBuilds: OpenRCT2Build[]) {
    const msgSegments = [];

    for (const gameBuild of gameBuilds) {
      let versionSegment = `▸ ${bold(gameBuild.name)}`;
      msgSegments.push(versionSegment);
    };

    return msgSegments.join(EOL);
  };
};