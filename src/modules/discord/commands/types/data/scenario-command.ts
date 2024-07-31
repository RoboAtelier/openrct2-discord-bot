import {
  bold,
  ChatInputCommandInteraction,
  inlineCode,
  italic,
  underscore
} from 'discord.js';
import { EOL } from 'os';
import {
  CommandPermissionLevel,
  ResponseBuilder,
  SubcommandsDiscordBotCommand
} from '@modules/discord/commands';
import { ScenarioMetadata } from '@modules/openrct2/data/models';
import { ScenarioRepository } from '@modules/openrct2/data/repositories';
import { ScenarioFileExtension } from '@modules/openrct2/data/types';
import { getArraySectionWithDetails } from '@modules/utils/array-utils';
import { areStringsEqualCaseInsensitive } from '@modules/utils/string-utils';

const FileTypeOptionChoices = [
  { name: '.scv* (RCT1 & RCT2)', value: 'scv' },
  { name: '.park (ORCT2)', value: 'park' }
];

const ScenarioSubcommands = <const>[
  {
    name: 'list',
    description: 'Gets the available RollerCoaster Tycoon scenarios.',
    options: [
      { 
        name: 'file-type',
        type: 'string',
        description: 'The type of scenario files to return.',
        choices: FileTypeOptionChoices
      },
      { 
        name: 'page',
        type: 'integer',
        description: 'The starting page index of the listing.',
        minValue: 1
      }
    ]
  },
  {
    name: 'search',
    description: 'Searches for RollerCoaster Tycoon scenarios using specified parameters.',
    options: [
      { 
        name: 'name',
        type: 'string',
        description: 'The name of the scenario file to match.'
      },
      { 
        name: 'tags',
        type: 'string',
        description: 'The exact data tags to match.'
      },
      { 
        name: 'file-type',
        type: 'string',
        description: 'The type of scenario files to return.',
        choices: FileTypeOptionChoices
      },
      { 
        name: 'page',
        type: 'integer',
        description: 'The starting page index of the search result listing.',
        minValue: 1
      }
    ]
  },
  {
    name: 'edit',
    description: 'Changes a RollerCoaster Tycoon scenario file and its data.',
    permissionLevel: CommandPermissionLevel.Trusted,
    options: [
      { 
        name: 'scenario',
        type: 'string',
        description: 'The name of the scenario to change.',
        required: true
      },
      { 
        name: 'name',
        type: 'string',
        description: 'A new name for the scenario.'
      },
      { 
        name: 'tags',
        type: 'string',
        description: 'New data tags to set (overrides existing).'
      },
      { 
        name: 'active',
        type: 'boolean',
        description: 'Set active or inactive.'
      }
    ]
  }
];
// const GimmePhrases = [
//   'Are you feeling it now {user}?',
//   'Your menu, {user}.',
//   '{user} {user} {user}',
//   'To be honest, I have no idea what these are.',
//   'Will these work?',
//   'These seem fine, right?',
//   'I have a good feeling about these.',
//   'These may or may not work.',
//   'I prefer the grape-flavored ones.',
//   'Please leave a 5-star rating!',
//   'Here you go {user}.',
//   'They smell funny? Must be your imagination...',
//   'These will not explode this time, I promise.',
//   'These are not the things you are looking for.',
//   'No refunds.'
// ];

/** Represents a command for managing RollerCoaster Tycoon scenario files. */
export class ScenarioCommand extends SubcommandsDiscordBotCommand<undefined, typeof ScenarioSubcommands[number]> {
  private readonly scenarioRepo: ScenarioRepository;

  constructor(scenarioRepo: ScenarioRepository) {
    super(
      'scenario',
      'Gets and manages RollerCoaster Tycoon scenario files for gameplay.',
      undefined,
      ScenarioSubcommands,
      CommandPermissionLevel.User
    );

    this.scenarioRepo = scenarioRepo;
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction) {
    const subcommandName = this.getInteractionSubcommandName(interaction);
    const scenarios = await this.scenarioRepo.getAvailableScenarios();
    const response = new ResponseBuilder();

    if (0 === scenarios.length) {
      response.addErrorText('There are currently no scenarios to show or use.');
    } else {
      if (subcommandName === 'edit') {
        const options = this.getInteractionSubcommandOptions(interaction, 'edit');
        const scenarioName = options.get('scenario')!.value as string;
        const newName = options.get('name')?.value as string | undefined;
        const newTags = options.get('tags')
          ? (options.get('tags')!.value as string).split(/\s+/)
          : undefined;
        const active = options.get('active')?.value as boolean;
        await this.setScenarioValues(response, scenarioName, newName, newTags, active);
      } else {
        const scenarioFileExts: ScenarioFileExtension[] = [];
        const fileType = this.getInteractionOption(interaction, 'file-type');
        if (fileType) {
          const extChoice = fileType.value as string;
          if ('scv' === extChoice) {
            scenarioFileExts.push('.sc4', '.sv4', '.sc6', '.sv6');
          } else if ('park' === extChoice) {
            scenarioFileExts.push('.park');
          };
        };
        const pageIndex = (this.getInteractionOption(interaction, 'page')?.value as number ?? 1) - 1;

        if (subcommandName === 'search') {
          const options = this.getInteractionSubcommandOptions(interaction, 'search');
          const nameSearch = options.get('name')?.value as string | undefined;
          const tags = options.get('tags')
            ? (options.get('tags')!.value as string).split(/\s+/)
            : undefined;
          await this.getScenariosBySearchQuery(response, scenarioFileExts, pageIndex, nameSearch, tags);
        } else if (subcommandName === 'list') {
          await this.getScenarioList(response, scenarioFileExts, pageIndex);
        };
      };

      if (!response.hasContent) {
        interaction.deferred 
          ? await interaction.editReply(SubcommandsDiscordBotCommand.unknownCommandErrorMessage)
          : await interaction.reply(SubcommandsDiscordBotCommand.unknownCommandErrorMessage);
      };

      await interaction.reply(response.resolve(interaction));
    };
  };

  private async setScenarioValues(
    response: ResponseBuilder,
    scenarioName: string,
    newName?: string,
    newTags?: string[],
    active?: boolean
  ) {
    const scenarios = await this.scenarioRepo.getScenariosByFuzzySearch(scenarioName);
    if (1 === scenarios.length) {
      const scenarioToChange = scenarios[0];
      const metadata = await this.scenarioRepo.getScenarioMetadataForFile(scenarioToChange);
      const updateActions: (() => Promise<void>)[] = [];
      const performUpdates = async () => { for (const action of updateActions) { await action(); }; };

      if (newTags || active !== undefined) {
        if (newTags) {
          metadata.tags = newTags;
          response.addText(`Applied data tags for ${italic(scenarioToChange.name)}: ${newTags.map(tag => inlineCode(tag)).join(' ')}`);
        };
  
        if (active !== undefined) {
          metadata.active = active;
          response.addText(`Set ${italic(scenarioToChange.name)} to be ${active ? bold('ACTIVE') : bold('INACTIVE')}`)
        };

        updateActions.push(() => this.scenarioRepo.updateScenarioMetadata(metadata));
      };

      if (newName) {
        const fullNewName = newName.endsWith(scenarioToChange.fileExtension)
          ? newName
          : `${newName}${scenarioToChange.fileExtension}`;
        if (areStringsEqualCaseInsensitive(fullNewName, scenarioToChange.name)) {
          response.addErrorText(`${italic(scenarioToChange.name)} is already named as ${italic(newName)}. No changes were made.`);
        } else {
          const newNameCheck = await this.scenarioRepo.getScenarioByName(fullNewName);
          if (newNameCheck) {
            response.addErrorText(`Cannot rename ${italic(scenarioToChange.name)}. There is a different scenario named ${italic(newName)}.`);
          } else {
            response.addText(`Renamed ${italic(scenarioToChange.name)} to ${italic(fullNewName)}.`);
            updateActions.push(() => this.scenarioRepo.renameScenario(scenarioToChange, newName));
          };
        };
      };
      
      if (!response.hasText) {
        response.addText('No changes were made.');
      } else if (!response.hasError) {
        await performUpdates();
        response.addText('Updates may take a bit of time to fully apply.');
      };
    } else {
      response.addErrorText(this.formatNonsingleScenarioError(scenarios.map(scenario => scenario.name), scenarioName));
    };
  };

  // private async gimmeScenarios(user: User, tags?: string[]) {
  //   const response = new responseBuilder();

  //   const metadata = await this.scenarioRepo.getScenarioMetadata();
  //   const matchedMetadata = tags
  //     ? metadata.filter(scenarioData => {
  //         return tags.every(tag => scenarioData.tags.includes(tag));
  //       })
  //     : metadata;
  //   const selectedMetadata = fisherYatesShuffle(matchedMetadata).slice(0, 10);

  //   if (0 === selectedMetadata.length) {
  //     response.appendToMessage(this.formatEmptyResultMessage(undefined, tags));
  //   } else {
  //     response.appendToMessage(`${selectRandomElement(GimmePhrases).replace(/\{user\}/g, bold(user.username))}${EOL}`);
  //     if (tags) {
  //       response.appendToMessage(`${italic(tags.join(' '))}${EOL}`);
  //     };
  //     for (const scenarioData of selectedMetadata) {
  //       response.appendToMessage(`▸ ${italic(scenarioData.fileName)}`);
  //     };
  //   };

  //   return response;
  // };

  private async getScenariosBySearchQuery(
    response: ResponseBuilder,
    scenarioFileExts: ScenarioFileExtension[],
    resultIndex: number,
    nameSearch?: string,
    tags?: string[]
  ) {
    if (!(nameSearch || tags)) {
      return this.getScenarioList(response, scenarioFileExts, resultIndex);
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
        response.addText(this.formatScenarioSearchMessage(metadataSet, nameSearch, tags));
      } else {
        response.addErrorText(this.formatEmptyResultMessage(nameSearch, tags));
      };
    };
  };

  private async getScenarioList(
    response: ResponseBuilder,
    scenarioFileExts: ScenarioFileExtension[],
    resultIndex: number
  ) {
    const metadata = 0 === scenarioFileExts.length
      ? await this.scenarioRepo.getScenarioMetadata()
      : await this.scenarioRepo.getScenarioMetadataByFileExtension(...scenarioFileExts);
    if (metadata.length > 0) {
      const metadataSet = getArraySectionWithDetails(metadata, resultIndex);
      response.addText(this.formatScenarioListMessage(metadataSet));
    } else {
      response.addText(this.formatEmptyResultMessage());
    };
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
      for (const name of scenarioNames.slice(0, 10)) {
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