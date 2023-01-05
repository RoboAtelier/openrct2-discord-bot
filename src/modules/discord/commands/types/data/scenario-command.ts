import {
  bold,
  italic,
  underscore,
  ChatInputCommandInteraction
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
import { getArraySectionWithDetails } from '@modules/utils/array-utils';
import { isStringNullOrWhiteSpace, areStringsEqualCaseInsensitive } from '@modules/utils/string-utils';

type ScenarioCommandOptions =
  | 'scenario'
  | 'name' | 'tags' | 'active' // values
  | 'file-type'
  | 'page' // tags, list
type ScenarioCommandSubcommands =
  | 'get'
  | 'set'
  | 'list'
  | 'values'

const FileTypeOptionChoices = [
  { name: '.scv* (RCT1 & RCT2)', value: 'scv' },
  { name: '.park (ORCT2)', value: 'park' }
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
          .setName(this.reflectSubcommandName('get'))
          .setDescription('Gets RollerCoaster Tycoon scenarios by specified search parameters.')
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
          .setName(this.reflectSubcommandName('set'))
          .setDescription('Sets scenario data properties')
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
      if (this.isInteractionUsingSubcommand(interaction, 'set')) {
        if (userLevel < CommandPermissionLevel.Trusted) {
          commandResponse.appendToError(this.formatSubcommandPermissionError(null, 'set'))
        } else {
          const scenarioName = this.getInteractionOption(interaction, 'scenario').value as string
          const newName = this.doesInteractionHaveOption(interaction, 'name') 
            ? this.getInteractionOption(interaction, 'name').value as string
            : null;
          const newTags = this.doesInteractionHaveOption(interaction, 'tags')
            ? (this.getInteractionOption(interaction, 'tags').value as string).split(/\s+/)
            : null;
          const active = this.doesInteractionHaveOption(interaction, 'active')
            ? this.getInteractionOption(interaction, 'active').value as boolean
            : null;
          commandResponse = await this.setScenarioValues(scenarioName, newName, newTags, active);
        };

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
  
        if (this.isInteractionUsingSubcommand(interaction, 'get')) {
          const nameSearch = this.doesInteractionHaveOption(interaction, 'name') 
            ? this.getInteractionOption(interaction, 'name').value as string
            : null;
          const tags = this.doesInteractionHaveOption(interaction, 'tags')
            ? (this.getInteractionOption(interaction, 'tags').value as string).split(/\s+/)
            : null;
          commandResponse = await this.getScenariosBySearchQuery(nameSearch, tags, scenarioFileExts, pageIndex);
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
    newName: string | null,
    newTags: string[] | null,
    active: boolean | null
  ) {
    const commandResponse = new CommandResponseBuilder();
    
    const scenarios = await this.scenarioRepo.getScenarioByFuzzySearch(scenarioName);
    if (1 === scenarios.length) {
      const scenarioToChange = scenarios[0];
      const metadata = await this.scenarioRepo.getScenarioMetadataForFile(scenarioToChange);
      const updateActions: (() => Promise<void>)[] = [];
      const performUpdates = async () => { for (const action of updateActions) { await action(); }; };

      if (newTags !== null || active !== null) {
        if (newTags !== null) {
          metadata.tags = newTags;
          commandResponse.appendToMessage(`Applied data tags for ${italic(scenarioToChange.name)}: ${newTags.join(' ')}`);
        };
  
        if (active !== null) {
          metadata.active = active;
          commandResponse.appendToMessage(`Set ${italic(scenarioToChange.name)} to be ${active ? bold('ACTIVE') : bold('INACTIVE')}`)
        };

        updateActions.push(() => this.scenarioRepo.updateScenarioMetadata(metadata));
      };

      if (newName !== null) {
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

  private async getScenariosBySearchQuery(
    nameSearch: string | null,
    tags: string[] | null,
    scenarioFileExts: ScenarioFileExtension[],
    resultIndex: number
  ) {
    const commandResponse = new CommandResponseBuilder();

    if (
      nameSearch === null
      && tags === null
    ) {
      return this.getScenarioList(scenarioFileExts, resultIndex);
    } else {
      const metadata = nameSearch !== null
        ? await this.scenarioRepo.getScenarioMetadataByFuzzySearch(nameSearch, ...scenarioFileExts)
        : await this.scenarioRepo.getScenarioMetadataByFileExtension(...scenarioFileExts)

      const matchedMetadata = tags !== null
        ? metadata.filter(scenarioData => {
            return tags.every(tag => scenarioData.tags.includes(tag));
          })
        : metadata;

      if (0 === matchedMetadata.length) {
        commandResponse.appendToError(this.formatEmptyResultMessage(nameSearch, tags));
      } else {
        const metadataSet = getArraySectionWithDetails(matchedMetadata, resultIndex);
        commandResponse.appendToMessage(this.formatScenarioSearchMessage(metadataSet, nameSearch, tags));
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
    const metadataSet = getArraySectionWithDetails(metadata, resultIndex);
    commandResponse.appendToMessage(this.formatScenarioListMessage(metadataSet));

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
    nameSearch: string | null,
    tags: string[] | null
  ) {
    const metadataMsgSegments = [];

    const queryParameterSegments = [];
    if (nameSearch !== null) {
      queryParameterSegments.push(`the name '${italic(nameSearch)}'`);
    };
    if (tags !== null) {
      queryParameterSegments.push(`the data tags ${italic(tags.join(' '))}`);
    };
    metadataMsgSegments.push(`Scenarios that match ${queryParameterSegments.join(' and ')}:${EOL}`);

    for (const scenarioData of metadataSet.section) {
      let dataSegment = `▸ ${italic(scenarioData.fileName)} | ${italic(`${scenarioData.plays}P/${scenarioData.wins}W/${scenarioData.losses}L`)}`;
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
  private formatEmptyResultMessage(nameSearch: string | null, tags: string[] | null) {
    const queryParameterSegments = [];
    if (nameSearch !== null) {
      queryParameterSegments.push(`the name '${italic(nameSearch)}'`);
    };
    if (tags !== null) {
      queryParameterSegments.push(`the data tags ${italic(tags.join(' '))}`);
    };
    
    return `No matches match ${queryParameterSegments.join(' or ')}.`;
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
        dataSegment += ` | ${underscore('Tags')}: ${italic(scenarioData.tags.join(' '))}`;
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

  /**
   * Constructs a phrase of declared scenario file extensions to be concatenated into a message.
   * @param scenarioFileExts An array of declared scenario file extensions.
   * @returns The constructed phrase.
   */
  private makeSpecifiedExtensionsPhrase(scenarioFileExts: ScenarioFileExtension[]) {
    let phrase = '';
    if (scenarioFileExts.length > 0) {
      phrase = ` ending with ${scenarioFileExts[0]}`;
      if (scenarioFileExts.length > 1) {
        for (let i = 1; i < scenarioFileExts.length; ++i) {
          const ext = scenarioFileExts[i];
          if (i = scenarioFileExts.length - 1) {
            phrase += ` or ${scenarioFileExts[i]}`;
          } else {
            phrase += `, ${ext}`;
          };
        };
      };
    };
    return phrase;
  };
};