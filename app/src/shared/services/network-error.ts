/** Sin conexión (la petición no llegó al servidor): se puede reintentar más tarde. */
export class NetworkError extends Error {
  constructor() {
    super('No hemos podido conectar con nuestros servidores. Por favor verifica tu conexión a internet e inténtalo de nuevo en unos momentos.');
    this.name = 'NetworkError';
  }
}

export const isNetworkError = (error: unknown): error is NetworkError =>
  error instanceof NetworkError || (error instanceof Error && error.name === 'NetworkError');
