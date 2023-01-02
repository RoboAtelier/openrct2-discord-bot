import { EOL } from 'os';

/** Represents a builder for a command result response message.*/
export class CommandResponseBuilder {
  private messageSegments: string[] = [];
  private errorSegments: string[] = [];

  /** Gets the command response message. */
  get message() {
    return this.messageSegments.join(EOL);
  };

  /** Gets the error message from a command result. */
  get error() {
    return this.errorSegments.join(EOL);
  };

  /** Gets a value specifying if an error message is present. */
  get hasError() {
    return this.errorSegments.length > 0;
  };

  /** 
   * Resolves the command response message.
   * This will return the error message first if there is one;
   * otherwise, it will return the response message.
   */
  resolve() {
    if (this.errorSegments.length > 0) {
      return this.error;
    };
    return this.message;
  };

  /**
   * Appends a message string to the command response message.
   * @param messageSegments - The message string(s) to add.
   */
  appendToMessage(...messageSegments: string[]) {
    this.messageSegments.push(...messageSegments);
  };

  /**
   * Appends a message string to the error message.
   * @param errorSegments - The error message string(s) to add.
   */
  appendToError(...errorSegments: string[]) {
    this.errorSegments.push(...errorSegments);
  };

  /** Wipes the current command response. */
  reset() {
    this.messageSegments = [];
    this.errorSegments = [];
  };
};