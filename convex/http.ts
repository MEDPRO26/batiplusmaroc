import * as companyCovers from "./companyCovers/http";
import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { servePdf } from "./finalQuotes/download";
import { serveAttachment } from "./messages/download";
import * as projectAttachments from "./projects/download";
import * as messageUploads from "./messages/upload";
import { uploadLogo, privatePreview, publicLogo, uploadPreflight, previewPreflight } from "./companyLogos/http";
import * as portfolioImages from "./portfolioImages/http";

import { uploadDocument, downloadDocument, uploadDocumentPreflight, downloadDocumentPreflight } from "./companyVerification/index";

const http = httpRouter();
http.route({ pathPrefix: "/projects/attachments/", method: "GET", handler: projectAttachments.serveAttachment });
http.route({ pathPrefix: "/projects/attachments/", method: "OPTIONS", handler: projectAttachments.downloadPreflight });
http.route({ path: "/messages/attachments/upload", method: "POST", handler: messageUploads.uploadAttachment });
http.route({ path: "/messages/attachments/upload", method: "OPTIONS", handler: messageUploads.uploadPreflight });
http.route({ path: "/portfolio-images/upload", method: "POST", handler: portfolioImages.uploadImage });
http.route({ path: "/portfolio-images/upload", method: "OPTIONS", handler: portfolioImages.uploadPreflight });
http.route({ pathPrefix: "/portfolio-images/private/", method: "GET", handler: portfolioImages.privatePreview });
http.route({ pathPrefix: "/portfolio-images/private/", method: "OPTIONS", handler: portfolioImages.previewPreflight });
http.route({ pathPrefix: "/portfolio-images/public/", method: "GET", handler: portfolioImages.publicImage });
http.route({ path: "/company-covers/upload", method: "POST", handler: companyCovers.uploadCover });
http.route({ path: "/company-covers/upload", method: "OPTIONS", handler: companyCovers.uploadPreflight });
http.route({ pathPrefix: "/company-covers/private/", method: "GET", handler: companyCovers.privatePreview });
http.route({ pathPrefix: "/company-covers/private/", method: "OPTIONS", handler: companyCovers.previewPreflight });
http.route({ pathPrefix: "/company-covers/public/", method: "GET", handler: companyCovers.publicCover });
http.route({ path: "/company-logos/upload", method: "POST", handler: uploadLogo });
http.route({ path: "/company-logos/upload", method: "OPTIONS", handler: uploadPreflight });
http.route({ pathPrefix: "/company-logos/private/", method: "GET", handler: privatePreview });
http.route({ pathPrefix: "/company-logos/private/", method: "OPTIONS", handler: previewPreflight });
http.route({ pathPrefix: "/company-logos/public/", method: "GET", handler: publicLogo });
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
