import {
  bold,
  inlineCode,
  italic,
  underscore,
  ChatInputCommandInteraction,
  User
} from 'discord.js';
import { EOL } from 'os';
import {
  BotCommand,
  CommandPermissionLevel,
  CommandResponseBuilder
} from '@modules/discord/commands';
import { ScenarioMetadata } from '@modules/openrct2/data/models';
import { ScenarioRepository } from '@modules/openrct2/data/repositories';
import { ScenarioFileExtension } from '@modules/openrct2/data/types';
import { 
  fisherYatesShuffle,
  getArraySectionWithDetails,
  selectRandomElement
} from '@modules/utils/array-utils';
import { 
  areStringsEqualCaseInsensitive,
  isStringNullOrWhiteSpace
} from '@modules/utils/string-utils';

type ScenarioCommandOptions =
  | 'scenario'
  | 'name' | 'tags' // search, modify
  | 'file-type' | 'page' // search, list
  | 'active' // modify
type ScenarioCommandSubcommands =
  | 'list'
  | 'search'
  | 'modify'
  | 'gimme'

const FileTypeOptionChoices = [
  { name: '.scv* (RCT1 & RCT2)', value: 'scv' },
  { name: '.park (ORCT2)', value: 'park' }
];
const GimmePhrases = [
  'Are you feeling it now {user}?',
  'Your menu, {user}.',
  '{user} {user} {user}',
  'To be honest, I have no idea what these are.',
  'Will these work?',
  'These seem fine, right?',
  'I have a good feeling about these.',
  'These may or may not work.',
  'I prefer the grape-flavored ones.',
  'Please leave a 5-star rating!',
  'Here you go {user}.',
  'They smell funny? Must be your imagination...',
  'These will not explode this time, I promise.',
  'These are not the things you are looking for.',
  'No refunds.'
];

/** Represents a command for managing RollerCoaster Tycoon scenario files. */
export class ScenarioCommand extends BotCommand<
  ScenarioCommandOptions,
  ScenarioCommandSubcommands,
  null
> {
  private readonly scenarioRepo: ScenarioRepository;

  constructor(scenarioRepo: ScenarioRepository) {
    super(CommandPermissionLevel.User);
    this.data
      .setName('scenario')
      .setDescription('Gets and manages RollerCoaster Tycoon scenario files for gameplay.')
      .addSubcommand(subcommand =>
        subcommand
        .setName(this.reflectSubcommandName('list'))
        .setDescription('Gets the available RollerCoaster Tycoon scenarios.')
        .addStringOption(option => 
          option
            .setName(this.reflectOptionName('file-type'))
            .setDescription('The type of scenario files to return.')
            .setChoices(...FileTypeOptionChoices)
        )
        .addIntegerOption(option => 
          option
            .setName(this.reflectOptionName('page'))
            .setDescription('The starting page of the search result listing.')
            .setMinValue(1)
        )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(this.reflectSubcommandName('search'))
          .setDescription('Searches for RollerCoaster Tycoon scenarios by specified search parameters.')
          .addStringOption(option =>
            option
              .setName(this.reflectOptionName('name'))
              .setDescription('The name of the scenario file to match.')
          )
          .addStringOption(option =>
            option
              .setName(this.reflectOptionName('tags'))
              .setDescription('The exact data tags to match.')
          )
          .addStringOption(option => 
            option
              .setName(this.reflectOptionName('file-type'))
              .setDescription('The type of scenario files to return.')
              .setChoices(...FileTypeOptionChoices)
          )
          .addIntegerOption(option => 
            option
              .setName(this.reflectOptionName('page'))
              .setDescription('The starting page of the search result listing.')
              .setMinValue(1)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(this.reflectSubcommandName('modify'))
          .setDescription('Changes scenario data properties')
          .addStringOption(option =>
            option
              .setName(this.reflectOptionName('scenario'))
              .setDescription('The name of the scenario to modify.')
              .setRequired(true)
          )
          .addStringOption(option =>
            option
              .setName(this.reflectOptionName('name'))
              .setDescription('A new name for the scenario.')
          )
          .addStringOption(option =>
            option
              .setName(this.reflectOptionName('tags'))
              .setDescription('The data tags to set.')
          )
          .addBooleanOption(option =>
            option
              .setName(this.reflectOptionName('active'))
              .setDescription('Set active or inactive.')
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(this.reflectSubcommandName('gimme'))
          .setDescription('Fetches a random selection of scenarios.')
          .addStringOption(option =>
            option
              .setName(this.reflectOptionName('tags'))
              .setDescription('The exact data tags to match.')
          )
        );

    this.scenarioRepo = scenarioRepo;
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction, userLevel: CommandPermissionLevel) {
    let commandResponse = new CommandResponseBuilder();
    const scenarios = await this.scenarioRepo.getAvailableScenarios();

    if (0 === scenarios.length) {
      commandResponse.appendToError('There are currently no scenarios to show or use.');
    } else {
      if (this.isInteractionUsingSubcommand(interaction, 'modify')) {
        if (userLevel < CommandPermissionLevel.Trusted) {
          commandResponse.appendToError(this.formatSubcommandPermissionError(null, 'modify'))
        } else {
          const scenarioName = this.getInteractionOption(interaction, 'scenario').value as string
          const newName = this.doesInteractionHaveOption(interaction, 'name') 
            ? this.getInteractionOption(interaction, 'name').value as string
            : undefined;
          const newTags = this.doesInteractionHaveOption(interaction, 'tags')
            ? (this.getInteractionOption(interaction, 'tags').value as string).split(/\s+/)
            : undefined;
          const active = this.doesInteractionHaveOption(interaction, 'active')
            ? this.getInteractionOption(interaction, 'active').value as boolean
            : undefined;
          commandResponse = await this.setScenarioValues(scenarioName, newName, newTags, active);
        };
      } else if (this.isInteractionUsingSubcommand(interaction, 'gimme')) {
        const tags = this.doesInteractionHaveOption(interaction, 'tags')
          ? (this.getInteractionOption(interaction, 'tags').value as string).split(/\s+/)
          : undefined;
        commandResponse = await this.gimmeScenarios(interaction.user, tags);
      } else {
        const scenarioFileExts: ScenarioFileExtension[] = [];

        if (this.doesInteractionHaveOption(interaction, 'file-type')) {
          const extChoice = this.getInteractionOption(interaction, 'file-type').value as string;
          if ('scv' === extChoice) {
            scenarioFileExts.push('.sc4', '.sv4', '.sc6', '.sv6');
          } else if ('park' === extChoice) {
            scenarioFileExts.push('.park');
          };
        };
        const pageIndex = this.doesInteractionHaveOption(interaction, 'page')
          ? this.getInteractionOption(interaction, 'page').value as number - 1
          : 0;
  
        if (this.isInteractionUsingSubcommand(interaction, 'search')) {
          const nameSearch = this.doesInteractionHaveOption(interaction, 'name') 
            ? this.getInteractionOption(interaction, 'name').value as string
            : undefined;
          const tags = this.doesInteractionHaveOption(interaction, 'tags')
            ? (this.getInteractionOption(interaction, 'tags').value as string).split(/\s+/)
            : undefined;
          commandResponse = await this.getScenariosBySearchQuery(scenarioFileExts, pageIndex, nameSearch, tags);
        } else if (this.isInteractionUsingSubcommand(interaction, 'list')) {
          commandResponse = await this.getScenarioList(scenarioFileExts, pageIndex);
        };
      };
    };

    if (0 === commandResponse.resolve().length) {
      commandResponse.appendToError('Unknown or unimplemented command specified.');
    };

    await interaction.reply(commandResponse.resolve());
  };

  private async setScenarioValues(
    scenarioName: string,
    newName?: string,
    newTags?: string[],
    active?: boolean
  ) {
    const commandResponse = new CommandResponseBuilder();
    
    const scenarios = await this.scenarioRepo.getScenarioByFuzzySearch(scenarioName);
    if (1 === scenarios.length) {
      const scenarioToChange = scenarios[0];
      const metadata = await this.scenarioRepo.getScenarioMetadataForFile(scenarioToChange);
      const updateActions: (() => Promise<void>)[] = [];
      const performUpdates = async () => { for (const action of updateActions) { await action(); }; };

      if (newTags || active !== undefined) {
        if (newTags) {
          metadata.tags = newTags;
          commandResponse.appendToMessage(`Applied data tags for ${italic(scenarioToChange.name)}: ${newTags.map(tag => inlineCode(tag)).join(' ')}`);
        };
  
        if (active !== undefined) {
          metadata.active = active;
          commandResponse.appendToMessage(`Set ${italic(scenarioToChange.name)} to be ${active ? bold('ACTIVE') : bold('INACTIVE')}`)
        };

        updateActions.push(() => this.scenarioRepo.updateScenarioMetadata(metadata));
      };

      if (newName) {
        const fullNewName = newName.endsWith(scenarioToChange.fileExtension)
          ? newName
          : `${newName}${scenarioToChange.fileExtension}`;
        if (areStringsEqualCaseInsensitive(fullNewName, scenarioToChange.name)) {
          commandResponse.appendToError(`${italic(scenarioToChange.name)} is already named as ${italic(newName)}. No changes were made.`);
        } else {
          const newNameCheck = await this.scenarioRepo.getScenarioByName(fullNewName);
          if (newNameCheck) {
            commandResponse.appendToError(`Cannot rename ${italic(scenarioToChange.name)}. There is a different scenario named ${italic(newName)}.`);
          } else {
            commandResponse.appendToMessage(`Renamed ${italic(scenarioToChange.name)} to ${italic(fullNewName)}.`);
            updateActions.push(() => this.scenarioRepo.renameScenario(scenarioToChange, newName));
          };
        };
      };
      
      if (isStringNullOrWhiteSpace(commandResponse.message)) {
        commandResponse.appendToMessage('No changes were made.');
      } else if (!commandResponse.hasError) {
        await performUpdates();
        commandResponse.appendToMessage('Updates may take a bit of time to fully apply.');
      };
    } else {
      commandResponse.appendToError(this.formatNonsingleScenarioError(scenarios.map(scenario => scenario.name), scenarioName));
    };

    return commandResponse;
  };

  private async gimmeScenarios(user: User, tags?: string[]) {
    const commandResponse = new CommandResponseBuilder();

    const metadata = await this.scenarioRepo.getScenarioMetadata();
    const matchedMetadata = tags
      ? metadata.filter(scenarioData => {
          return tags.every(tag => scenarioData.tags.includes(tag));
        })
      : metadata;
    const selectedMetadata = fisherYatesShuffle(matchedMetadata).slice(0, 10);

    if (0 === selectedMetadata.length) {
      commandResponse.appendToMessage(this.formatEmptyResultMessage(undefined, tags));
    } else {
      commandResponse.appendToMessage(`${selectRandomElement(GimmePhrases).replace(/\{user\}/g, bold(user.username))}${EOL}`);
      if (tags) {
        commandResponse.appendToMessage(`${italic(tags.join(' '))}${EOL}`);
      };
      for (const scenarioData of selectedMetadata) {
        commandResponse.appendToMessage(`▸ ${italic(scenarioData.fileName)}`);
      };
    };

    return commandResponse;
  };

  private async getScenariosBySearchQuery(
    scenarioFileExts: ScenarioFileExtension[],
    resultIndex: number,
    nameSearch?: string,
    tags?: string[]
  ) {
    const commandResponse = new CommandResponseBuilder();

    if (!(nameSearch || tags)) {
      return this.getScenarioList(scenarioFileExts, resultIndex);
    } else {
      const metadata = nameSearch
        ? await this.scenarioRepo.getScenarioMetadataByFuzzySearch(nameSearch, ...scenarioFileExts)
        : 0 === scenarioFileExts.length
        ? await this.scenarioRepo.getScenarioMetadata()
        : await this.scenarioRepo.getScenarioMetadataByFileExtension(...scenarioFileExts)

      const matchedMetadata = tags
        ? metadata.filter(scenarioData => {
            return tags.every(tag => scenarioData.tags.includes(tag));
          })
        : metadata;

      if (matchedMetadata.length > 0) {
        const metadataSet = getArraySectionWithDetails(matchedMetadata, resultIndex);
        commandResponse.appendToMessage(this.formatScenarioSearchMessage(metadataSet, nameSearch, tags));
      } else {
        commandResponse.appendToError(this.formatEmptyResultMessage(nameSearch, tags));
      };
    };

    return commandResponse;
  };

  private async getScenarioList(
    scenarioFileExts: ScenarioFileExtension[],
    resultIndex: number
  ) {
    const commandResponse = new CommandResponseBuilder();

    const metadata = 0 === scenarioFileExts.length
      ? await this.scenarioRepo.getScenarioMetadata()
      : await this.scenarioRepo.getScenarioMetadataByFileExtension(...scenarioFileExts);
    if (metadata.length > 0) {
      const metadataSet = getArraySectionWithDetails(metadata, resultIndex);
      commandResponse.appendToMessage(this.formatScenarioListMessage(metadataSet));
    } else {
      commandResponse.appendToMessage(this.formatEmptyResultMessage());
    };

    return commandResponse;
  };

  /**
   * Constructs a message of the search results for scenarios that match certain parameters.
   * @param metadataSet The result set to format the message from.
   * @param nameSearch The name used to get the result set if specified.
   * @param tags The tags used to get the result set if specified.
   * @returns A custom formatted message for a specific feature.
   */
  private formatScenarioSearchMessage(
    metadataSet: {
      section: ScenarioMetadata[],
      sectionIndex: number,
      totalSections: number
    },
    nameSearch?: string,
    tags?: string[]
  ) {
    const metadataMsgSegments = [];

    const queryParameterSegments = [];
    if (nameSearch) {
      queryParameterSegments.push(`the name '${italic(nameSearch)}'`);
    };
    if (tags) {
      queryParameterSegments.push(`the data tags ${tags.map(tag => inlineCode(tag)).join(' ')}`);
    };
    metadataMsgSegments.push(`Scenarios that match ${queryParameterSegments.join(' and ')}:${EOL}`);

    for (const scenarioData of metadataSet.section) {
      let dataSegment = `▸ ${italic(scenarioData.fileName)} | ${italic(`${scenarioData.plays}P/${scenarioData.wins}W/${scenarioData.losses}L`)}`;
      if (!tags && scenarioData.tags.length > 0) {
        dataSegment += ` | ${italic(scenarioData.tags.map(tag => inlineCode(tag)).join(' '))}`;
      };
      if (!scenarioData.active) {
        dataSegment += ` | ${underscore(italic('INACTIVE'))}`;
      };
      metadataMsgSegments.push(dataSegment);
    };
    metadataMsgSegments.push(`${EOL}Page ${italic(`${metadataSet.sectionIndex + 1}/${metadataSet.totalSections}`)}`);

    return metadataMsgSegments.join(EOL);
  };

  /**
   * Constructs a message of an empty search result with specified parameters.
   * @param nameSearch The name used to search if specified.
   * @param tags The tags used to search if specified.
   * @returns A custom formatted message for a specific feature.
   */
  private formatEmptyResultMessage(nameSearch?: string, tags?: string[]) {
    const queryParameterSegments = [];
    if (nameSearch) {
      queryParameterSegments.push(`the name ${italic(nameSearch)}`);
    };
    if (tags) {
      queryParameterSegments.push(`the data tags ${tags.map(tag => inlineCode(tag)).join(' ')}`);
    };
    
    if (queryParameterSegments.length > 0) {
      return `No scenarios match ${queryParameterSegments.join(' and ')}.`;
    };
    return 'No scenarios were found with the specified parameters.';
  };

  /**
   * Constructs a message of an overall listing of available scenarios.
   * @param metadataSet The result set to format the message from.
   * @param name The name used to get the result set if any.
   * @returns A custom formatted message for a specific feature.
   */
  private formatScenarioListMessage(
    metadataSet: {
      section: ScenarioMetadata[],
      sectionIndex: number,
      totalSections: number
    }
  ) {
    const metadataMsgSegments = [];

    for (const scenarioData of metadataSet.section) {
      let dataSegment = `▸ ${italic(scenarioData.fileName)} | ${italic(`${scenarioData.plays}P/${scenarioData.wins}W/${scenarioData.losses}L`)}`;
      if (scenarioData.tags.length > 0) {
        dataSegment += ` | ${italic(scenarioData.tags.map(tag => inlineCode(tag)).join(' '))}`;
      };
      if (!scenarioData.active) {
        dataSegment += ` | ${bold('INACTIVE')}`;
      };
      metadataMsgSegments.push(dataSegment);
    };
    metadataMsgSegments.push(`${EOL}Page ${italic(`${metadataSet.sectionIndex + 1}/${metadataSet.totalSections}`)}`);

    return metadataMsgSegments.join(EOL);
  };

  /**
   * Constructs an error message of the search results for scenarios
   * that don't match into one single result.
   * @param scenarioNames The result array of multiple scenario matches to format the message from.
   * @param nameSearch The query parameter used to get the result set.
   */
  private formatNonsingleScenarioError(scenarioNames: string[], nameSearch: string) {
    const errorMsgSegments = [];

    if (scenarioNames.length > 1) {
      errorMsgSegments.push(`Multiple scenarios match ${italic(nameSearch)}:${EOL}`);
      for (const name of scenarioNames) {
        errorMsgSegments.push(`▸ ${italic(name)}`);
      };
      errorMsgSegments.push(`${EOL}Enter a more specific name.`);
    } else {
      errorMsgSegments.push(`No scenarios match the name ${italic(nameSearch)}.`)
    };

    return errorMsgSegments.join(EOL);
  };

  // /**
  //  * Constructs a phrase of declared scenario file extensions to be concatenated into a message.
  //  * @param scenarioFileExts An array of declared scenario file extensions.
  //  * @returns The constructed phrase.
  //  */
  // private makeSpecifiedExtensionsPhrase(scenarioFileExts: ScenarioFileExtension[]) {
  //   let phrase = '';
  //   if (scenarioFileExts.length > 0) {
  //     phrase = ` ending with ${scenarioFileExts[0]}`;
  //     if (scenarioFileExts.length > 1) {
  //       for (let i = 1; i < scenarioFileExts.length; ++i) {
  //         const ext = scenarioFileExts[i];
  //         if (i = scenarioFileExts.length - 1) {
  //           phrase += ` or ${scenarioFileExts[i]}`;
  //         } else {
  //           phrase += `, ${ext}`;
  //         };
  //       };
  //     };
  //   };
  //   return phrase;
  // };
};