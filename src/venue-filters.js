export function shouldExcludeMeetup(filters, category, searchableText) {
  if (filters.excludedCategories.includes(category)) return true;
  const text = String(searchableText || '').toLocaleLowerCase();
  return filters.excludedTerms.some((term) => term && text.includes(term.toLocaleLowerCase()));
}
