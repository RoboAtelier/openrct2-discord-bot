/** Represents a supported file extension for precompiled OpenRCT2 builds. */
export type OpenRCT2BuildFileExtension = typeof OpenRCT2BuildFileExtensionArray[number];
export const OpenRCT2BuildFileExtensionArray = ['.zip', '.tar.gz'] as const;