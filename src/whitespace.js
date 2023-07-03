// Shamelessly taken from the babel-generator code for educational purposes.

export default class Whitespace {
  constructor(tokens) {
    this.tokens = tokens;
    this.used = [];
  }

  getNewlinesBefore(node) {
    let startToken;
    let endToken;
    const { tokens } = this;

    let index = this.findToken((token) => token.range[0] - node.range[0], 0, tokens.length);
    if (index >= 0) {
      while (index && node.range[0] === tokens[index - 1].range[0]) index -= 1;
      startToken = tokens[index - 1];
      endToken = tokens[index];
    }

    return this.getNewlinesBetween(startToken, endToken);
  }

  getNewlinesAfter(node) {
    let startToken;
    let endToken;
    const { tokens } = this;

    let index = this.findToken((token) => token.range[1] - node.range[1], 0, tokens.length);
    if (index >= 0) {
      while (index && node.range[1] === tokens[index - 1].range[1]) index -= 1;
      startToken = tokens[index];
      endToken = tokens[index + 1];
      if (endToken.value === ',') endToken = tokens[index + 2];
    }

    if (endToken && endToken.type === 'EOF') {
      return 1;
    }

    return this.getNewlinesBetween(startToken, endToken);
  }

  getNewlinesBetween(startToken, endToken) {
    if (!endToken || !startToken) return 0;

    const start = startToken ? startToken.loc.end.line : 1;
    const end = endToken.loc.start.line;
    let lines = 0;

    for (let line = start; line < end; line += 1) {
      if (typeof this.used[line] === 'undefined') {
        this.used[line] = true;
        lines += 1;
      }
    }

    return lines;
  }

  findToken(test, start, end) {
    if (start >= end) return -1;

    const middle = Math.floor((start + end) / 2);
    const match = test(this.tokens[middle]);

    if (match < 0) {
      return this.findToken(test, middle + 1, end);
    }
    if (match > 0) {
      return this.findToken(test, start, middle);
    }

    return middle;

    // return -1;
  }
}
