import defineType from "./index";

defineType("File", {
  visitors: [ "chunk" ],
  builder: [ "chunk" ],
  aliases: [ "Scopable" ],
});

defineType("Chunk", {
  visitors: [ "body" ],
  builder: [ "body" ],
  aliases: [ "BlockStatement", "Scopable", "FunctionParent" ],
});

defineType("Identifier", {
  builder: [ "name", "isLocal" ],
  aliases: [ "Expression" ],
});

defineType("NumericLiteral", {
  builder: [ "value", "raw" ],
  aliases: [ "Expression", "Literal" ],
});

defineType("StringLiteral", {
  builder: [ "value", "raw" ],
  aliases: [ "Expression", "Literal" ],
});

defineType("BooleanLiteral", {
  builder: [ "value", "raw" ],
  aliases: [ "Expression", "Literal" ],
});

defineType("NilLiteral", {
  builder: [ "value", "raw" ],
  aliases: [ "Expression", "Literal" ],
});

defineType("VarargLiteral", {
  builder: [ "value", "raw" ],
  aliases: [ "Expression", "Literal" ],
});

defineType("TemplateStringLiteral", {
  visitors: [ "expressions" ],
  builder: [ "expressions" ],
  aliases: [ "Expression", "Literal", "Function" ]
});

defineType("SelfExpression", {
  aliases: [ "Expression" ]
});