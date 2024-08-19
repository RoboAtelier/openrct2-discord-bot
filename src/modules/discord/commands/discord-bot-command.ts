import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  CommandInteractionOption,
  CacheType
} from 'discord.js';
import { 
  buildSlashCommandOptions,
  buildSlashCommandSubcommands,
  CommandAccessResult,
  CommandAccessResultBuilder,
  CommandOption,
  CommandPermissionLevel,
  CommandType,
  Subcommand,
  SubcommandGroup
} from '@modules/discord/commands/index.js';

/**
 * Represents a base class for Discord bot commands.
 * @abstract
 */
export abstract class DiscordBotCommand {
  protected static readonly unknownCommandErrorMessage = 'Unknown or unimplemented command specified.';

  /** The maximum number of entries to return from a command result array section. */
  protected static readonly resultSetElementsLimit = 10;

  /** Gets the Discord slash command configuration data. */
  readonly data = new SlashCommandBuilder();

  constructor(
    /** Gets the name of this bot command. */
    public readonly name: string,

    /** Gets the description about this bot command. */
    public readonly description: string,

    /** Gets the required permission level to execute this command. */
    public readonly permissionLevel = CommandPermissionLevel.Administrator,

    /** Gets the type of this bot command. */
    public readonly type = CommandType.Bot
  ) { };

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
  abstract confirmCommandAccess(
    interaction: ChatInputCommandInteraction,
    userLevel: CommandPermissionLevel
  ): CommandAccessResult;
};

/**
 * Represents a base class for Discord bot commands using only options.
 * @abstract
 */
export abstract class OptionsDiscordBotCommand<O extends CommandOption> extends DiscordBotCommand {
  constructor(
    name: string,
    description: string,

    /** Gets the specified command options. */
    public readonly options: ReadonlyArray<O>,

    permissionLevel = CommandPermissionLevel.Administrator,
    type = CommandType.Bot
  ) {
    super(name, description, permissionLevel, type);
    this.data
      .setName(name)
      .setDescription(description);
    buildSlashCommandOptions(this.data, options);
  };

  override confirmCommandAccess(interaction: ChatInputCommandInteraction, userLevel: CommandPermissionLevel) {
    return this.confirmCommandOptionPermissions(interaction, userLevel).resolve();
  };

  /**
   * Checks that a user has enough permissions to use this command's options.
   * @param interaction The Discord chat command interaction.
   * @param userLevel The command permission level of the user that called the command.
   * @returns A command access result.
   */
  protected confirmCommandOptionPermissions(
    interaction: ChatInputCommandInteraction,
    userLevel: CommandPermissionLevel
  ) {
    const accessResult = new CommandAccessResultBuilder();
    
    if (interaction.commandName !== this.name) {
      return accessResult.withAccess(false);
    };

    const selectedOptions = this.options.filter(option => interaction.options.get(option.name) != null);
    if (selectedOptions.length) {
      for (const option of selectedOptions) {
        if ((option.permissionLevel ?? this.permissionLevel) > userLevel) {
          accessResult.withDeniedOptions(option.name);
        };
      };
      accessResult.withAccess(true);
    } else {
      accessResult.withAccess(this.permissionLevel <= userLevel);
    };

    return accessResult;
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
  constructor(
    name: string,
    description: string,

    /** Gets the specified subcommand groups. */
    public readonly groups?: ReadonlyArray<NonNullable<G>>,

    /** Gets the specified subcommands. */
    public readonly subcommands?: ReadonlyArray<NonNullable<S>>,

    permissionLevel = CommandPermissionLevel.Administrator,
    type = CommandType.Bot
  ) {
    super(name, description, permissionLevel, type);
    this.data
      .setName(name)
      .setDescription(description);
    buildSlashCommandSubcommands(this.data, groups, subcommands);
  };
  
  override confirmCommandAccess(interaction: ChatInputCommandInteraction, userLevel: CommandPermissionLevel) {
    return this.confirmCommandSubcommandPermissions(interaction, userLevel).resolve();
  };

  /**
   * Checks that a user has enough permissions to use a subcommand and its options.
   * @param interaction The Discord chat command interaction.
   * @param userLevel The command permission level of the user that called the command.
   * @returns A command access result.
   */
  protected confirmCommandSubcommandPermissions(
    interaction: ChatInputCommandInteraction,
    userLevel: CommandPermissionLevel
  ) {
    const accessResult = new CommandAccessResultBuilder();

    if (interaction.commandName !== this.name) {
      return accessResult.withAccess(false);
    };

    const groupName = interaction.options.getSubcommandGroup();
    const subcommandName = interaction.options.getSubcommand();
    let selectedGroup: SubcommandGroup | undefined;
    let selectedSubcommand: Subcommand | undefined;

    if (groupName) {
      selectedGroup = this.groups?.find(group => group.name === groupName);
      if (!selectedGroup) {
        throw new Error('An invalid command group was specified.');
      };
      selectedSubcommand = selectedGroup.subcommands.find(subcommand => subcommand.name === subcommandName);
    } else {
      selectedSubcommand = this.subcommands?.find(subcommand => subcommand.name === subcommandName);
    };
    if (!selectedSubcommand) {
      throw new Error('An invalid command subcommand was specified.');
    };

    accessResult.withAccess(true);
    if (selectedSubcommand.options?.length) {
      const selectedOptions = selectedSubcommand.options.filter(option => interaction.options.get(option.name) != null);
      if (selectedOptions.length) {
        for (const option of selectedSubcommand.options) {
          if (
            (
              option.permissionLevel
              ?? selectedSubcommand.permissionLevel
              ?? selectedGroup?.permissionLevel
              ?? this.permissionLevel
            ) > userLevel
          ) {
            accessResult.withDeniedOptions(option.name);
          };
        };
        return accessResult;
      };
    };
    if (selectedSubcommand.permissionLevel && selectedSubcommand.permissionLevel > userLevel) {
      accessResult.withDeniedSubcommand(subcommandName);
    } else if (selectedGroup?.permissionLevel && selectedGroup.permissionLevel > userLevel) {
      accessResult.withDeniedSubcommand(selectedGroup.name);
    } else if (this.permissionLevel > userLevel) {
      accessResult.withAccess(false);
    };

    return accessResult;
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