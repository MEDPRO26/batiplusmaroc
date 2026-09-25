import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { servePdf } from "./finalQuotes/download";
import { serveAttachment } from "./messages/download";

const http = httpRouter();

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
