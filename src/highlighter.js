import chalk from "chalk";
import tokenizer from "./tokenizer";

function isFunction(obj) {
  return toString.call(obj) === "[object Function]";
}

let code;
let splits;
let lastSplitEnd;

function addSplit(start, end, color) {
  let result;
  let nextIndex;
  const skip = 0;

  if (start >= end) return;

  if (color) {
    splits.push(color(code.slice(start, end)));
  } else {
    splits.push(code.slice(start, end));
  }

  lastSplitEnd = end;

  return skip;
}

const highlighter = {
  colors: {
    Keyword: {
      local: chalk.cyan,
      while: chalk.cyan,
      do: chalk.cyan,
      for: chalk.cyan,
      of: chalk.cyan,
      in: chalk.cyan,

      if: chalk.cyan,
      else: chalk.cyan,
      elseif: chalk.cyan,
      then: chalk.cyan,

      function: chalk.cyan,
      end: chalk.cyan,

      class: chalk.cyan,
      extends: chalk.cyan,
      static: chalk.cyan,

      self: chalk.cyan,

      super: chalk.yellow,
    },
    Punctuator: {
      "->": chalk.cyan,
      "=>": chalk.cyan,

      "!": chalk.cyan,
      "||": chalk.cyan,
      "&&": chalk.cyan,
      "!=": chalk.cyan,
      "~=": chalk.cyan,
      "==": chalk.cyan,

      "++": chalk.cyan,
      "-=": chalk.cyan,
      "+=": chalk.cyan,
      "*=": chalk.cyan,
      "/=": chalk.cyan,
      "%=": chalk.cyan,
      "..=": chalk.cyan,
    },
    Identifier: {
      constructor: chalk.yellow,
    },
    BooleanLiteral: {
      _default: chalk.magenta,
    },
    NumericLiteral: {
      _default: chalk.green,
    },
    StringLiteral: {
      _default: chalk.yellow,
    },
  },

  highlight(_code, options) {
    splits = [];
    lastSplitEnd = 0;
    code = _code;

    let { colors } = this;
    if (options) {
      if (options.colors) {
        colors = options.colors;
      }
    }

    const tokens = tokenizer.tokenize(code, {
      skipExceptions: true,
    });

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      var start;
      var end;
      start = token.range[0];
      end = token.range[1];

      const colorForType = colors[token.type];

      const color =
        colorForType &&
        colorForType.hasOwnProperty(token.value) &&
        colorForType[token.value] &&
        isFunction(colorForType[token.value])
          ? colorForType[token.value]
          : colorForType && colorForType._default;

      addSplit(lastSplitEnd, start);
      const skip = addSplit(start, end, color);
    }

    return splits.join("");
  },
};

export default highlighter;
