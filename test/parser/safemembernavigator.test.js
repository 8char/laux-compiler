// stopif i > 5 -- if (i > 5) then return end
// breakif i > 2 -- if (i > 2) then break end
// continueif i > 8 -- if (i > 8) then continue end

import chai, { expect } from "chai";
import chaiSubset from "chai-subset";
import parser from "../../src/parser";

chai.use(chaiSubset);

export default {
  /**
   * Simple safemember navigator expression
   */
  safememberNavigator: () => {
    const {
      chunk: { body },
    } = parser.parse("if (groups?[groupKind]?.members?.name) then end");

    expect(body[0]).to.deep.equal({
      type: "IfStatement",
      clauses: [
        {
          type: "IfClause",
          condition: {
            type: "SafeMemberExpression",
            base: {
              type: "SafeMemberExpression",
              base: {
                index: undefined,
                type: "SafeMemberExpression",
                base: {
                  isLocal: undefined,
                  type: "Identifier",
                  name: "groups",
                },
                indexer: ".",
                identifier: {
                  isLocal: undefined,
                  type: "Identifier",
                  name: "groupKind",
                },
              },
              indexer: ".",
              identifier: {
                isLocal: undefined,
                type: "Identifier",
                name: "members",
              },
              index: undefined,
            },
            indexer: ".",
            index: undefined,
            identifier: {
              type: "Identifier",
              name: "name",
              isLocal: undefined,
            },
            inParens: true,
          },
          body: [],
        },
      ],
    });
  },

  /**
   * Simple breakif expression
   */
  breakifExpression: () => {
    const {
      chunk: { body },
    } = parser.parse("breakif i > 2");

    expect(body[0]).to.deep.equal({
      type: "BreakIfStatement",
      arguments: [
        {
          type: "BinaryExpression",
          left: {
            isLocal: undefined,
            name: "i",
            type: "Identifier",
          },
          operator: ">",
          right: {
            raw: "2",
            type: "NumericLiteral",
            value: 2,
          },
        },
      ],
    });
  },

  /**
   * Simple continueif expression
   */
  continueifExpression: () => {
    const {
      chunk: { body },
    } = parser.parse("continueif i > 8");

    expect(body[0]).to.deep.equal({
      type: "ContinueIfStatement",
      arguments: [
        {
          type: "BinaryExpression",
          left: {
            isLocal: undefined,
            name: "i",
            type: "Identifier",
          },
          operator: ">",
          right: {
            raw: "8",
            type: "NumericLiteral",
            value: 8,
          },
        },
      ],
    });
  },
};
