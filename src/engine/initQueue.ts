export async function withoutInitLimit<T>(fn: () => Promise<T>): Promise<T> {
  return fn();
}
