import { EOL } from 'os';
import { SerializableObject } from '@modules/io';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils';

/** Specifies a category name within the OpenRCT2 configuration file. */
export enum OpenRCT2GameConfigurationCategory {
  General = 'general',
  Interface = 'interface',
  Sound = 'sound',
  Network = 'network',
  Notifications = 'notifications',
  Font = 'font',
  Plugin = 'plugin'
};

/** 
 * Represents configuration settings for a OpenRCT2 game instance.
 * Every unique game instance will use configuration settings from their respective files.
 */
export class OpenRCT2GameConfiguration extends SerializableObject<OpenRCT2GameConfiguration> {

  /** Gets the underlying data of the configuration object. */
  readonly data: Map<string, Map<string, string | boolean | number>>;

  constructor() {
    super();
    this.data = new Map<string, Map<string, string | boolean | number>>();
    for (const category of Object.values(OpenRCT2GameConfigurationCategory)) {
      this.data.set(category, new Map<string, string | boolean | number>());
    };
  };

  /**
   * Gets a configuration value by category name and key.
   * @param category The configuration category of the configuration value.
   * @param key The configuration key that holds the configuration value.
   */
  getValue<T extends string | boolean | number>(
    category: OpenRCT2GameConfigurationCategory,
    key: string
  ) {
    const configCategorySet = this.data.get(category);
    if (configCategorySet === undefined) {
      throw new Error(`Configuration category '${category}' was missing.`);
    };

    const value = configCategorySet.get(key);
    if (value === undefined) {
      throw new Error('Specified configuration key is invalid.');
    };
    return value as T;
  };

  /**
   * Sets a new configuration value by category name and key.
   * @param category The configuration category of the configuration value.
   * @param key The configuration key that holds the configuration value.
   * @param newValue A new value for the configuration key.
   */
  setValue(
    category: OpenRCT2GameConfigurationCategory,
    key: string,
    newValue: string | boolean | number
  ) {
    const configCategorySet = this.data.get(category);
    if (configCategorySet === undefined) {
      throw new Error(`Configuration category '${category}' was missing.`);
    };
    
    const currentValue = configCategorySet.get(key);
    if (currentValue === undefined) {
      throw new Error('Specified configuration key is invalid.');
    } else if (typeof newValue !== typeof currentValue) {
      throw new Error(`Invalid value passed for configuration key '${key}'.`);
    } else if (typeof newValue === 'number') {
      if (newValue.toString().includes('.') && !currentValue.toString().includes('.')) {
        throw new Error(`Cannot set decimal value for configuration key '${key}'.`);
      } else if (!newValue.toString().includes('.') && currentValue.toString().includes('.')) {
        throw new Error(`Cannot set integer value for configuration key '${key}'.`);
      };
    } else if (
      typeof newValue === 'string'
      && typeof currentValue === 'string'
      && currentValue.includes('"')
    ) {
      if (!(newValue.startsWith('"') && newValue.endsWith('"'))) {
        configCategorySet.set(key, `"${newValue}"`);
        return;
      };
    };
    configCategorySet.set(key, newValue);
  };

  isMatchingType(obj: any): obj is OpenRCT2GameConfiguration {
    const thisObjProperties = Object.getOwnPropertyNames(this) as Array<keyof OpenRCT2GameConfiguration>;
    return thisObjProperties.every(property => {
      const thisPropertyType = typeof this[property];
      const otherPropertyType = typeof obj[property];
      if (thisPropertyType !== 'function') {
        return thisPropertyType === otherPropertyType;
      };
      return true;
    });
  };

  fromDataString(dataStr: string) {
    const newObj = new OpenRCT2GameConfiguration();
    const requiredCategories: string[] = Object.values(OpenRCT2GameConfigurationCategory);
    
    let currentCategory = requiredCategories[0];
    const dataLines = dataStr.split(EOL);
    for (const dataLine of dataLines) {
      if (dataLine.startsWith('[') && dataLine.endsWith(']')) {
        const matchedCategory = requiredCategories.find(category => {
          return dataLine.includes(category);
        });
        if (matchedCategory === undefined) {
          throw new Error(`Unknown configuration category found: ${dataLine}`);
        };
        currentCategory = matchedCategory;
      } else if (!isStringNullOrWhiteSpace(dataLine)) {
        if (!/\s=\s/.test(dataLine)) {
          throw new Error('Invalid data found during deserialization.');
        };

        const dataLineSplit = dataLine.split('=');
        const configKey = dataLineSplit[0].trim();
        const configValue = dataLineSplit[1].trim();
        const configCategorySet = newObj.data.get(currentCategory);
        if (configCategorySet === undefined) {
          throw new Error(`The configuration category '${currentCategory}' was missing.`);
        };

        if (configValue === 'true') {
          configCategorySet.set(configKey, true);
        } else if (configValue === 'false') {
          configCategorySet.set(configKey, false);
        } else if (new Number(configValue).toString() !== 'NaN') {
          if (configValue.includes('.')) {
            configCategorySet.set(configKey, parseFloat(configValue));
          } else {
            configCategorySet.set(configKey, parseInt(configValue));
          };
        } else {
          configCategorySet.set(configKey, configValue);
        };
      };
    };

    return newObj;
  };
  
  toDataString() {
    const dataArray = [];
    for (const configCategory of this.data.keys()) {
      dataArray.push(`[${configCategory}]`)
      for (const configKeyValue of this.data.get(configCategory)!.entries()) {
        dataArray.push(`${configKeyValue[0]} = ${configKeyValue[1]}`);
      };
      dataArray.push('');
    };
    return dataArray.join(EOL);
  };
};