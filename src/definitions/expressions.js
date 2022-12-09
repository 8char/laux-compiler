import defineType from "./index";

defineType("LogicalExpression", {
  visitors: [ "left", "right" ],
  builder: [ "operator", "left", "right" ],
  aliases: [ "Expression" ]
});

defineType("BinaryExpression", {
  visitors: [ "left", "right" ],
  builder: [ "operator", "left", "right" ],
  aliases: [ "Expression" ]
});

defineType("UnaryExpression", {
  visitors: [ "argument" ],
  builder: [ "operator", "argument" ],
  aliases: [ "Expression" ]
});

defineType("CallExpression", {
  visitors: [ "base", "arguments" ],
  builder: [ "base", "arguments" ],
  aliases: [ "Expression" ]
});

defineType("TableCallExpression", {
  visitors: [ "base", "arguments" ],
  builder: [ "base", "arguments" ],
  aliases: [ "Expression" ]
});

defineType("StringCallExpression", {
  visitors: [ "base", "argument" ],
  builder: [ "base", "argument" ],
  aliases: [ "Expression" ]
});

defineType("IndexExpression", {
  visitors: [ "base", "index" ],
  builder: [ "base", "index" ],
  aliases: [ "Expression" ]
});

defineType("MemberExpression", {
  visitors: [ "base", "identifier" ],
  builder: [ "base", "indexer", "identifier" ],
  aliases: [ "Expression" ]
});

defineType("SafeMemberExpression", {
  visitors: [ "base", "identifier", "index" ],
  builder: [ "base", "indexer", "identifier", "index" ],
  aliases: [ "Expression" ]
});

defineType("FunctionExpression", {
  visitors: [ "parameters", "body" ],
  builder: [ "parameters", "isLocal", "body" ],
  aliases: [ "Expression", "Scopable", "Declaration", "Function", "FunctionParent", "BlockStatement" ]
});

defineType("FatArrowExpression", {
  visitors: [ "parameters", "body" ],
  builder: [ "parameters", "body" ],
  aliases: [ "Expression", "Scopable", "Declaration", "Function", "FunctionParent", "BlockStatement" ]
});

defineType("ThinArrowExpression", {
  visitors: [ "parameters", "body" ],
  builder: [ "parameters", "body" ],
  aliases: [ "Expression", "Scopable", "Declaration", "Function", "FunctionParent", "BlockStatement" ]
});

defineType("TableConstructorExpression", {
  visitors: [ "fields" ],
  builder: [ "fields" ],
  aliases: [ "Expression" ]
});

defineType("TableKey", {
  visitors: [ "key", "value" ],
  builder: [ "key", "value" ],
  aliases: [ "Expression", "TableElement" ]
});

defineType("TableKeyString", {
  visitors: [ "key", "value" ],
  builder: [ "key", "value" ],
  aliases: [ "Expression", "TableElement" ]
});

defineType("TableValue", {
  visitors: [ "value" ],
  builder: [ "value" ],
  aliases: [ "Expression", "TableElement" ]
});

defineType("TableSpreadExpression", {
  visitors: [ "expression" ],
  builder: [ "expression" ],
  aliases: [ "Expression", "TableElement" ]
});

defineType("SpreadExpression", {
  visitors: [ "expression" ],
  builder: [ "expression" ],
  aliases: [ "Expression" ]
});

defineType("SuperExpression", {
  aliases: [ "Expression" ]
});
