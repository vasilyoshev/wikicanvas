// Manual mock for @expo/vector-icons/MaterialIcons used in Jest tests.
// The real package requires expo-asset and expo-font which are not available
// in the Jest environment. This stub renders a plain React Native Text so that
// snapshot / render tests can exercise components that import Icon without
// needing a fully initialised Expo font loader.
const React = require("react");
const { Text } = require("react-native");

const MaterialIcons = React.forwardRef(function MaterialIcons({ name, testID, ...props }, ref) {
  return React.createElement(Text, { testID, ref, accessibilityLabel: name }, name);
});

MaterialIcons.displayName = "MaterialIcons";
MaterialIcons.getFontFamily = () => "MaterialIcons";
MaterialIcons.glyphMap = {};

module.exports = MaterialIcons;
module.exports.default = MaterialIcons;
