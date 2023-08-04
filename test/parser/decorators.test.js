import chai, { expect } from "chai";
import chaiSubset from "chai-subset";
import parser from "../../src/parser";
import { stripIndent } from "../util";

chai.use(chaiSubset);

export default {
  /**
   * Decorator expression parsing without special indexers
   */
  decoratorExpression: () => {
    const ast = parser.parse(
      stripIndent(`
        @deprecated
        function Test()
        end
    `),
    );
    const { decorators } = ast.chunk.body[0];

    expect(decorators).to.deep.equal([
      {
        type: "Identifier",
        name: "deprecated",
        isLocal: undefined,
      },
    ]);
  },
};
