module.exports = {
  ignorePatterns: ["dist/**/**.js"],
  env: {
    browser: true,
    es2021: true,
  },
  plugins: ["prettier"],
  extends: ["airbnb-base", "plugin:prettier/recommended"],
  overrides: [],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  rules: {
    "no-console": "off",
  },
};
