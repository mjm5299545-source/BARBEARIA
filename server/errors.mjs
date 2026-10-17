export class ConfigurationError extends Error {
  constructor(message = 'Conecte o projeto Supabase exclusivo da Grecco e configure DATABASE_URL.') {
    super(message); this.code = 'SETUP_REQUIRED'; this.status = 503;
  }
}
