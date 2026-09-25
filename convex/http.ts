import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { servePdf } from "./finalQuotes/download";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  pathPrefix: "/final-quotes/pdf/",
  method: "GET",
  handler: servePdf,
});

export default http;
