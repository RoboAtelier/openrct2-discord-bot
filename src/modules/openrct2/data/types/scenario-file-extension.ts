/** Represents a valid RollerCoaster Tycoon scenario file extension. */
export type ScenarioFileExtension = typeof ScenarioFileExtensionArray[number];
export const ScenarioFileExtensionArray = <const>['.sc4', '.sv4', '.sc6', '.sv6', '.park'];

/** Represents a valid RollerCoaster Tycoon scenario save file extension. */
export type ScenarioSaveFileExtension = typeof ScenarioSaveFileExtensionArray[number];
export const ScenarioSaveFileExtensionArray = <const>['.sv4', '.sv6', '.park'];