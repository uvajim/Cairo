// Shared module-level cache for holdings + prices.
// Written by Overview (Portfolio) on every poll, read by Portfolio tab on mount.

export const holdingsCache: {
  address: string;
  holdings: Record<string, number>;
  prices: Record<string, number>;
} = {
  address:  "",
  holdings: {},
  prices:   {},
};
