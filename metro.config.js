const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// punycode: Node.js 최신 버전에서 제거된 built-in 모듈.
// markdown-it(react-native-markdown-display 의존성)이 사용하므로 npm 패키지로 폴리필.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  punycode: require.resolve('punycode'),
}

module.exports = config
