// x += 5 -- x = x + 5
// x *= 2 -- x = x * 2
// x /= 2 -- x = x / 2
// x++ -- x = x + 1
// x -= 1 -- x = x - 1. Notice x-- doesn't exist
// x ||= 2 -- x = x or 2
// x ..= "me" -- x = x .. "me"
// x %= 2 -- x = x % 2

import chai, { expect } from 'chai';
import chaiSubset from 'chai-subset';
import parser from '../../src/parser';

chai.use(chaiSubset);

export default {
  /**
   * Simple addition mutation
   */
  additionMutation: () => {
    const { chunk } = parser.parse('x += 5');

    expect(chunk).to.deep.equal({
      type: 'Chunk',
      body: [
        {
          type: 'MutationStatement',
          expression: {
            isLocal: undefined,
            name: 'x',
            type: 'Identifier',
          },
          sign: '+',
          value: {
            raw: '5',
            type: 'NumericLiteral',
            value: 5,
          },
        },
      ],
    });
  },

  /**
   * Simple subtraction mutation
   */
  subtractionMutation: () => {
    const { chunk } = parser.parse('x -= 5');

    expect(chunk).to.deep.equal({
      type: 'Chunk',
      body: [
        {
          type: 'MutationStatement',
          expression: {
            isLocal: undefined,
            name: 'x',
            type: 'Identifier',
          },
          sign: '-',
          value: {
            raw: '5',
            type: 'NumericLiteral',
            value: 5,
          },
        },
      ],
    });
  },

  /**
   * Simple multiplication mutation
   */
  multiplicationMutation: () => {
    const { chunk } = parser.parse('x *= 5');

    expect(chunk).to.deep.equal({
      type: 'Chunk',
      body: [
        {
          type: 'MutationStatement',
          expression: {
            isLocal: undefined,
            name: 'x',
            type: 'Identifier',
          },
          sign: '*',
          value: {
            raw: '5',
            type: 'NumericLiteral',
            value: 5,
          },
        },
      ],
    });
  },

  /**
   * Simple division mutation
   */
  divisionMutation: () => {
    const { chunk } = parser.parse('x /= 5');

    expect(chunk).to.deep.equal({
      type: 'Chunk',
      body: [
        {
          type: 'MutationStatement',
          expression: {
            isLocal: undefined,
            name: 'x',
            type: 'Identifier',
          },
          sign: '/',
          value: {
            raw: '5',
            type: 'NumericLiteral',
            value: 5,
          },
        },
      ],
    });
  },

  /**
   * Simple modulus mutation
   */
  modulusMutation: () => {
    const { chunk } = parser.parse('x %= 5');

    expect(chunk).to.deep.equal({
      type: 'Chunk',
      body: [
        {
          type: 'MutationStatement',
          expression: {
            isLocal: undefined,
            name: 'x',
            type: 'Identifier',
          },
          sign: '%',
          value: {
            raw: '5',
            type: 'NumericLiteral',
            value: 5,
          },
        },
      ],
    });
  },

  /**
   * Simple increment mutation
   */
  incrementMutation: () => {
    const { chunk } = parser.parse('x++');

    expect(chunk).to.deep.equal({
      type: 'Chunk',
      body: [
        {
          type: 'MutationStatement',
          expression: {
            isLocal: undefined,
            name: 'x',
            type: 'Identifier',
          },
          sign: '+',
          value: {
            raw: '1',
            type: 'NumericLiteral',
            value: 1,
          },
        },
      ],
    });
  },

  /**
   * Simple shortcircuit or mutation
   */
  shortcircuitOrMutation: () => {
    const { chunk } = parser.parse('x ||= 2');

    expect(chunk).to.deep.equal({
      type: 'Chunk',
      body: [
        {
          type: 'MutationStatement',
          expression: {
            isLocal: undefined,
            name: 'x',
            type: 'Identifier',
          },
          sign: '||',
          value: {
            raw: '2',
            type: 'NumericLiteral',
            value: 2,
          },
        },
      ],
    });
  },

  /**
   * Simple concatenation mutation
   */
  concatenationMutation: () => {
    const { chunk } = parser.parse('x ..= \'me\'');

    expect(chunk).to.deep.equal({
      type: 'Chunk',
      body: [
        {
          type: 'MutationStatement',
          expression: {
            isLocal: undefined,
            name: 'x',
            type: 'Identifier',
          },
          sign: '..',
          value: {
            raw: '\'me\'',
            type: 'StringLiteral',
            value: 'me',
          },
        },
      ],
    });
  },
};
