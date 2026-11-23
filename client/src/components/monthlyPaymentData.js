export function selectedMonthlyAmounts(selected, defaultAmount) {
  return Object.entries(selected)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, override]) => [month, override === null ? defaultAmount : override]);
}
