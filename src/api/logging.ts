import winston from "winston";

export type LogFields = Record<string, string | number | boolean | undefined>;

const root = winston.createLogger({
  level: process.env.LOG_LEVEL?.trim() || "info",
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, component, ...rest }) => {
      const tag = component ? `[${component}] ` : "";
      const details = Object.entries(rest)
        .filter(([, value]) => value !== undefined && value !== "")
        .map(([key, value]) => `${key}=${value}`)
        .join(" ");
      const body = details ? `${message} ${details}` : message;
      return `${timestamp} ${level} ${tag}${body}`;
    }),
  ),
  transports: [new winston.transports.Console()],
});

/** Winston-backed logger scoped to a component (class) name. */
export class GatewayLogger {
  private readonly log: winston.Logger;

  constructor(component: string) {
    this.log = root.child({ component });
  }

  info(message: string, fields?: LogFields): void {
    this.log.info(message, fields ?? {});
  }

  error(message: string, fields?: LogFields): void {
    this.log.error(message, fields ?? {});
  }
}
