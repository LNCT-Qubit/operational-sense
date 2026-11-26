export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

const ORDER = { debug: 10, info: 20, warn: 30, error: 40 } as const;

/** JSON-lines logger. Callers must never put transcripts, tokens or credentials in `meta`. */
export function createLogger(level: keyof typeof ORDER = 'info', sink: (line: string) => void = (l) => process.stdout.write(l + '\n')): Logger {
  const emit = (lvl: keyof typeof ORDER) => (msg: string, meta: Record<string, unknown> = {}) => {
    if (ORDER[lvl] < ORDER[level]) return;
    sink(JSON.stringify({ ts: new Date().toISOString(), level: lvl, msg, ...meta }));
  };
  return { debug: emit('debug'), info: emit('info'), warn: emit('warn'), error: emit('error') };
}

export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
