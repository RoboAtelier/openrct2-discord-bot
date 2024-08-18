import { SerializableToArray } from '@modules/io/index.js';

/** Represents supplemental data for grouping RollerCoaster Tycoon scenarios. */
export class ScenarioGroup extends SerializableToArray<ScenarioGroup> {
  constructor(
    /** Gets or sets the name of the scenario group. */
    public name = '',

    /** Gets or sets scenarios that are a part of this group. */
    public scenarios: string[] = []
  ) {
    super();
  };

  fromDataString(dataStr: string) {
    const json = JSON.parse(dataStr);
    if (this.isPartialType(json)) {
      const defaultObj = { ...new ScenarioGroup() } as any;
      const objProperties = Object.getOwnPropertyNames(defaultObj);
      for (const property of objProperties) {
        if (json[property] !== undefined) {
          defaultObj[property] = json[property];
        };
      };
      return new ScenarioGroup(...(Object.values(defaultObj) as any[]));
    };
    throw new Error(`The data could not be converted to '${ScenarioGroup.name}'.`);
  };

  fromDataArrayString(dataStr: string) {
    const json = JSON.parse(dataStr);
    if (Array.isArray(json)) {
      const requestedObjArray = json.map(jsonElement => {
        if (this.isPartialType(jsonElement)) {
          const defaultObj = { ...new ScenarioGroup() } as any;
          const objProperties = Object.getOwnPropertyNames(defaultObj);
          for (const property of objProperties) {
            if (jsonElement[property] !== undefined) {
              defaultObj[property] = jsonElement[property];
            };
          };
          return new ScenarioGroup(...(Object.values(defaultObj) as any[]));
        };
        throw new Error(`An array element could not be converted to '${ScenarioGroup.name}'.`);
      });
      return requestedObjArray;
    };
    throw new Error(`The data could not be converted to an array of '${ScenarioGroup.name}' objects.`);
  };

  toDataString() {
    return JSON.stringify(this, null, 2);
  };

  toDataArrayString(dataArray: ScenarioGroup[]) {
    return JSON.stringify(dataArray, null, 2);
  };
};