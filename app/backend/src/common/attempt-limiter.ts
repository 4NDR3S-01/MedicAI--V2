/**
 * Cuenta intentos por clave (correo, usuario…) en una ventana deslizante, en
 * memoria. El backend corre como un único proceso (pm2 fork), así que basta;
 * si se reinicia, los contadores empiezan de cero, lo que es aceptable para
 * límites de minutos.
 */
export class AttemptLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 10_000,
  ) {}

  /** Milisegundos que faltan para poder intentarlo; 0 si se puede ya. No cuenta como intento. */
  retryAfterMs(key: string): number {
    const recent = this.recent(key);
    if (recent.length < this.max) return 0;
    return Math.max(1, recent[recent.length - this.max] + this.windowMs - this.now());
  }

  record(key: string) {
    const recent = this.recent(key);
    recent.push(this.now());
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) this.prune();
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  private recent(key: string) {
    const since = this.now() - this.windowMs;
    return (this.hits.get(key) ?? []).filter((time) => time > since);
  }

  private prune() {
    const since = this.now() - this.windowMs;
    for (const [key, times] of this.hits) {
      if (!times.some((time) => time > since)) this.hits.delete(key);
    }
    // Si aún hay demasiadas claves activas, se descartan las más antiguas.
    for (const key of this.hits.keys()) {
      if (this.hits.size <= this.maxKeys) break;
      this.hits.delete(key);
    }
  }
}
