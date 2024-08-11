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
  CommandPermissionLevel,
  ResponseBuilder,
  SubcommandsDiscordBotCommand
} from '@modules/discord/commands';
import { BotDataRepository } from '@modules/discord/data/repositories';
import { Logger } from '@modules/logging';
import { OpenRCT2ServerController } from '@modules/openrct2/controllers';
import {
  ScenarioMetadata,
} from '@modules/openrct2/data/models';
import { 
  ScenarioRepository,
  ServerRepository
} from '@modules/openrct2/data/repositories';
import { fisherYatesShuffle } from '@modules/utils/array-utils';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils';

const VoteSubcommandGroups = <const>[
  {
    name: 'scenario',
    subcommands: [
      { 
        name: 'start',
        description: 'Starts a vote on a random list of scenarios to pick from to enqueue for an OpenRCT2 server.',
        options: [
          {
            name: 'server-id',
            type: 'integer',
            description: 'The id number of the server to host a vote for (also is the vote session id).',
            minValue: 1,
            permissionLevel: CommandPermissionLevel.Moderator
          },
          {
            name: 'list-limit',
            type: 'integer',
            description: 'The maximum number of scenarios displayed to vote on (min 3, max 10).',
            minValue: 3,
            maxValue: 10
          },
          {
            name: 'time',
            type: 'integer',
            description: 'The maximum amount of time in minutes to allow for voting (max 60).',
            minValue: 1,
            maxValue: 60
          }
        ]
      },
      { 
        name: 'stop',
        description: 'Stops and cancels an active scenario vote.',
        permissionLevel: CommandPermissionLevel.Moderator,
        options: [
          { 
            name: 'id',
            type: 'integer',
            description: 'The id number of the vote session to stop.',
            minValue: 0
          }
        ]
      },
      { 
        name: 'end',
        description: 'Finishes an active scenario vote early and gets its results.',
        permissionLevel: CommandPermissionLevel.Moderator,
        options: [
          { 
            name: 'id',
            type: 'integer',
            description: 'The id number of the vote session to end.',
            minValue: 0
          }
        ]
      }
    ]
  }
];

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

  /** Gets the current candidates up for voting. */
  getCurrentCandidates() {
    return this.currentCandidates;
  };

  /** Gets the current votes for a particular candidate by index. */
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
export class VoteCommand extends SubcommandsDiscordBotCommand<typeof VoteSubcommandGroups[number], undefined> {
  private readonly logger: Logger;
  private readonly botDataRepo: BotDataRepository;
  private readonly scenarioRepo: ScenarioRepository;
  private readonly serverRepo: ServerRepository;
  private readonly openRCT2ServerController: OpenRCT2ServerController;
  private readonly activeVotes = new Map<number, VoteSession<unknown>>();

  constructor(
    logger: Logger,
    botDataRepo: BotDataRepository,
    scenarioRepo: ScenarioRepository,
    serverRepo: ServerRepository,
    openRCT2ServerController: OpenRCT2ServerController,
  ) {
    super(
      'vote',
      'Handles voting sessions',
      VoteSubcommandGroups,
      undefined,
      CommandPermissionLevel.Trusted
    );
    
    this.logger = logger;
    this.botDataRepo = botDataRepo;
    this.scenarioRepo = scenarioRepo;
    this.serverRepo = serverRepo;
    this.openRCT2ServerController = openRCT2ServerController;
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction) {
    const groupName = this.getInteractionSubcommandGroupName(interaction);
    const subcommandName = this.getInteractionSubcommandName(interaction);
    const response = new ResponseBuilder();

    const guildInfo = await this.botDataRepo.getGuildInfo();
    if (isStringNullOrWhiteSpace(guildInfo.scenarioChannelId)) {
      await interaction.reply(`Assign the ${italic('Vote Channel')} with the ${inlineCode('/channel')} command first.`);
      return;
    };

    if (groupName === 'scenario') {
      if (subcommandName === 'stop') {
        await this.stopActiveVote(
          response,
          this.getInteractionOption(interaction, 'id')?.value as number ?? 1,
          interaction.user
        );
      } else if (subcommandName === 'end') {
        const voteId = this.getInteractionOption(interaction, 'id')?.value as number ?? 1;
        await this.endActiveVote(response, voteId, interaction.user);
      } else if (subcommandName === 'start') {
        const options = this.getInteractionSubcommandGroupSubcommandOptions(interaction, 'scenario', 'start');
        const serverId = options.get('server-id')?.value as number ?? 1;
        const candidateCount = options.get('list-limit')?.value as number ?? 10;
        const voteDuration = options.get('time')?.value as number ?? 2;
          
        if (this.activeVotes.has(serverId)) {
          response.addErrorText(`A vote is currently active for ${underscore(italic(`Server ${serverId}`))}.`);
        } else {
          await interaction.deferReply();
  
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
          await this.startScenarioVote(
            response,
            interaction,
            serverId,
            voteSession
          );
        };
      };
    };

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

  private async startScenarioVote(
    response: ResponseBuilder,
    interaction: ChatInputCommandInteraction,
    serverId: number,
    voteSession: VoteSession<ScenarioMetadata>
  ) {
    const serverDir = await this.serverRepo.getServerDirectoryById(serverId);
    const queue = await serverDir.getQueue();

    if (queue.limit < 1 || queue.scenarios.length < queue.limit) {
      this.activeVotes.set(serverId, voteSession);

      await voteSession.setupNewVoteRound();

      const payload = new MessagePayload(
        interaction,
        this.formatScenarioVoteEmbed(serverId, voteSession)
      );
      const voteMessage = await this.postVoteSession(interaction, payload);
  
      if (voteMessage) {
        const voteCollector = voteMessage.createMessageComponentCollector(
          { 
            componentType: ComponentType.Button,
            time: voteSession.duration * 60000
          }
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

        response.addText(`Started a new scenario vote for ${underscore(italic(`Server ${serverId}`))}. ${voteMessage.url}`);
      } else {
        response.addErrorText('Failed to start a vote. Could not post the vote.');
        this.activeVotes.delete(serverId);
      };
    } else {
      response.addErrorText(
        `There are too many scenarios queued up for ${underscore(italic(`Server ${serverId}`))}.`,
        'Play the scenarios in the queue first or clear some out.'
      );
    };
  };

  private async stopActiveVote(response: ResponseBuilder, voteId: number, canceller: User) {
    const voteSession = this.activeVotes.get(voteId);
    const voteName = 0 === voteId ? 'current custom vote' : `scenario vote for ${underscore(italic(`Server ${voteId}`))}`;
    if (voteSession) {
      if (voteSession.stoppable && voteSession.interactionCollector) {
        voteSession.cancelledBy = canceller;
        voteSession.interactionCollector.stop('cancel');
        response.addText(`Stopping the ${voteName}.`);
      } else {
        response.addErrorText(`Cannot stop the ${voteName}.`);
      };
    } else {
      response.addErrorText(`There is no ${voteName} active.`);
    };
  };

  private async endActiveVote(response: ResponseBuilder, voteId: number, ender: User) {
    const voteSession = this.activeVotes.get(voteId);
    const voteName = 0 === voteId ? 'current custom vote' : `scenario vote for ${underscore(italic(`Server ${voteId}`))}`;
    if (voteSession) {
      if (voteSession.stoppable && voteSession.interactionCollector) {
        voteSession.endedBy = ender;
        voteSession.interactionCollector.stop('finish');
        response.addText(`Wrapping up the ${voteName}.`);
      } else {
        response.addErrorText(`Cannot end the ${voteName}.`);
      };
    } else {
      response.addErrorText(`There is no ${voteName} active.`);
    };
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
    } catch (err) {
      this.activeVotes.delete(serverId);
      await this.logger.writeError(err as Error);
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
            const serverDir = await this.serverRepo.getServerDirectoryById(serverId);
            const queue = await serverDir.getQueue();

            const winningCandidate = voteResult.winningCandidates.length > 1
              ? fisherYatesShuffle(voteResult.winningCandidates)[0]
              : voteResult.winningCandidates[0];
            let resultMessageBody = this.formatCompletedVoteMessage(
              winningCandidate.fileName,
              voteResult.winningCandidates,
              voteResult.highestVoteCount
            );
            
            const scenarioFile = (await this.scenarioRepo.getScenarioByName(winningCandidate.fileName))!;
            if (queue.limit < 1) {
              this.openRCT2ServerController.startServerDeferred(serverId, scenarioFile);
              resultMessageBody += `${EOL}${scenarioFile.nameNoExtension} will start on ${underscore(italic(`Server ${serverId}`))} shortly.`;
            } else if (queue.scenarios.length < queue.limit) {
              this.openRCT2ServerController.addToServerScenarioQueue(serverId, scenarioFile);
              resultMessageBody += `${EOL}${scenarioFile.nameNoExtension} has been added to the ${underscore(italic(`Server ${serverId}`))} scenario queue.`;
            } else {
              resultMessageBody += `${EOL}Unfortunately, ${scenarioFile.nameNoExtension} could not be added as the ${
                underscore(italic(`Server ${serverId}`))
              } scenario queue is full.`;
            };
            await voteMessage.reply(resultMessageBody);
          };
        };
      };
    } catch (err) {
      await this.logger.writeError(err as Error);
    } finally {
      this.activeVotes.delete(serverId);
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
      const voteCollector = voteMessage.createMessageComponentCollector(
        { 
          componentType: ComponentType.Button,
          time: voteSession.duration * 60000
        }
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
      await this.logger.writeError(err as Error);
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
      let tieSegment = `There was a ${winningCandidates.length > 2 ? `${winningCandidates.length}-way ` : ''}tie between `;
      for (const [index, winner] of winningCandidates.entries()) {
        if (0 === index) {
          tieSegment += bold(winner.fileName)
        } else if (index === winningCandidates.length - 1) {
          tieSegment += ` and ${bold(winner.fileName)} `;
        } else {
          tieSegment += `, ${bold(winner.fileName)}`
        };
      };
      tieSegment += `with ${winningVoteCount} ${1 === winningVoteCount ? 'vote' : 'votes'} for each.${EOL}`;
      voteResultSegments.unshift(tieSegment);
    };

    return voteResultSegments.join(EOL);
  };

  /**
   * Posts a starting vote session.
   * @async
   * @param interaction
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
      await this.logger.writeError(err as Error);
    };
  };
};