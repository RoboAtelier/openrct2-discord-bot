import {
  bold,
  inlineCode,
  italic,
  strikethrough,
  underscore,
  userMention,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CacheType,
  ChatInputCommandInteraction,
  Colors,
  ComponentType,
  EmbedBuilder,
  InteractionCollector,
  MessagePayload,
  Message,
  User
} from 'discord.js';
import { EOL } from 'os';
import { 
  BotCommand,
  CommandPermissionLevel,
  CommandResponseBuilder
} from '@modules/discord/commands';
import { BotDataRepository } from '@modules/discord/data/repositories';
import { OpenRCT2ServerController } from '@modules/openrct2/controllers';
import {
  ScenarioMetadata,
} from '@modules/openrct2/data/models';
import { 
  ScenarioRepository,
  ServerHostRepository
} from '@modules/openrct2/data/repositories';
import { fisherYatesShuffle } from '@modules/utils/array-utils';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils';

type VoteCommandOptions =
  | 'id' // stop
  | 'server-id' | 'list-limit' | 'time' // scenario
type VoteCommandSubcommands =
  | 'scenario-random' // start
  | 'stop'
  | 'end'
type VoteCommandSubcommandGroups =
  | 'start'

class VoteSession<T> {
  private readonly votes = new Map<string, number>();
  private readonly voteCounter = new Map<number, number>();

  private candidatePool: T[] = [];
  private currentCandidates: T[] = [];
  private candidatePoolRefresher: () => Promise<T[]>;

  /** Gets the Discord command interaction that started the vote session. */
  readonly interaction: ChatInputCommandInteraction;

  /** Gets or sets the button interaction collector that collects votes via buttons. */
  interactionCollector: 
    | InteractionCollector<ButtonInteraction<CacheType>>
    | InteractionCollector<ButtonInteraction<'cached'>>
    | null
    = null;

  /** Gets or sets a value specifying if this vote session is active. */
  active = true;

  /** Gets or sets a value specifying if this vote session can be cancelled or ended early. */
  stoppable = false;

  /** Gets or sets the maximum number of candidates listed for voting. */
  candidateCount: number;

  /** Gets or sets the maximum duration the vote session will run for in minutes. */
  duration: number;

  /** Gets or sets the Discord user that cancelled the vote. */
  cancelledBy: User | null = null;

  /** Gets or sets the Discord user that ended the vote early. */
  endedBy: User | null = null;

  constructor(
    interaction: ChatInputCommandInteraction,
    candidateCount: number,
    duration: number,
    candidatePoolRefresher: () => Promise<T[]>
  ) {
    this.interaction = interaction;
    this.candidateCount = candidateCount;
    this.duration = duration;
    this.candidatePoolRefresher = candidatePoolRefresher;
  };

  /**
   * Sets up a new voting round for the session.
   * The session must call this method when starting a new voting round.
   * @async
   */
  async setupNewVoteRound() {
    if (this.candidatePool.length < 3) {
      this.candidatePool = await this.candidatePoolRefresher();
    };

    this.currentCandidates = this.candidatePool.splice(0, this.candidateCount);
    this.votes.clear();
    this.voteCounter.clear();
    for (let i = -1; i < this.candidateCount; ++i) { // -1 for pass
      this.voteCounter.set(i, 0);
    };
  };

  /** 
   * Gets the current candidates up for voting.
   */
  getCurrentCandidates() {
    return this.currentCandidates;
  };

  /** 
   * Gets the current votes for a particular candidate by index.
   */
  getVoteCountForCandidate(candidateIndex: number) {
    const voteCount = this.voteCounter.get(candidateIndex);
    if (undefined === voteCount) {
      throw new Error('Specified candidate is not present in the voting list.');
    };
    return voteCount;
  };

  /**
   * Gets the current vote result with the winning candidates
   * and their highest vote count.
   * @param excludedIndexes Candidate index exclusions to not count in the vote.
   */
  getVoteResult(...excludedIndexes: number[]) {
    for (const exclusion of excludedIndexes) {
      if (exclusion < 0) {
        throw new Error('Invalid exclusion specified.');
      };
    };

    let winningIndexes: number[] = [];
    let highestVotes = 0;

    for (const [candidateIndex, voteCount] of this.voteCounter.entries()) {
      if (candidateIndex > -1 && !excludedIndexes.includes(candidateIndex)) {
        if (voteCount > highestVotes) {
          highestVotes = voteCount;
          winningIndexes = [candidateIndex];
        } else if (voteCount === highestVotes) {
          winningIndexes.push(candidateIndex);
        };
      };
    };

    const passVotes = this.voteCounter.get(-1)!;
    return {
      winningCandidates: winningIndexes.map(index => this.currentCandidates[index]),
      highestVoteCount: highestVotes,
      isPass: passVotes >= highestVotes && passVotes > 0
    };
  };
  
  /**
   * Records a user's vote. If the user has already voted,
   * the previous vote will be overwritten.
   * @param userId 
   * @param candidateIndex 
   */
  recordUserVote(userId: string, candidateIndex: number) {
    const currentSelection = this.votes.get(userId);
    if (currentSelection !== undefined) {
      const voteCount = this.voteCounter.get(currentSelection)!;
      this.voteCounter.set(currentSelection, voteCount - 1);
    };

    this.votes.set(userId, candidateIndex);
    const voteCount = this.voteCounter.get(candidateIndex)!;
    this.voteCounter.set(candidateIndex, voteCount + 1);
  };
};

/** Represents a command for interacting with OpenRCT2 game servers. */
export class VoteCommand extends BotCommand<
  VoteCommandOptions,
  VoteCommandSubcommands,
  VoteCommandSubcommandGroups
> {
  private readonly botDataRepo: BotDataRepository;
  private readonly scenarioRepo: ScenarioRepository;
  private readonly serverHostRepo: ServerHostRepository;
  private readonly openRCT2ServerController: OpenRCT2ServerController;
  private readonly activeVotes = new Map<number, VoteSession<unknown>>();

  constructor(
    botDataRepo: BotDataRepository,
    scenarioRepo: ScenarioRepository,
    serverHostRepo: ServerHostRepository,
    openRCT2ServerController: OpenRCT2ServerController
  ) {
    super(CommandPermissionLevel.Trusted);
    this.data
      .setName('vote')
      .setDescription('Starts a vote.')
      .addSubcommand(subcommand =>
        subcommand
          .setName(this.reflectSubcommandName('stop'))
          .setDescription('Stops and cancels an active vote.')
          .addIntegerOption(option =>
            option
              .setName(this.reflectOptionName('id'))
              .setDescription('The id number of the vote session to stop.')
              .setMinValue(0)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(this.reflectSubcommandName('end'))
          .setDescription('Finishes an active vote early and gets its results.')
          .addIntegerOption(option =>
            option
              .setName(this.reflectOptionName('id'))
              .setDescription('The id number of the vote session to end.')
              .setMinValue(0)
          )
      )
      .addSubcommandGroup(subcommandGroup =>
        subcommandGroup
          .setName(this.reflectSubcommandGroupName('start'))
          .setDescription('Starts a new server vote.')
          .addSubcommand(subcommand =>
            subcommand
              .setName(this.reflectSubcommandName('scenario-random'))
              .setDescription('Starts a vote on a random list of scenarios to pick from to enqueue on an OpenRCT2 server.')
              .addIntegerOption(option =>
                option
                  .setName(this.reflectOptionName('server-id'))
                  .setDescription('The id number of the server to host a vote for. Also serves as the vote session id.')
                  .setMinValue(1)
              )
              .addIntegerOption(option =>
                option
                  .setName(this.reflectOptionName('list-limit'))
                  .setDescription('The maximum number of scenarios displayed to vote on (min 3, max 10).')
                  .setMinValue(3)
                  .setMaxValue(10)
              )
              .addIntegerOption(option =>
                option
                  .setName(this.reflectOptionName('time'))
                  .setDescription('The maximum amount of time in minutes to allow for voting (max 60).')
                  .setMinValue(1)
                  .setMaxValue(60)
              )
          )
      );
    
    this.botDataRepo = botDataRepo;
    this.scenarioRepo = scenarioRepo;
    this.serverHostRepo = serverHostRepo;
    this.openRCT2ServerController = openRCT2ServerController;
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction, userLevel: CommandPermissionLevel) {
    let commandResponse = new CommandResponseBuilder();

    await interaction.deferReply();
    const guildInfo = await this.botDataRepo.getGuildInfo();
    if (isStringNullOrWhiteSpace(guildInfo.scenarioChannelId)) {
      await interaction.reply(`Assign the ${italic('Vote Channel')} with the ${inlineCode('/channel')} command first.`);
      return;
    };

    if (this.isInteractionUsingSubcommand(interaction, 'stop')) {
      if (userLevel > CommandPermissionLevel.Trusted) {
        const voteId = this.doesInteractionHaveOption(interaction, 'id')
          ? this.getInteractionOption(interaction, 'id').value as number
          : 1;
        commandResponse = await this.stopActiveVote(voteId, interaction.user);
      } else {
        commandResponse.appendToError(this.formatSubcommandPermissionError(null, 'stop'));
      };
    } else if (this.isInteractionUnderSubcommandGroup(interaction, 'start')) {
      if (this.isInteractionUsingSubcommand(interaction, 'scenario-random')) {
        const serverId = this.doesInteractionHaveOption(interaction, 'server-id')
          ? this.getInteractionOption(interaction, 'server-id').value as number
          : 1;
        const candidateCount = this.doesInteractionHaveOption(interaction, 'list-limit')
          ? this.getInteractionOption(interaction, 'list-limit').value as number
          : 10;
        const voteDuration = this.doesInteractionHaveOption(interaction, 'time')
          ? this.getInteractionOption(interaction, 'time').value as number
          : 2;
          
        if (serverId !== 1 && userLevel < CommandPermissionLevel.Moderator) {
          commandResponse.appendToError(`You can only interact with ${underscore(italic(`Server 1`))}.`)
        } else if (this.activeVotes.has(serverId)) {
          commandResponse.appendToError(`A vote is currently active for ${underscore(italic(`Server ${serverId}`))}.`);
        } else {
          const voteSession = new VoteSession(
            interaction,
            candidateCount,
            voteDuration,
            async () => {
              const metadata = await this.scenarioRepo.getScenarioMetadata();
              const activeMetadata = metadata.filter(scenarioData => scenarioData.active);
              return fisherYatesShuffle(activeMetadata);
            }
          );
          commandResponse = await this.startScenarioVote(
            interaction,
            serverId,
            voteSession
          );
        };
      };
    };

    if (0 === commandResponse.resolve().length) {
      commandResponse.appendToError('Unknown or unimplemented command specified.');
    };
    
    await interaction.reply(commandResponse.resolve());
  };

  private async startScenarioVote(
    interaction: ChatInputCommandInteraction,
    serverId: number,
    voteSession: VoteSession<ScenarioMetadata>
  ) {
    const commandResponse = new CommandResponseBuilder();
    const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
    const queue = await serverDir.getQueue();

    if (queue.scenarioQueueSize < 1 || queue.scenarioQueue.length < queue.scenarioQueueSize) {
      this.activeVotes.set(serverId, voteSession);

      await voteSession.setupNewVoteRound();

      const payload = new MessagePayload(
        interaction,
        this.formatScenarioVoteEmbed(serverId, voteSession)
      );
      const voteMessage = await this.postVoteSession(interaction, payload);
  
      if (voteMessage) {
        const voteCollector = voteMessage.createMessageComponentCollector<ComponentType.Button>(
          { time: voteSession.duration * 60000 }
        );
        voteSession.stoppable = true;
        voteSession.interactionCollector = voteCollector;
  
        voteCollector.on('collect', async buttonInteraction => {
          await this.scenarioVoteCollectorCollect(
            buttonInteraction,
            serverId,
            voteSession
          );
        });
        voteCollector.on('end', async (collection, reason) => {
          await this.scenarioVoteCollectorEnd(
            reason,
            serverId,
            voteSession,
            voteMessage
          );
        });

        commandResponse.appendToMessage(`Started a new scenario vote for ${underscore(italic(`Server ${serverId}`))}. ${voteMessage.url}`);
      } else {
        commandResponse.appendToError('Failed to start a vote. Could not post the vote.');
        this.activeVotes.delete(serverId);
      };
    } else {
      commandResponse.appendToError(
        `There are too many scenarios queued up for ${underscore(italic(`Server ${serverId}`))}.`,
        'Play the scenarios in the queue first or clear some out.'
      );
    };

    return commandResponse;
  };

  private async stopActiveVote(voteId: number, canceller: User) {
    const commandResponse = new CommandResponseBuilder();

    const voteSession = this.activeVotes.get(voteId);
    const voteName = 0 === voteId ? 'current custom vote' : `scenario vote for ${underscore(italic(`Server ${voteId}`))}`;
    if (voteSession) {
      
      if (voteSession.stoppable && voteSession.interactionCollector) {
        voteSession.cancelledBy = canceller;
        voteSession.interactionCollector.stop('cancel');
        commandResponse.appendToMessage(`Stopping the ${voteName}.`);
      } else {
        commandResponse.appendToError(`Cannot stop the ${voteName}.`);
      };
    } else {
      commandResponse.appendToError(`There is no ${voteName} active.`);
    };

    return commandResponse;
  };

  private async endActiveServerVote(voteId: number, ender: User) {
    const commandResponse = new CommandResponseBuilder();

    const voteSession = this.activeVotes.get(voteId);
    const voteName = 0 === voteId ? 'current custom vote' : `scenario vote for ${underscore(italic(`Server ${voteId}`))}`;
    if (voteSession) {
      if (voteSession.stoppable && voteSession.interactionCollector) {
        voteSession.endedBy = ender;
        voteSession.interactionCollector.stop('finish');
        commandResponse.appendToMessage(`Wrapping up the ${voteName}.`);
      } else {
        commandResponse.appendToError(`Cannot end the ${voteName}.`);
      };
    } else {
      commandResponse.appendToError(`There is no ${voteName} active.`);
    };

    return commandResponse;
  };

  private async scenarioVoteCollectorCollect(
    buttonInteraction: ButtonInteraction,
    serverId: number,
    voteSession: VoteSession<ScenarioMetadata>
  ) {
    voteSession.recordUserVote(buttonInteraction.user.id, parseInt(buttonInteraction.customId));
    try {
      await buttonInteraction.update(this.formatScenarioVoteEmbed(
        serverId,
        voteSession
      ));
    } catch {
      this.activeVotes.delete(serverId);
      // logging
    };
  };

  private async scenarioVoteCollectorEnd(
    reason: string,
    serverId: number,
    voteSession: VoteSession<ScenarioMetadata>,
    voteMessage: Message<boolean>
  ) {
    voteSession.stoppable = false;

    try {
      if ('cancel' === reason) {
        await voteMessage.edit(this.formatCancelledScenarioVoteEmbed(serverId, voteSession));
        let cancelMessage = `The vote was cancelled by ${userMention(voteSession.cancelledBy!.id)}.`;
        await voteMessage.reply(cancelMessage);
      } else {
        const voteResult = voteSession.getVoteResult();
        
        if (voteResult.isPass && 'finish' !== reason) {
          await this.passScenarioVoteToNextRound(
            serverId,
            voteSession,
            voteMessage
          );
        } else {
          voteSession.active = false;
          await voteMessage.edit(this.formatScenarioVoteEmbed(serverId, voteSession));

          if (0 === voteResult.highestVoteCount) {
            await voteMessage.reply(`No votes were placed for ${underscore(italic(`Server ${serverId}`))}. No changes have been made.`);
          } else {
            const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
            const queue = await serverDir.getQueue();

            const winningCandidate = voteResult.winningCandidates.length > 1
              ? fisherYatesShuffle(voteResult.winningCandidates)[0]
              : voteResult.winningCandidates[0];
            const resultMessageBody = this.formatCompletedVoteMessage(
              winningCandidate.fileName,
              voteResult.winningCandidates,
              voteResult.highestVoteCount
            );
            await voteMessage.reply(resultMessageBody);

            if (queue.scenarioQueueSize < 1) {
              const scenarioFile = (await this.scenarioRepo.getScenarioByName(winningCandidate.fileName))!;
              this.openRCT2ServerController.startGameServerOnScenarioDeferred(serverId, scenarioFile);
            } else if (queue.scenarioQueue.length < queue.scenarioQueueSize) {
              queue.scenarioQueue.push(winningCandidate.fileName);
              await serverDir.updateQueue(queue);
            };
          };
          
          this.activeVotes.delete(serverId);
        };
      };
    } catch (err) {
      this.activeVotes.delete(serverId);
      // logging
    };
  };

  private async passScenarioVoteToNextRound(
    serverId: number,
    voteSession: VoteSession<ScenarioMetadata>,
    voteMessage: Message<boolean>
  ) {
    try {
      await voteSession.setupNewVoteRound();
      await voteMessage.edit(this.formatScenarioVoteEmbed(serverId, voteSession));
      const voteCollector = voteMessage.createMessageComponentCollector<ComponentType.Button>(
        { time: voteSession.duration * 60000 }
      );
      voteSession.stoppable = true;
      voteSession.interactionCollector = voteCollector;
      this.activeVotes.set(serverId, voteSession);
  
      voteCollector.on('collect', async buttonInteraction => {
        await this.scenarioVoteCollectorCollect(
          buttonInteraction,
          serverId,
          voteSession
        );
      });
      voteCollector.on('end', async (collection, reason) => {
        await this.scenarioVoteCollectorEnd(
          reason,
          serverId,
          voteSession,
          voteMessage
        );
      });
    } catch (err) {
      this.activeVotes.delete(serverId);
      // logging
    };
  };

  /**
   * Constructs a voting poll message with information
   * from the current scenario vote session for a particular server.
   * @param serverId The id of the server hosting the vote.
   * @param scenarioVoteSession The vote session details.
   * @returns A custom formatted embed object for a specific feature.
   */
  private formatScenarioVoteEmbed(serverId: number, scenarioVoteSession: VoteSession<ScenarioMetadata>) {
    const embedBuilder = new EmbedBuilder();
    const buttonRows = [];
    const voteEmbedDescSegments = [
      scenarioVoteSession.active
        ? `Vote for a scenario to start on this server!${EOL}`
        : `${bold('FINISHED')}${EOL}`
    ];

    for (const [index, scenarioData] of scenarioVoteSession.getCurrentCandidates().entries()) {
      let dataSegment = `▸ ${index + 1}.) ${
        bold(`[${scenarioVoteSession.getVoteCountForCandidate(index)}]`)
      } ${italic(scenarioData.fileName)} | Played ${scenarioData.plays} ${scenarioData.plays === 1 ? 'time' : 'times'}`;
      if (scenarioData.tags.length > 0) {
        dataSegment += ` | ${underscore('Tags')}: ${scenarioData.tags.join(' ')}`;
      };
      voteEmbedDescSegments.push(dataSegment);

      if (0 === index % 5) {
        buttonRows.push(new ActionRowBuilder<ButtonBuilder>());
      };
      buttonRows[buttonRows.length - 1].addComponents(
        new ButtonBuilder()
          .setCustomId(`${index}`)
          .setLabel(`${index + 1}`)
          .setStyle(ButtonStyle.Primary)
      );
    };

    const passRow = new ActionRowBuilder<ButtonBuilder>()
      .setComponents(
        new ButtonBuilder()
          .setCustomId('-1')
          .setLabel('Pass')
          .setStyle(ButtonStyle.Secondary)
      )
    buttonRows.push(passRow);
    voteEmbedDescSegments.push(
      `${EOL}${italic('Pass')} ${
        bold(`[${scenarioVoteSession.getVoteCountForCandidate(-1)}]`)
      }`
    );

    embedBuilder
      .setColor(scenarioVoteSession.active ? Colors.Green : Colors.Grey)
      .setTitle(`${underscore(italic(`Server ${serverId}`))} - Scenario Vote`)
      .setDescription(voteEmbedDescSegments.join(EOL))
      .setAuthor(
        { 
          name: scenarioVoteSession.interaction.user.tag,
          iconURL: scenarioVoteSession.interaction.user.displayAvatarURL()
        }
      )
      .setFooter({ text: `Duration: ${scenarioVoteSession.duration} ${1 === scenarioVoteSession.duration ? 'minute' : 'minutes'}`});

    return {
      embeds: [embedBuilder.toJSON()],
      components: scenarioVoteSession.active ? buttonRows : []
    };
  };

  /**
   * Constructs a voting poll message that was cancelled.
   * @param serverId The id of the server that hosted the vote.
   * @param scenarioVoteSession The vote session details.
   * @returns A custom formatted embed object for a specific feature.
   */
  private formatCancelledScenarioVoteEmbed(serverId: number, scenarioVoteSession: VoteSession<ScenarioMetadata>) {
    const embedBuilder = new EmbedBuilder();
    const cancelEmbedDescSegments = [`${bold('CANCELLED')}${EOL}`];

    for (const [index, scenarioData] of scenarioVoteSession.getCurrentCandidates().entries()) {
      let dataSegment = `▸ ${index + 1}.) ${
        bold(`[${scenarioVoteSession.getVoteCountForCandidate(index)}]`)
      } ${italic(scenarioData.fileName)} | Played ${scenarioData.plays} ${scenarioData.plays === 1 ? 'time' : 'times'}`;
      if (scenarioData.tags.length > 0) {
        dataSegment += ` | ${underscore('Tags')}: ${scenarioData.tags.join(' ')}`;
      };
      cancelEmbedDescSegments.push(dataSegment);
    };

    embedBuilder
      .setColor(Colors.Red)
      .setTitle(`${strikethrough(`${underscore(italic(`Server ${serverId}`))} - Scenario Vote`)}`)
      .setDescription(cancelEmbedDescSegments.join(EOL))
      .setAuthor(
        { 
          name: scenarioVoteSession.interaction.user.tag,
          iconURL: scenarioVoteSession.interaction.user.displayAvatarURL()
        }
      )
      .setFooter({ text: `Duration: ${scenarioVoteSession.duration} ${1 === scenarioVoteSession.duration ? 'minute' : 'minutes'}`});

    return { embeds: [embedBuilder.toJSON()], components: [] };
  };

  /**
   * Constructs a vote result message for a winning candidate.
   * @param winnerVoteCount The vote count of the winning candidate.
   * @param winningScenario The name of the scenario that won.
   * @returns A custom formatted message for a specific feature.
   */
  private formatCompletedVoteMessage(
    winningScenario: string,
    winningCandidates: ScenarioMetadata[],
    winningVoteCount: number
  ) {
    const voteResultSegments = [
      winningCandidates.length > 1
        ? `${italic(winningScenario)} has been randomly selected as the winner!${EOL}`
        : `${italic(winningScenario)} won the vote with ${winningVoteCount} ${
          1 === winningVoteCount ? 'vote' : 'votes'
        }!${EOL}`
    ];

    if (winningCandidates.length > 1) {
      let tieSegment = `There was a ${winningCandidates.length > 2 ? `${winningCandidates.length}-way ` : ' '}tie between `;
      for (const [index, winner] of winningCandidates.entries()) {
        if (0 === index) {
          tieSegment += winner
        } else if (index === winningCandidates.length - 1) {
          tieSegment += ` and ${bold(winningScenario)} `;
        } else {
          tieSegment += `, ${winner}`
        };
      };
      tieSegment += `with ${winningVoteCount} ${1 === winningVoteCount ? 'vote' : 'votes'} for each.${EOL}`;
      voteResultSegments.unshift(tieSegment);
    };

    return voteResultSegments.join(EOL);
  };

  /**
   * Posts a starting vote session.
   * @param messagePayload
   */
  private async postVoteSession(interaction: ChatInputCommandInteraction, messagePayload: MessagePayload) {
    try {
      const guildInfo = await this.botDataRepo.getGuildInfo();
      const channel = await interaction.guild?.channels.fetch(guildInfo.votingChannelId);
      if (channel && channel.isTextBased()) {
        return await channel.send(messagePayload);
      };
      throw new Error('Could not post vote session to a text channel.');
    } catch (err) {
      // logging
    };
  };
};