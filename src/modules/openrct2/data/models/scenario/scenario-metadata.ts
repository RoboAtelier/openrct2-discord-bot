import { SerializableToArray } from '@modules/io';

/** Represents supplemental data about a RollerCoaster Tycoon scenario exclusive to this bot. */
export class ScenarioMetadata extends SerializableToArray<ScenarioMetadata> {
  constructor(
    /** Gets the file name of this scenario. */
    public readonly fileName = '',

    /** Gets or sets this scenario's metadata tags. */
    public tags: string[] = [],

    /** Gets or sets the number of times this scenario was played. */
    public plays = 0,

    /** Gets or sets the number of wins on this scenario. */
    public wins = 0,

    /** Gets or sets the number of losses on this scenario. */
    public losses = 0,

    /** Gets or sets a value specifying if the scenario is available for use. */
    public active = true
  ) {
    super();
  };

  fromDataString(dataStr: string) {
    const json = JSON.parse(dataStr);
    if (this.isPartialType(json)) {
      const defaultObj = { ...new ScenarioMetadata() } as any;
      const objProperties = Object.getOwnPropertyNames(defaultObj);
      for (const property of objProperties) {
        if (json[property] !== undefined) {
          defaultObj[property] = json[property];
        };
      };
      return new ScenarioMetadata(...(Object.values(defaultObj) as any[]));
    };
    throw new Error(`The data could not be converted to '${ScenarioMetadata.name}'.`);
  };

  fromDataArrayString(dataStr: string) {
    const json = JSON.parse(dataStr);
    if (Array.isArray(json)) {
      const requestedObjArray = json.map(jsonElement => {
        if (this.isPartialType(jsonElement)) {
          const defaultObj = { ...new ScenarioMetadata() } as any;
          const objProperties = Object.getOwnPropertyNames(defaultObj);
          for (const property of objProperties) {
            if (jsonElement[property] !== undefined) {
              defaultObj[property] = jsonElement[property];
            };
          };
          return new ScenarioMetadata(...(Object.values(defaultObj) as any[]));
        };
        throw new Error(`An array element could not be converted to '${ScenarioMetadata.name}'.`);
      });
      return requestedObjArray;
    };
    throw new Error(`The data could not be converted to an array of '${ScenarioMetadata.name}' objects.`);
  };

  toDataString() {
    return JSON.stringify(this, null, 2);
  };

  toDataArrayString(dataArray: ScenarioMetadata[]) {
    return JSON.stringify(dataArray, null, 2);
  };
};