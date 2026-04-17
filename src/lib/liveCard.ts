type Listener = () => void;

class LiveCard {
  private _id: string | null = null;
  private _listeners = new Set<Listener>();

  get id(): string | null {
    return this._id;
  }

  set(id: string | null): void {
    if (this._id === id) return;
    this._id = id;
    this._listeners.forEach((listener) => listener());
  }

  subscribe = (listener: Listener): (() => void) => {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  };

  getSnapshot = (): string | null => this._id;
}

export const liveCard = new LiveCard();
