// يجمع الـ middleware والراوترات. التشغيل والاتصال بقاعدة البيانات في server.js
const express = require("express");
const cookieParser = require("cookie-parser");
const buildRouter = require("./routes");
const { securityHeaders, cors } = require("./middlewares/security");
const { notFound, errorHandler } = require("./middlewares/error");

function createApp({ bridge }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);          // Render يعمل خلف بروكسي HTTPS واحد
  app.use(securityHeaders);
  app.use(cors);
  app.use(cookieParser());
  app.use(buildRouter({ bridge }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
