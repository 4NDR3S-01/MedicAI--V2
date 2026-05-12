type Listener = () => void;

let listeners: Listener[] = [];

export function onDoseAction(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function emitDoseAction(): void {
  listeners.forEach((fn) => fn());
}
