import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { servePdf } from "./finalQuotes/download";
import { serveAttachment } from "./messages/download";

import { uploadDocument, downloadDocument, uploadDocumentPreflight, downloadDocumentPreflight } from "./companyVerification/index";

const http = httpRouter();
http.route({ path: "/company-verification/upload", method: "OPTIONS", handler: uploadDocumentPreflight });
http.route({ pathPrefix: "/company-verification/documents/", method: "OPTIONS", handler: downloadDocumentPreflight });
http.route({ path: "/company-verification/upload", method: "POST", handler: uploadDocument });
http.route({ pathPrefix: "/company-verification/documents/", method: "GET", handler: downloadDocument });

auth.addHttpRoutes(http);

http.route({
  pathPrefix: "/final-quotes/pdf/",
  method: "GET",
  handler: servePdf,
});

http.route({
  pathPrefix: "/messages/attachments/",
  method: "GET",
  handler: serveAttachment,
});

export default http;
