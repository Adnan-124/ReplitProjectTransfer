const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const fs = require("fs");

const config = getDefaultConfig(__dirname);

// Serve static HTML files from the web/ directory directly,
// bypassing Expo's SPA routing (which intercepts every path).
// e.g. GET /nitro-test.html → web/nitro-test.html
config.server = config.server || {};
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    const url = req.url.split("?")[0]; // strip query string
    if (url.endsWith(".html") && !url.includes("..")) {
      const filePath = path.join(__dirname, "web", url);
      if (fs.existsSync(filePath)) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.end(fs.readFileSync(filePath, "utf8"));
        return;
      }
    }
    return middleware(req, res, next);
  };
};

module.exports = config;
