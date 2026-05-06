const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

function withNetworkSecurityXml(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const resDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      fs.mkdirSync(resDir, { recursive: true });
      fs.writeFileSync(path.join(resDir, 'network_security_config.xml'), XML, 'utf-8');
      return cfg;
    },
  ]);
}

function withNetworkSecurityManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) {
      app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
      app.$['android:usesCleartextTraffic'] = 'true';
    }
    return cfg;
  });
}

module.exports = (config) => {
  config = withNetworkSecurityXml(config);
  config = withNetworkSecurityManifest(config);
  return config;
};
