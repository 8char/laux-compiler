import chai from "chai";
import chaiSubset from "chai-subset";
import parser from "../../src/parser";

chai.use(chaiSubset);

let {expect} = chai;

export default {
  /**
   * Fat arrow expression parsing without body or parameters
   */
  fatExpression: function() {
      var ast = parser.parse("a = () => end");
      var statement = ast.chunk.body[0];
      var declaration = statement.init[0];

      expect(declaration).to.deep.equal({
        type: "FatArrowExpression",
        parameters: [],
        body: []
      });
  },

  /**
   * Fat arrow expression parsing with body
   */
  fatExpressionBody: function() {
      var ast = parser.parse("a = () => print('hi') end");
      var statement = ast.chunk.body[0];
      var declaration = statement.init[0];

      expect(declaration).to.containSubset({
        type: "FatArrowExpression",
        parameters: [],
        body: [{
          expression: {
            arguments: [{
              raw: "'hi'",
              type: "StringLiteral",
              value: "hi"
            }],
            base: {
              name: "print",
              type: "Identifier"
            },
            type: "CallExpression"
          },
          type: "CallStatement"
        }]
      });
  },

  /**
   * Thin arrow expression parsing without body or parameters,
   * Should generate output with self identifier as first parameters
   */
  thinExpression: function() {
      var ast = parser.parse("a = () -> end");
      var statement = ast.chunk.body[0];
      var declaration = statement.init[0];

      expect(declaration).to.containSubset({
        type: "ThinArrowExpression",
        parameters: [{
          type: "Identifier",
          name: "self"
        }],
        body: []
      });
  },
  /**
   * Thin arrow expression parsing with body,
   * Should generate output with self identifier as first parameters
   */
  thinExpressionBody: function() {
      var ast = parser.parse("a = () -> print('hi') end");
      var statement = ast.chunk.body[0];
      var declaration = statement.init[0];

      expect(declaration).to.containSubset({
        type: "ThinArrowExpression",
        parameters: [{
          type: "Identifier",
          name: "self"
        }],
        body: [{
          expression: {
            arguments: [{
              raw: "'hi'",
              type: "StringLiteral",
              value: "hi"
            }],
            base: {
              name: "print",
              type: "Identifier"
            },
            type: "CallExpression"
          },
          type: "CallStatement"
        }]
      });
  }
}