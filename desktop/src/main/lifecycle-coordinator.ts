export interface LifecycleTicket<T> {
  generation: number
  target: T
}

type Waiter = {
  generation: number
  resolve: () => void
  reject: (error: unknown) => void
}

/** Serializes lifecycle work while coalescing every waiter onto the newest target. */
export class LatestWinsCoordinator<T> {
  private generation = 0
  private appliedGeneration = 0
  private desired: LifecycleTicket<T> | null = null
  private worker: Promise<void> | null = null
  private waiters: Waiter[] = []
  private readonly reconcile: (
    ticket: LifecycleTicket<T>,
    isCurrent: () => boolean,
  ) => Promise<void>

  constructor(
    reconcile: (ticket: LifecycleTicket<T>, isCurrent: () => boolean) => Promise<void>,
  ) {
    this.reconcile = reconcile
  }

  get desiredTarget(): T | null {
    return this.desired?.target ?? null
  }

  request(target: T): Promise<void> {
    const generation = ++this.generation
    this.desired = { generation, target }
    const result = new Promise<void>((resolve, reject) => {
      this.waiters.push({ generation, resolve, reject })
    })
    this.startWorker()
    return result
  }

  private startWorker(): void {
    if (this.worker) return
    this.worker = this.drain().finally(() => {
      this.worker = null
      if (this.desired && this.desired.generation > this.appliedGeneration) {
        this.startWorker()
      }
    })
  }

  private async drain(): Promise<void> {
    while (this.desired && this.desired.generation > this.appliedGeneration) {
      const ticket = this.desired
      const isCurrent = (): boolean => this.desired?.generation === ticket.generation
      try {
        await this.reconcile(ticket, isCurrent)
      } catch (error) {
        if (!isCurrent()) continue
        this.appliedGeneration = ticket.generation
        this.settleThrough(ticket.generation, error)
        return
      }
      if (!isCurrent()) continue
      this.appliedGeneration = ticket.generation
      this.settleThrough(ticket.generation)
    }
  }

  private settleThrough(generation: number, error?: unknown): void {
    const settled = this.waiters.filter((waiter) => waiter.generation <= generation)
    this.waiters = this.waiters.filter((waiter) => waiter.generation > generation)
    for (const waiter of settled) {
      if (error === undefined) waiter.resolve()
      else waiter.reject(error)
    }
  }
}
