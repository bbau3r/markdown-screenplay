export type EventHandler<T> = (data: T) => void;

export class TypedEvent<T> {
  private handlers: EventHandler<T>[] = [];

  public on(handler: EventHandler<T>): void {
    this.handlers.push(handler);
  }

  public off(handler: EventHandler<T>): void {
    this.handlers = this.handlers.filter(h => h !== handler);
  }

  public emit(data: T): void {
    this.handlers.slice().forEach(h => h(data));
  }
}
