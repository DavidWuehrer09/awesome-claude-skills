// Minimal structured logger (JSON lines on stdout/stderr). Never pass essay text or secrets.
type Fields = Record<string, unknown>;

function write(level: "info" | "warn" | "error", event: string, fields?: Fields) {
  if (process.env.LOG_LEVEL === "silent") return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};
