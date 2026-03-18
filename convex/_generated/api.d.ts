/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as boardData from "../boardData.js";
import type * as chat from "../chat.js";
import type * as dashboard from "../dashboard.js";
import type * as kanbanAdmin from "../kanbanAdmin.js";
import type * as lib from "../lib.js";
import type * as mirror from "../mirror.js";
import type * as notifications from "../notifications.js";
import type * as projects from "../projects.js";
import type * as projectsAdmin from "../projectsAdmin.js";
import type * as pushAdmin from "../pushAdmin.js";
import type * as settings from "../settings.js";
import type * as tasks from "../tasks.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  boardData: typeof boardData;
  chat: typeof chat;
  dashboard: typeof dashboard;
  kanbanAdmin: typeof kanbanAdmin;
  lib: typeof lib;
  mirror: typeof mirror;
  notifications: typeof notifications;
  projects: typeof projects;
  projectsAdmin: typeof projectsAdmin;
  pushAdmin: typeof pushAdmin;
  settings: typeof settings;
  tasks: typeof tasks;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
