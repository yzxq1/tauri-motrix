let generation = 0;
let external = false;

export const backendGeneration = () => generation;
export const isExternalBackend = () => external;
export function setExternalBackend(value: boolean) {
  external = value;
}
export function invalidateBackend() {
  generation += 1;
}
export function assertBackendGeneration(expected: number) {
  if (expected !== generation) throw new Error("RPC backend changed");
}
export function canAccessTaskFiles(task: { gid: string; remote?: boolean }) {
  return task.gid.startsWith("vortex:") || (!task.remote && !external);
}
export function remoteDownloadOptions<T extends { dir?: string }>(
  options: T,
): T {
  if (!external) return options;
  const copy = { ...options };
  delete copy.dir;
  return copy;
}
