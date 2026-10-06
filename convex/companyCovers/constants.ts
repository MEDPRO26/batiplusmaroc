import { logoContentTypeValidator, logoStatusValidator, LOGO_UPLOAD_TTL_MS } from "../companyLogos/constants";

export const coverStatusValidator = logoStatusValidator;
export const coverContentTypeValidator = logoContentTypeValidator;
export const COVER_UPLOAD_TTL_MS = LOGO_UPLOAD_TTL_MS;
export const COVER_HTTP_PREFIX = "/company-covers/";
