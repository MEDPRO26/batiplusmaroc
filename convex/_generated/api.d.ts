/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin_access from "../admin/access.js";
import type * as admin_bootstrap from "../admin/bootstrap.js";
import type * as admin_index from "../admin/index.js";
import type * as admin_projects from "../admin/projects.js";
import type * as admin_siteVisits from "../admin/siteVisits.js";
import type * as admin_verification from "../admin/verification.js";
import type * as auth from "../auth.js";
import type * as clientAvatarMedia from "../clientAvatarMedia.js";
import type * as clientAvatarMediaModel from "../clientAvatarMediaModel.js";
import type * as clients from "../clients.js";
import type * as commissions_index from "../commissions/index.js";
import type * as companies_access from "../companies/access.js";
import type * as companies_directory from "../companies/directory.js";
import type * as companies_index from "../companies/index.js";
import type * as companyVerification_index from "../companyVerification/index.js";
import type * as deals_index from "../deals/index.js";
import type * as dev_conversationRecovery from "../dev/conversationRecovery.js";
import type * as dev_seedCompanies from "../dev/seedCompanies.js";
import type * as dev_seedProjects from "../dev/seedProjects.js";
import type * as finalQuotes_download from "../finalQuotes/download.js";
import type * as finalQuotes_index from "../finalQuotes/index.js";
import type * as finalQuotes_state from "../finalQuotes/state.js";
import type * as http from "../http.js";
import type * as invitations_index from "../invitations/index.js";
import type * as lib_accountFoundation from "../lib/accountFoundation.js";
import type * as lib_authSecurity from "../lib/authSecurity.js";
import type * as lib_clientPublicShape from "../lib/clientPublicShape.js";
import type * as lib_constants from "../lib/constants.js";
import type * as marketplaceActivity_constants from "../marketplaceActivity/constants.js";
import type * as marketplaceActivity_model from "../marketplaceActivity/model.js";
import type * as messages_index from "../messages/index.js";
import type * as notifications_index from "../notifications/index.js";
import type * as portfolio_index from "../portfolio/index.js";
import type * as projects_access from "../projects/access.js";
import type * as projects_constants from "../projects/constants.js";
import type * as projects_index from "../projects/index.js";
import type * as projects_marketplace from "../projects/marketplace.js";
import type * as projects_marketplaceSearch from "../projects/marketplaceSearch.js";
import type * as projects_media from "../projects/media.js";
import type * as projects_mediaModel from "../projects/mediaModel.js";
import type * as projects_state from "../projects/state.js";
import type * as proposals_index from "../proposals/index.js";
import type * as quotes_index from "../quotes/index.js";
import type * as quotes_state from "../quotes/state.js";
import type * as reviews_index from "../reviews/index.js";
import type * as seo_access from "../seo/access.js";
import type * as seo_accounts from "../seo/accounts.js";
import type * as seo_content from "../seo/content.js";
import type * as seo_index from "../seo/index.js";
import type * as seo_media from "../seo/media.js";
import type * as seo_mediaConstants from "../seo/mediaConstants.js";
import type * as seo_mediaModel from "../seo/mediaModel.js";
import type * as seo_model from "../seo/model.js";
import type * as seo_pageRegistry from "../seo/pageRegistry.js";
import type * as seo_public from "../seo/public.js";
import type * as seo_validators from "../seo/validators.js";
import type * as siteVisits_index from "../siteVisits/index.js";
import type * as siteVisits_state from "../siteVisits/state.js";
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
  "admin/access": typeof admin_access;
  "admin/bootstrap": typeof admin_bootstrap;
  "admin/index": typeof admin_index;
  "admin/projects": typeof admin_projects;
  "admin/siteVisits": typeof admin_siteVisits;
  "admin/verification": typeof admin_verification;
  auth: typeof auth;
  clientAvatarMedia: typeof clientAvatarMedia;
  clientAvatarMediaModel: typeof clientAvatarMediaModel;
  clients: typeof clients;
  "commissions/index": typeof commissions_index;
  "companies/access": typeof companies_access;
  "companies/directory": typeof companies_directory;
  "companies/index": typeof companies_index;
  "companyVerification/index": typeof companyVerification_index;
  "deals/index": typeof deals_index;
  "dev/conversationRecovery": typeof dev_conversationRecovery;
  "dev/seedCompanies": typeof dev_seedCompanies;
  "dev/seedProjects": typeof dev_seedProjects;
  "finalQuotes/download": typeof finalQuotes_download;
  "finalQuotes/index": typeof finalQuotes_index;
  "finalQuotes/state": typeof finalQuotes_state;
  http: typeof http;
  "invitations/index": typeof invitations_index;
  "lib/accountFoundation": typeof lib_accountFoundation;
  "lib/authSecurity": typeof lib_authSecurity;
  "lib/clientPublicShape": typeof lib_clientPublicShape;
  "lib/constants": typeof lib_constants;
  "marketplaceActivity/constants": typeof marketplaceActivity_constants;
  "marketplaceActivity/model": typeof marketplaceActivity_model;
  "messages/index": typeof messages_index;
  "notifications/index": typeof notifications_index;
  "portfolio/index": typeof portfolio_index;
  "projects/access": typeof projects_access;
  "projects/constants": typeof projects_constants;
  "projects/index": typeof projects_index;
  "projects/marketplace": typeof projects_marketplace;
  "projects/marketplaceSearch": typeof projects_marketplaceSearch;
  "projects/media": typeof projects_media;
  "projects/mediaModel": typeof projects_mediaModel;
  "projects/state": typeof projects_state;
  "proposals/index": typeof proposals_index;
  "quotes/index": typeof quotes_index;
  "quotes/state": typeof quotes_state;
  "reviews/index": typeof reviews_index;
  "seo/access": typeof seo_access;
  "seo/accounts": typeof seo_accounts;
  "seo/content": typeof seo_content;
  "seo/index": typeof seo_index;
  "seo/media": typeof seo_media;
  "seo/mediaConstants": typeof seo_mediaConstants;
  "seo/mediaModel": typeof seo_mediaModel;
  "seo/model": typeof seo_model;
  "seo/pageRegistry": typeof seo_pageRegistry;
  "seo/public": typeof seo_public;
  "seo/validators": typeof seo_validators;
  "siteVisits/index": typeof siteVisits_index;
  "siteVisits/state": typeof siteVisits_state;
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
