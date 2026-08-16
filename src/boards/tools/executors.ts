/**
 * Id to executor, and the one function every invocation surface calls.
 *
 * Its own module so the registry can stay pure data. The bar, the context menu
 * and a chat all end up here, and none of them should be importing the AI
 * client and a canvas directly just to run a tool the user picked.
 */

import { aiExecutor } from "./aiExecutor.js";
import { transformExecutor } from "./transformExecutor.js";
import type {
  ToolExecutor,
  ToolExecutorId,
  ToolInvocation,
  ToolOutcome,
} from "./types.js";

export const EXECUTORS: Record<ToolExecutorId, ToolExecutor> = {
  ai: aiExecutor,
  transform: transformExecutor,
};

export const resolveExecutor = (id: ToolExecutorId): ToolExecutor =>
  EXECUTORS[id];

/**
 * Runs a tool. The whole point of the spine, in one line.
 *
 * Like the executors it never throws: three surfaces call this, and a contract
 * where failure is sometimes a return value and sometimes an exception grows
 * three try/catches that eventually disagree.
 */
export const runTool = (invocation: ToolInvocation): Promise<ToolOutcome> =>
  resolveExecutor(invocation.tool.executor)(invocation);
