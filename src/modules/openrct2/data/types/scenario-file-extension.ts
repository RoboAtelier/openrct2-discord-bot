/** Represents a valid RollerCoaster Tycoon scenario file extension. */
export type ScenarioFileExtension = typeof ScenarioFileExtensionArray[number];
export const ScenarioFileExtensionArray = ['.sc4', '.sv4', '.sc6', '.sv6', '.park'] as const;

/** Represents a valid RollerCoaster Tycoon scenario save file extension. */
export type ScenarioSaveFileExtension = typeof ScenarioSaveFileExtensionArray[number];
export const ScenarioSaveFileExtensionArray = ['.sv4', '.sv6', '.park'] as const;