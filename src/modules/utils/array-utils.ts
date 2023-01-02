/**
 * Performs a Fisher-Yates shuffle on an array.
 * @param array The array to shuffle.
 */
export function fisherYatesShuffle<T>(array: T[]) {
  let currentIndex = array.length, randomIndex;

  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex--);
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }

  return array;
};

/**
 * Returns a section of an array by index,
 * including the calculated section index and total number of sections from the array.
 * @param array The array to section out.
 * @param arraySectionIndex 
 * The section index to start from on the result array.
 * The true array index is determined by the number of sections that the result array
 * can be divided into based on the `sectionElementsLimit` value.
 * @param sectionElementsLimit
 * The maximum number of entries to return from anarray section.
 * Default is 10 elements per section.
 * @returns 
 * The selected partition of the array,
 * the true section index,
 * and the total number of array sections calculated, 
 */
export function getArraySectionWithDetails<T>(
  array: T[],
  arraySectionIndex: number,
  sectionElementsLimit = 10
) {
  if (0 === array.length) {
    return { section: [], sectionIndex: 0, totalSections: 0 };
  };

  let selectedIndex = arraySectionIndex * sectionElementsLimit;
  if (selectedIndex < 0) {
    selectedIndex = 0;
  } else if (selectedIndex >= array.length) {
    const rem = array.length % sectionElementsLimit;
    if (0 === rem) {
      selectedIndex = array.length - sectionElementsLimit;
    } else {
      selectedIndex = array.length - rem;
    };
  };
  return {
    section: array.slice(selectedIndex, selectedIndex + sectionElementsLimit),
    sectionIndex: selectedIndex / sectionElementsLimit,
    totalSections: Math.ceil(array.length / sectionElementsLimit)
  };
};