module.exports = ({ config }) => {
  const licenseServiceUrl =
    process.env.EXPO_PUBLIC_LICENSE_SERVICE_URL ||
    process.env.LICENSE_SERVICE_URL ||
    '';

  const {
    licenseServiceUrl: _licenseServiceUrl,
    licenseServiceEndpoint: _licenseServiceEndpoint,
    ...extra
  } = config.extra || {};

  return {
    ...config,
    extra: {
      ...extra,
      ...(licenseServiceUrl ? { licenseServiceEndpoint: encodeEndpoint(licenseServiceUrl) } : {}),
    },
  };
};

function encodeEndpoint(value) {
  return Array.from(value.trim()).map((char, index) => (
    char.charCodeAt(0) ^ endpointMask(index)
  ));
}

function endpointMask(index) {
  return (71 + index * 31) & 0xff;
}
