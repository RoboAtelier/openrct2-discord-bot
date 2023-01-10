/**
 * Indicates whether two strings are equal, ignoring letter casing.
 * @param str1 Initial comparison string.
 * @param str2 Other string to compare with.
 * @returns `true` if equal; otherwise, `false`
 */
export function areStringsEqualCaseInsensitive(str1: string, str2: string) {
  if (typeof str1 !== 'string' || typeof str2 !== 'string') {
    throw new Error('A non-string object was passed.');
  };
  return (str1.toUpperCase() === str2.toUpperCase());
};

/**
 * Indicates whether the specified string is null, empty or undefined.
 * @param str The string to test.
 * @returns `true` if `null` or empty; otherwise, `false`
 */
export function isStringNullOrEmpty(str: string | null | undefined) {
  if (str === undefined || str === null) {
    return true;
  } else if (typeof str !== 'string') {
    throw new Error('A non-string object was passed.');
  };
  return (0 === str.length);
};

/**
 * Indicates whether the specified string is null, empty, whitespace, or undefined.
 * @param str The string to test.
 * @returns `true` if `null`, empty, or whitespace was found; otherwise, `false`
 */
export function isStringNullOrWhiteSpace(str: string | null | undefined) {
  if (str === undefined || str === null) {
    return true;
  } else if (typeof str !== 'string') {
    throw new Error('A non-string object was passed.');
  };
  return (0 === str.trim().length);
};

/**
 * Indicates if a string contains characters that are not allowed
 * on file names on common operating systems.
 * @param str The string to check.
 * @returns `true` if illegal characters were found; otherwise, `false`
 */
export function containsIllegalFileNameChars(str: string) {
  const scrubbedStr = str.replace(/[/\\?%*:|"<>]/g, '');
  return scrubbedStr.length !== str.length;
};

/**
 * Indicates if a string contains characters that are not allowed
 * on directory names or paths on common operating systems.
 * @param str The string to check.
 * @returns `true` if illegal characters were found; otherwise, `false`
 */
export function containsIllegalPathChars(str: string) {
  const scrubbedStr = str.replace(/[?%*|"<>]/g, '');
  return scrubbedStr.length !== str.length;
};

/**
 * Indicates whether the specified string can be a valid file name.
 * @param str The string to test.
 * @returns `true` if the string is valid; otherwise, `false`
 */
export function isStringValidForFileName(str: string) {
  if (
    containsIllegalFileNameChars(str)
    || str.endsWith('.')
    || str.trim().length !== str.length
  ) {
    return false;
  };
  return true;
};

/**
 * Indicates whether the specified string can be a valid file system path or path name.
 * @param str The string to test.
 * @returns `true` if the string is valid; otherwise, `false`
 */
export function isStringValidForDirPath(str: string) {
  if (
    containsIllegalPathChars(str)
    || str.endsWith('.')
    || str.trim().length !== str.length
  ) {
    return false;
  };
  return true;
};

/**
 * Creates a file-name-safe timestamp string on function call with both the date and time.
 * @returns A date-time string of the following format: `yyyyMMdd_HHmmss`
 */
export function createDateTimestamp() {
  const now = new Date();
  const date = `${now.getUTCFullYear()}${now.getUTCMonth()}${now.getUTCDate()}`;
  const time = `${now.getUTCHours()}${now.getUTCMinutes()}${now.getUTCSeconds()}`;
  return `${date}_${time}`;
};