const standardCategories = ['Monthly contribution', 'One-time special contribution'];

export function contributionCategories(categories) {
  const result = [...categories];
  for (const category of standardCategories) {
    if (!result.some((item) => item.toLowerCase() === category.toLowerCase())) result.push(category);
  }
  return result;
}
