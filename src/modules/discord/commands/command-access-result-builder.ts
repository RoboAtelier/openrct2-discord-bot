export class CommandAccessResult {
  constructor(
    readonly canUseCommand: boolean,
    readonly deniedSubcommandGroup?: string,
    readonly deniedSubcommand?: string,
    readonly deniedOptions?: string[]
  ) { };

  get isSuccess() {
    return this.canUseCommand
      && !this.deniedSubcommandGroup
      && !this.deniedSubcommand
      && !(this.deniedOptions?.length)
  };
};

export class CommandAccessResultBuilder {
  private canUseCommand = false;
  private deniedSubcommandGroup?: string;
  private deniedSubcommand?: string;
  private deniedOptions?: string[];

  withAccess(access: boolean) {
    this.canUseCommand = access;
    return this;
  };

  withDeniedSubcommandGroup(groupName: string) {
    this.deniedSubcommandGroup = groupName;
    return this;
  };

  withDeniedSubcommand(subcommandName: string) {
    this.deniedSubcommand = subcommandName;
    return this;
  };

  withDeniedOptions(...optionNames: string[]) {
    if (!this.deniedOptions) {
      this.deniedOptions = [];
    };
    this.deniedOptions.push(...optionNames);
    return this;
  };

  resolve() {
    return new CommandAccessResult(
      this.canUseCommand,
      this.deniedSubcommandGroup,
      this.deniedSubcommand,
      this.deniedOptions
    );
  };
};