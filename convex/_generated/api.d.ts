/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin_index from "../admin/index.js";
import type * as auth from "../auth.js";
import type * as clients from "../clients.js";
import type * as commissions_index from "../commissions/index.js";
import type * as companies_directory from "../companies/directory.js";
import type * as companies_index from "../companies/index.js";
import type * as companyVerification_index from "../companyVerification/index.js";
import type * as deals_index from "../deals/index.js";
import type * as dev_seedCompanies from "../dev/seedCompanies.js";
import type * as http from "../http.js";
import type * as invitations_index from "../invitations/index.js";
import type * as lib_accountFoundation from "../lib/accountFoundation.js";
import type * as lib_authSecurity from "../lib/authSecurity.js";
import type * as lib_constants from "../lib/constants.js";
import type * as messages_index from "../messages/index.js";
import type * as notifications_index from "../notifications/index.js";
import type * as portfolio_index from "../portfolio/index.js";
import type * as projects_access from "../projects/access.js";
import type * as projects_constants from "../projects/constants.js";
import type * as projects_index from "../projects/index.js";
import type * as projects_media from "../projects/media.js";
import type * as projects_mediaModel from "../projects/mediaModel.js";
import type * as projects_state from "../projects/state.js";
import type * as proposals_index from "../proposals/index.js";
import type * as reviews_index from "../reviews/index.js";
import type * as siteVisits_index from "../siteVisits/index.js";
import type * as storage_constants from "../storage/constants.js";
import type * as storage_publicMedia from "../storage/publicMedia.js";
import type * as storage_publicMediaModel from "../storage/publicMediaModel.js";
import type * as storage_publicUrl from "../storage/publicUrl.js";
import type * as storage_r2 from "../storage/r2.js";
import type * as storage_r2Client from "../storage/r2Client.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "admin/index": typeof admin_index;
  auth: typeof auth;
  clients: typeof clients;
  "commissions/index": typeof commissions_index;
  "companies/directory": typeof companies_directory;
  "companies/index": typeof companies_index;
  "companyVerification/index": typeof companyVerification_index;
  "deals/index": typeof deals_index;
  "dev/seedCompanies": typeof dev_seedCompanies;
  http: typeof http;
  "invitations/index": typeof invitations_index;
  "lib/accountFoundation": typeof lib_accountFoundation;
  "lib/authSecurity": typeof lib_authSecurity;
  "lib/constants": typeof lib_constants;
  "messages/index": typeof messages_index;
  "notifications/index": typeof notifications_index;
  "portfolio/index": typeof portfolio_index;
  "projects/access": typeof projects_access;
  "projects/constants": typeof projects_constants;
  "projects/index": typeof projects_index;
  "projects/media": typeof projects_media;
  "projects/mediaModel": typeof projects_mediaModel;
  "projects/state": typeof projects_state;
  "proposals/index": typeof proposals_index;
  "reviews/index": typeof reviews_index;
  "siteVisits/index": typeof siteVisits_index;
  "storage/constants": typeof storage_constants;
  "storage/publicMedia": typeof storage_publicMedia;
  "storage/publicMediaModel": typeof storage_publicMediaModel;
  "storage/publicUrl": typeof storage_publicUrl;
  "storage/r2": typeof storage_r2;
  "storage/r2Client": typeof storage_r2Client;
  users: typeof users;
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
