import {
  inlineCode,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  CommandInteractionOption,
  CacheType
} from 'discord.js';
import { 
  buildSlashCommandOptions,
  buildSlashCommandSubcommands,
  CommandAccessResultBuilder,
  CommandOption,
  CommandPermissionLevel,
  CommandType,
  Subcommand,
  SubcommandGroup
} from '@modules/discord/commands';

/**
 * Represents a base class for Discord bot commands.
 * @abstract
 */
export abstract class DiscordBotCommand {

  /** The maximum number of entries to return from a command result array section. */
  protected static readonly resultSetElementsLimit = 10;

  /** Gets the Discord slash command configuration data. */
  readonly data: SlashCommandBuilder;

  /** Gets the name of this bot command. */
  readonly name: string;

  /** Gets the description about this bot command. */
  readonly description: string;

  /** Gets the required permission level to execute this command. */
  readonly permissionLevel: CommandPermissionLevel;

  /** Gets the type of this bot command. */
  readonly type: CommandType;

  constructor(
    name: string,
    description: string,
    permissionLevel = CommandPermissionLevel.Administrator,
    type = CommandType.Bot
  ) {
    this.name = name;
    this.description = description;
    this.permissionLevel = permissionLevel;
    this.type = type;
    this.data = new SlashCommandBuilder();
  };

  /**
   * Runs the command.
   * @async
   * @param interaction The Discord chat command interaction.
   */
  abstract execute(interaction: ChatInputCommandInteraction): Promise<void>;

  /**
   * Checks that the command permission level of the user that called the command
   * is sufficient for all specified parts of the command.
   * @param interaction The Discord chat command interaction.
   * @param userLevel The command permission level of the user that called the command.
   * @returns A result that states if command usage is allowed or denied.
   */
  confirmCommandAccess(
    interaction: ChatInputCommandInteraction,
    userLevel: CommandPermissionLevel
  ) {
    const accessResult = new CommandAccessResultBuilder();

    if (this.confirmCommandUsagePermissions(interaction, userLevel)) {
      accessResult.withAccess(true);
    };

    return accessResult.resolve();
  };

  /**
   * Checks that a user has enough permissions to call this command.
   * @param interaction The Discord chat command interaction.
   * @param userLevel The command permission level of the user that called the command.
   * @returns `true` if the user permission level is sufficient; otherwise, `false`.
   */
  protected confirmCommandUsagePermissions(
    interaction: ChatInputCommandInteraction,
    userLevel: CommandPermissionLevel
  ) {
    return interaction.commandName === this.name && userLevel >= this.permissionLevel;
  };
};

/**
 * Represents a base class for Discord bot commands using only options.
 * @abstract
 */
export abstract class OptionsDiscordBotCommand<O extends CommandOption> extends DiscordBotCommand {
  protected static readonly unknownCommandErrorMessage = 'Unknown or unimplemented command specified.';
  readonly options: ReadonlyArray<O>;

  constructor(
    name: string,
    description: string,
    options: ReadonlyArray<O>,
    permissionLevel = CommandPermissionLevel.Administrator,
    type = CommandType.Bot
  ) {
    super(name, description, permissionLevel, type);
    this.options = options;
    this.data
      .setName(name)
      .setDescription(description);
    buildSlashCommandOptions(this.data, options);
  };

  override confirmCommandAccess(interaction: ChatInputCommandInteraction, userLevel: CommandPermissionLevel) {
    const accessResult = new CommandAccessResultBuilder();

    if (this.confirmCommandUsagePermissions(interaction, userLevel)) {
      accessResult.withAccess(true);
      const deniedOptions = this.confirmCommandOptionPermissions(interaction, userLevel);
      if (deniedOptions.length) {
        accessResult.withDeniedOptions(...deniedOptions);
      };
    };

    return accessResult.resolve();
  };

  /**
   * Checks that a user has enough permissions to use this command's options.
   * @param interaction The Discord chat command interaction.
   * @param userLevel The command permission level of the user that called the command.
   * @returns An array of any denied options due to insufficient permissions. 
   */
  protected confirmCommandOptionPermissions(
    interaction: ChatInputCommandInteraction,
    userLevel: CommandPermissionLevel
  ) {
    const deniedOptions = [];
    for (const option of this.options) {
      const interactionOption = interaction.options.get(option.name);
      if (
        interactionOption
        && (option.permissionLevel ?? CommandPermissionLevel.Restricted) > userLevel
      ) {
        deniedOptions.push(option.name);
      };
    };
    return deniedOptions;
  };

  /**
   * Gets all command option values specified from a Discord chat command interaction.
   * @param interaction The Discord chat command interaction.
   * @returns All command options specified in the Discord chat command interaction.
   */
  protected getInteractionOptionValues(interaction: ChatInputCommandInteraction) {
    const cmdOptions = new Map<O['name'], CommandInteractionOption<CacheType>>();

    for (const option of this.options) {
      const interactionOption = interaction.options.get(option.name);
      if (interactionOption) {
        cmdOptions.set(option.name, interactionOption);
      };
    };
    return cmdOptions;
  };

  /**
   * Gets a command option value from a Discord chat command interaction if it was specified.
   * @param interaction The Discord chat command interaction.
   * @param optionName The name of option to return its value.
   * @returns The command option in the Discord chat command interaction if it was specified.
   */
  protected getInteractionOption(
    interaction: ChatInputCommandInteraction,
    optionName: O['name']
  ) {
    return interaction.options.get(optionName);
  };

  /**
   * Gets a required command option value from a Discord chat command interaction.
   * @param interaction The Discord chat command interaction.
   * @param optionName The name of option to return its value.
   * @returns The command option in the Discord chat command interaction.
   */
  protected getRequiredInteractionOption(
    interaction: ChatInputCommandInteraction,
    optionName: Extract<O, { required: true }>['name']
  ) {
    const interactionOption = this.getInteractionOption(interaction, optionName);
    if (interactionOption) {
      return interactionOption;
    };
    throw new Error(`Expected ${optionName} to be declared in the ${this.name} command but it was not.`);
  };
};

/**
 * Represents a base class for Discord bot commands using subcommands and subcommand groups.
 * @abstract
 */
export abstract class SubcommandsDiscordBotCommand<
  G extends SubcommandGroup | undefined,
  S extends Subcommand | undefined
> extends DiscordBotCommand {
  protected static readonly unknownCommandErrorMessage = 'Unknown or unimplemented command specified.';
  readonly groups?: ReadonlyArray<NonNullable<G>>;
  readonly subcommands?: ReadonlyArray<NonNullable<S>>;

  constructor(
    name: string,
    description: string,
    groups?: ReadonlyArray<NonNullable<G>>,
    subcommands?: ReadonlyArray<NonNullable<S>>,
    permissionLevel = CommandPermissionLevel.Administrator,
    type = CommandType.Bot
  ) {
    super(name, description, permissionLevel, type);
    this.groups = groups;
    this.subcommands = subcommands;
    this.data
      .setName(name)
      .setDescription(description);
    buildSlashCommandSubcommands(this.data, groups, subcommands);
  };
  
  override confirmCommandAccess(interaction: ChatInputCommandInteraction, userLevel: CommandPermissionLevel) {
    const accessResult = new CommandAccessResultBuilder();

    if (this.confirmCommandUsagePermissions(interaction, userLevel)) {
      accessResult.withAccess(true);
      const deniedValues = this.confirmCommandSubcommandPermissions(interaction, userLevel);
      if (deniedValues.deniedSubcommandGroup) {
        accessResult.withDeniedSubcommandGroup(deniedValues.deniedSubcommandGroup);
      };
      if (deniedValues.deniedSubcommand) {
        accessResult.withDeniedSubcommand(deniedValues.deniedSubcommand);
      };
      if (deniedValues.deniedOptions && deniedValues.deniedOptions.length) {
        accessResult.withDeniedOptions(...deniedValues.deniedOptions);
      };
    };

    return accessResult.resolve();
  };

  /**
   * Checks that a user has enough permissions to use a subcommand and its options.
   * @param interaction The Discord chat command interaction.
   * @param userLevel The command permission level of the user that called the command.
   * @returns An object that contains any denied command values due to insufficient permissions. 
   */
  protected confirmCommandSubcommandPermissions(
    interaction: ChatInputCommandInteraction,
    userLevel: CommandPermissionLevel
  ) {
    const deniedValues: {
      deniedSubcommandGroup?: string,
      deniedSubcommand?: string,
      deniedOptions?: string[]
    } = {};
    const groupName = interaction.options.getSubcommandGroup();
    const subcommandName = interaction.options.getSubcommand();
    let selectedSubcommand: Subcommand;

    if (groupName) {
      const group = this.groups?.find(group => group.name === groupName)!;
      if ((group.permissionLevel ?? CommandPermissionLevel.Restricted) > userLevel) {
        deniedValues.deniedSubcommandGroup = groupName;
        return deniedValues;
      };
      selectedSubcommand = group.subcommands.find(subcommand => subcommand.name === subcommandName)!;
    } else {
      selectedSubcommand = this.subcommands?.find(subcommand => subcommand.name === subcommandName)!;
    };
    
    if ((selectedSubcommand.permissionLevel ?? CommandPermissionLevel.Restricted) > userLevel) {
      deniedValues.deniedSubcommandGroup = groupName ?? undefined;
      deniedValues.deniedSubcommand = subcommandName;
      return deniedValues;
    };

    const deniedOptions = [];
    for (const option of selectedSubcommand.options ?? []) {
      const interactionOption = interaction.options.get(option.name);
      if (
        interactionOption
        && (option.permissionLevel ?? CommandPermissionLevel.Restricted) > userLevel
      ) {
        deniedOptions.push(option.name);
      };
    };
    deniedValues.deniedOptions = deniedOptions;

    return deniedValues;
  };

  protected getInteractionSubcommandGroupName(interaction: ChatInputCommandInteraction) {
    if (this.groups) {
      const groupName = interaction.options.getSubcommandGroup();
      if (groupName) {
        if (this.groups.some(group => group.name === groupName)) {
          return groupName as NonNullable<G>['name'];
        } else {
          throw new Error(`Unexpected subcommand group '${groupName}' declared in the ${this.name} command.`);
        };
      };
      return null;
    };
    throw new Error(`The ${this.name} command does not have any declared subcommand groups.`);
  };

  protected getInteractionSubcommandName(interaction: ChatInputCommandInteraction) {
    if (this.groups || this.subcommands) {
      const subcommandName = interaction.options.getSubcommand();
      if (subcommandName) {
        if (this.subcommands && this.subcommands.some(subcommand => subcommand.name === subcommandName)) {
          return subcommandName as NonNullable<S>['name'];
        } else if (
          this.groups
          && this.groups.some(group => group.subcommands.some(subcommand => subcommand.name === subcommandName))
        ) {
          return subcommandName as NonNullable<G>['subcommands'][number]['name'];
        } else {
          throw new Error(`Unexpected subcommand '${subcommandName}' declared in the ${this.name} command.`);
        };
      };
      return null;
    };
    throw new Error(`The ${this.name} command does not have any declared subcommands or subcommand groups.`);
  };

  /**
   * Gets all subcommand group option values from a Discord chat command interaction.
   * @param interaction The Discord chat command interaction.
   * @param groupName The name of the subcommand group.
   * @param subcommandName The name of the subcommand under the subcommand group.
   * @returns All command options specified in the Discord chat command interaction.
   */
  protected getInteractionSubcommandGroupSubcommandOptions<
    GName extends NonNullable<G>['name'],
    SName extends Extract<NonNullable<G>, { name: GName }>['subcommands'][number]['name']
  >(
    interaction: ChatInputCommandInteraction,
    groupName: GName,
    subcommandName: SName
  ) {
    const interactionOptions = new Map<
      NonNullable<
        Extract<Extract<NonNullable<G>, { name: GName }>['subcommands'][number], { name: SName }>['options']
      >[number]['name'],
      CommandInteractionOption<CacheType>
    >();

    const group = this.groups?.find(group => group.name === groupName)!;
    const subcommand = group.subcommands.find(subcommand => subcommand.name === subcommandName)!;
    for (const option of subcommand.options ?? []) {
      const interactionOption = interaction.options.get(option.name);
      if (interactionOption) {
        interactionOptions.set(
          option.name,
          interactionOption
        );
      };
    };

    return interactionOptions;
  };

  /**
   * Gets all subcommand option values from a Discord chat command interaction.
   * @param interaction The Discord chat command interaction.
   * @param subcommandName The name of the subcommand under the Discord slash command.
   * @returns All command options specified in the Discord chat command interaction.
   */
  protected getInteractionSubcommandOptions<
    SName extends NonNullable<S>['name']
  >(
    interaction: ChatInputCommandInteraction,
    subcommandName: SName
  ) {
    const interactionOptions = new Map<
      NonNullable<Extract<NonNullable<S>, { name: SName }>['options']>[number]['name'],
      CommandInteractionOption<CacheType>
    >();

    const subcommand = this.subcommands?.find(subcommand => subcommand.name === subcommandName)!;
    for (const option of subcommand.options ?? []) {
      const interactionOption = interaction.options.get(option.name);
      if (interactionOption) {
        interactionOptions.set(option.name, interactionOption);
      };
    };

    return interactionOptions;
  };

  /**
   * Gets a command option value from a Discord chat command interaction if it was specified.
   * @param interaction The Discord chat command interaction.
   * @param optionName The name of option to return its value.
   * @returns The command option in the Discord chat command interaction if it was specified.
   */
  protected getInteractionOption(
    interaction: ChatInputCommandInteraction,
    optionName: NonNullable<
      | NonNullable<G>['subcommands'][number]['options']
      | NonNullable<S>['options']
    >[number]['name'],
    required = false
  ) {
    return interaction.options.get(optionName!.toString(), required);
  };

  /**
   * Gets a required command option value from a Discord chat command interaction.
   * @param interaction The Discord chat command interaction.
   * @param optionName The name of option to return its value.
   * @returns The command option in the Discord chat command interaction.
   */
  protected getRequiredInteractionOption(
    interaction: ChatInputCommandInteraction,
    optionName: Extract<
      NonNullable<
        | NonNullable<G>['subcommands'][number]['options']
        | NonNullable<S>['options']
      >[number],
      { required: true }
    >['name']
  ) {
    const interactionOption = this.getInteractionOption(interaction, optionName);
    if (interactionOption) {
      return interactionOption;
    };
    throw new Error(`Expected ${optionName} to be declared in the ${this.name} command but it was not.`);
  };
};