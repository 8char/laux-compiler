// stopif i > 5 -- if (i > 5) then return end
// breakif i > 2 -- if (i > 2) then break end
// continueif i > 8 -- if (i > 8) then continue end

import chai, { expect } from 'chai';
import chaiSubset from 'chai-subset';
import parser from '../../src/parser';
import { stripIndent } from '../util';

chai.use(chaiSubset);

export default {
  /**
   * Simple for of expression
   */
  forofExpression: () => {
    const { chunk: { body } } = parser.parse(stripIndent(`
        for i, v of tbl do

        end
    `));

    expect(body[0]).to.deep.equal({
      type: 'ForOfStatement',
      variables: [
        {
          isLocal: undefined,
          type: 'Identifier',
          name: 'i',
        },
        {
          isLocal: undefined,
          type: 'Identifier',
          name: 'v',
        },
      ],
      expression: {
        isLocal: undefined,
        type: 'Identifier',
        name: 'tbl',
      },
      body: [],
    });
  },

  /**
   * For of expression with body
   */
  forofBodyExpression: () => {
    const { chunk: { body } } = parser.parse(stripIndent(`
        for i, v of tbl do
            print('Hey')
        end
    `));

    expect(body[0]).to.deep.equal({
      type: 'ForOfStatement',
      variables: [
        {
          isLocal: undefined,
          type: 'Identifier',
          name: 'i',
        },
        {
          isLocal: undefined,
          type: 'Identifier',
          name: 'v',
        },
      ],
      expression: {
        isLocal: undefined,
        type: 'Identifier',
        name: 'tbl',
      },
      body: [
        {
          type: 'CallStatement',
          expression: {
            type: 'CallExpression',
            base: {
              isLocal: undefined,
              type: 'Identifier',
              name: 'print',
            },
            arguments: [
              {
                type: 'StringLiteral',
                value: 'Hey',
                raw: '\'Hey\'',
              }
            ],
          },
        },
      ],
    });
  },
};
