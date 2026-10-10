type DataChangeListener = (path: string) => void;

const listeners = new Set<DataChangeListener>();

export function subscribeToDataChanges(listener: DataChangeListener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Successful HTTP writes, including writes outside React Query mutations. */
export function notifyDataChange(path: string) {
  for (const listener of listeners) listener(path);
}
