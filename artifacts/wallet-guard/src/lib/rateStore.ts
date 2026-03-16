let _usdCopRate: number | null = null;
const _listeners = new Set<(rate: number) => void>();

export function getUsdCopRate(): number | null {
  return _usdCopRate;
}

export function setUsdCopRate(rate: number): void {
  _usdCopRate = rate;
  _listeners.forEach(fn => fn(rate));
}

export function subscribeUsdCopRate(fn: (rate: number) => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
