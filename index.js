'use strict';

const child_process = require("child_process");
const util = require("util");
const fs = require("fs-extra");
const tmp = require("tmp");
const path = require("path");


const LOADER_NAME = "loader";
const HANDLER_NAME = "handler";

const LOADER_TEMPLATE =
  `const FunctionShield = require('@puresec/function-shield');
FunctionShield.configure({
  policy: %j,
  token: process.env.FUNCTION_SHIELD_TOKEN,
  disable_analytics: %o
});
exports.${HANDLER_NAME} = require('%s').%s;
`;

const generateLoader = (inputs) => {
  let handlerParts = inputs.handler.split('.');
  let originalModulePath = handlerParts[0];
  let originalHandlerName = handlerParts[1];
  return util.format(LOADER_TEMPLATE, inputs.policy, inputs.disableAnalytics, originalModulePath, originalHandlerName);
};


const deploy = async (inputs, context) => {
  let tmpDir = tmp.dirSync();
  let originalRoot = inputs.root || ".";
  inputs.root = tmpDir.name;
  fs.copySync(originalRoot, inputs.root);

  child_process.execFileSync("npm", ["install", "--loglevel", "error", `@puresec/function-shield@${inputs.functionShieldVersion}`, "--no-save"], {cwd: inputs.root});

  let loaderStr = generateLoader(inputs);
  fs.writeFileSync(path.join(inputs.root, `${LOADER_NAME}.js`), loaderStr);
  inputs.handler = `${LOADER_NAME}.${HANDLER_NAME}`;
  inputs.env = inputs.env || {};
  inputs.env.FUNCTION_SHIELD_TOKEN = inputs.token;

  let awsLambdaComponent = await context.load("aws-lambda", "secureFunction", inputs);
  await awsLambdaComponent.deploy();

  context.saveState({deployed: true});
};

const remove = async (inputs, context) => {
  let awsLambdaComponent = await context.load("aws-lambda", "secureFunction", inputs);
  await awsLambdaComponent.remove();

  context.saveState();
};

module.exports = {
  deploy,
  remove
};
