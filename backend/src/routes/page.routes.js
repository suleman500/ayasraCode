const express = require("express");
const ctrl = require("../controllers/page.controller");
const { authRequired } = require("../middlewares/auth");

module.exports = (bridge) => {
  const router = express.Router();
  router.get("/healthz", ctrl.health);
  router.get("/login", ctrl.loginPage);
  router.get("/config.js", ctrl.configJs);
  router.get(["/", "/aysar.html"], authRequired, ctrl.indexPage(bridge));
  router.get("/sounds/:name", authRequired, ctrl.sounds);
  return router;
};
