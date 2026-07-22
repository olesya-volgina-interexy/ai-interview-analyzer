export function getScore(analysis: unknown): number | undefined {
  return (analysis as any)?.score;
}

export function avg(scores: number[]): number | null {
  return scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;
}
