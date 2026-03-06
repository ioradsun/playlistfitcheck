/**
 * Production logger — all methods are no-ops.
 * To re-enable debug logging, swap the implementations back to console.*.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */
export const logger = {
  log: (..._args: unknown[]): void => {},
  warn: (..._args: unknown[]): void => {},
  info: (..._args: unknown[]): void => {},
  debug: (..._args: unknown[]): void => {},
};
