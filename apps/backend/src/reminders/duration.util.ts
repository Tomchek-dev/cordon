const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

// Accepts compact duration strings like "10m", "2h", "1d", or combined "1h30m".
// Returns null for anything that isn't strictly one of those (no partial matches).
export function parseDuration(input: string): number | null {
  const compact = input.trim().toLowerCase().replace(/\s+/g, '');
  if (!compact || !/^(\d+[smhd])+$/.test(compact)) {
    return null;
  }

  let total = 0;
  const re = /(\d+)([smhd])/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(compact))) {
    total += Number(match[1]) * UNIT_MS[match[2]];
  }
  return total > 0 ? total : null;
}
