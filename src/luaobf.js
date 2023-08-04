/*! https://mths.be/luamin v1.0.2 by @mathias */

import parser from "./parser";

parser.defaultOptions.comments = false;
parser.defaultOptions.scope = true;
const { parse } = parser;

const regexAlphaUnderscore = /[a-zA-Z_]/;
const regexAlphaNumUnderscore = /[a-zA-Z0-9_]/;
const regexDigits = /[0-9]/;

// http://www.lua.org/manual/5.2/manual.html#3.4.7
// http://www.lua.org/source/5.2/lparser.c.html#priority
const PRECEDENCE = {
  or: 1,
  and: 2,
  "<": 3,
  ">": 3,
  "<=": 3,
  ">=": 3,
  "~=": 3,
  "==": 3,
  "..": 5,
  "+": 6,
  "-": 6, // binary -
  "*": 7,
  "/": 7,
  "%": 7,
  unarynot: 8,
  "unary#": 8,
  "unary-": 8, // unary -
  "^": 10,
};

const IDENTIFIER_PARTS = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "_",
];
const IDENTIFIER_PARTS_MAX = IDENTIFIER_PARTS.length - 1;

const each = function (array, fn) {
  let index = -1;
  const { length } = array;
  const max = length - 1;
  while (++index < length) {
    fn(array[index], index < max);
  }
};

const indexOf = function (array, value) {
  let index = -1;
  const { length } = array;
  while (++index < length) {
    if (array[index] == value) {
      return index;
    }
  }
};

const { hasOwnProperty } = {};
const extend = function (destination, source) {
  let key;
  if (source) {
    for (key in source) {
      if (hasOwnProperty.call(source, key)) {
        destination[key] = source[key];
      }
    }
  }
  return destination;
};

const generateZeroes = function (length) {
  let zero = "0";
  let result = "";
  if (length < 1) {
    return result;
  }
  if (length == 1) {
    return zero;
  }
  while (length) {
    if (length & 1) {
      result += zero;
    }
    if ((length >>= 1)) {
      zero += zero;
    }
  }
  return result;
};

// http://www.lua.org/manual/5.2/manual.html#3.1
function isKeyword(id) {
  switch (id.length) {
    case 2:
      return id == "do" || id == "if" || id == "in" || id == "or";
    case 3:
      return (
        id == "and" || id == "end" || id == "for" || id == "nil" || id == "not"
      );
    case 4:
      return id == "else" || id == "goto" || id == "then" || id == "true";
    case 5:
      return (
        id == "break" ||
        id == "false" ||
        id == "local" ||
        id == "until" ||
        id == "while"
      );
    case 6:
      return id == "elseif" || id == "repeat" || id == "return";
    case 8:
      return id == "function";
  }
  return false;
}

let currentIdentifier;
let identifierMap;
let identifiersInUse;
const generateIdentifier = function (originalName) {
  // Preserve `self` in methods
  if (originalName == "self") {
    return originalName;
  }

  if (hasOwnProperty.call(identifierMap, originalName)) {
    return identifierMap[originalName];
  }
  const { length } = currentIdentifier;
  let position = length - 1;
  let character;
  let index;
  while (position >= 0) {
    character = currentIdentifier.charAt(position);
    index = indexOf(IDENTIFIER_PARTS, character);
    if (index != IDENTIFIER_PARTS_MAX) {
      currentIdentifier =
        currentIdentifier.substring(0, position) +
        IDENTIFIER_PARTS[index + 1] +
        generateZeroes(length - (position + 1));
      if (
        isKeyword(currentIdentifier) ||
        indexOf(identifiersInUse, currentIdentifier) > -1
      ) {
        return generateIdentifier(originalName);
      }
      identifierMap[originalName] = currentIdentifier;
      return currentIdentifier;
    }
    --position;
  }
  currentIdentifier = `a${generateZeroes(length)}`;
  if (indexOf(identifiersInUse, currentIdentifier) > -1) {
    return generateIdentifier(originalName);
  }
  identifierMap[originalName] = currentIdentifier;
  return currentIdentifier;
};

/*--------------------------------------------------------------------------*/

const joinStatements = function (a, b, separator) {
  separator || (separator = " ");

  const lastCharA = a.slice(-1);
  const firstCharB = b.charAt(0);

  if (lastCharA == "" || firstCharB == "") {
    return a + b;
  }
  if (regexAlphaUnderscore.test(lastCharA)) {
    if (regexAlphaNumUnderscore.test(firstCharB)) {
      // e.g. `while` + `1`
      // e.g. `local a` + `local b`
      return a + separator + b;
    }
    // e.g. `not` + `(2>3 or 3<2)`
    // e.g. `x` + `^`
    return a + b;
  }
  if (regexDigits.test(lastCharA)) {
    if (
      firstCharB == "(" ||
      !(firstCharB == "." || regexAlphaUnderscore.test(firstCharB))
    ) {
      // e.g. `1` + `+`
      // e.g. `1` + `==`
      return a + b;
    }
    // e.g. `1` + `..`
    // e.g. `1` + `and`
    return a + separator + b;
  }
  if (lastCharA == firstCharB && lastCharA == "-") {
    // e.g. `1-` + `-2`
    return a + separator + b;
  }
  return a + b;
};

const formatBase = function (base) {
  let result = "";
  const { type } = base;
  const needsParens =
    base.inParens &&
    (type == "BinaryExpression" ||
      type == "FunctionDeclaration" ||
      type == "TableConstructorExpression" ||
      type == "LogicalExpression" ||
      type == "StringLiteral");
  if (needsParens) {
    result += "(";
  }
  result += formatExpression(base);
  if (needsParens) {
    result += ")";
  }
  return result;
};

var formatExpression = function (expression, options) {
  options = extend(
    {
      precedence: 0,
      preserveIdentifiers: false,
    },
    options,
  );

  let result = "";
  let currentPrecedence;
  let associativity;
  let operator;

  const expressionType = expression.type;

  if (expressionType == "Identifier") {
    if (
      expression.name != "self" &&
      expression.isLocal == false &&
      expression.name != "_G" &&
      !expression.isFunctionName
    ) {
      var charStr = "";
      for (var i = 0; i < expression.name.length; i++) {
        charStr += `\\${expression.name.charCodeAt(i)}`;
      }
      result = `_G["${charStr}"]`;
    } else {
      result =
        expression.isLocal && !options.preserveIdentifiers
          ? generateIdentifier(expression.name)
          : expression.name;
    }
  } else if (expressionType == "StringLiteral") {
    var charStr = "";
    for (var i = 0; i < expression.raw.length; i++) {
      charStr += `\\${expression.raw.charCodeAt(i)}`;
    }
    result = expression.raw;
  } else if (expressionType == "NumericLiteral") {
    const val = expression.value;
    if (val % 1 == 0) {
      result = `0x${val.toString(16)}`;
    } else if (Math.ceil(Math.log10(val)) != 1) {
      result = val.toExponential();
    } else {
      result = expression.raw;
    }
  } else if (
    expressionType == "StringLiteral" ||
    expressionType == "NumericLiteral" ||
    expressionType == "BooleanLiteral" ||
    expressionType == "NilLiteral" ||
    expressionType == "VarargLiteral"
  ) {
    result = expression.raw;
  } else if (
    expressionType == "LogicalExpression" ||
    expressionType == "BinaryExpression"
  ) {
    // If an expression with precedence x
    // contains an expression with precedence < x,
    // the inner expression must be wrapped in parens.
    operator = expression.operator;
    currentPrecedence = PRECEDENCE[operator];
    associativity = "left";

    result = formatExpression(expression.left, {
      precedence: currentPrecedence,
      direction: "left",
      parent: operator,
    });
    result = joinStatements(result, operator);
    result = joinStatements(
      result,
      formatExpression(expression.right, {
        precedence: currentPrecedence,
        direction: "right",
        parent: operator,
      }),
    );

    if (operator == "^" || operator == "..") {
      associativity = "right";
    }

    if (
      currentPrecedence < options.precedence ||
      (currentPrecedence == options.precedence &&
        associativity != options.direction &&
        options.parent != "+" &&
        !(options.parent == "*" && (operator == "/" || operator == "*")))
    ) {
      // The most simple case here is that of
      // protecting the parentheses on the RHS of
      // `1 - (2 - 3)` but deleting them from `(1 - 2) - 3`.
      // This is generally the right thing to do. The
      // semantics of `+` are special however: `1 + (2 - 3)`
      // == `1 + 2 - 3`. `-` and `+` are the only two operators
      // who share their precedence level. `*` also can
      // commute in such a way with `/`, but not with `%`
      // (all three share a precedence). So we test for
      // all of these conditions and avoid emitting
      // parentheses in the cases where we don’t have to.
      result = `(${result})`;
    }
  } else if (expressionType == "UnaryExpression") {
    operator = expression.operator;
    currentPrecedence = PRECEDENCE[`unary${operator}`];

    result = joinStatements(
      operator,
      formatExpression(expression.argument, {
        precedence: currentPrecedence,
      }),
    );

    if (
      currentPrecedence < options.precedence &&
      // In principle, we should parenthesize the RHS of an
      // expression like `3^-2`, because `^` has higher precedence
      // than unary `-` according to the manual. But that is
      // misleading on the RHS of `^`, since the parser will
      // always try to find a unary operator regardless of
      // precedence.
      !(options.parent == "^" && options.direction == "right")
    ) {
      result = `(${result})`;
    }
  } else if (expressionType == "CallExpression") {
    result = `${formatBase(expression.base)}(`;

    let args = expression.arguments;
    if (expression.base.indexer == ":") {
      args = [expression.base.base].concat(args);
    }

    each(args, (argument, needsComma) => {
      result += formatExpression(argument);
      if (needsComma) {
        result += ",";
      }
    });
    result += ")";
  } else if (expressionType == "TableCallExpression") {
    result =
      formatExpression(expression.base) +
      formatExpression(expression.arguments);
  } else if (expressionType == "StringCallExpression") {
    result =
      formatExpression(expression.base) + formatExpression(expression.argument);
  } else if (expressionType == "IndexExpression") {
    result = `${formatBase(expression.base)}[${formatExpression(
      expression.index,
    )}]`;
  } else if (expressionType == "MemberExpression") {
    if (expression.isFunctionName) {
      expression.base.isFunctionName = expression.isFunctionName;
      expression.identifier.isFunctionName = expression.isFunctionName;

      result =
        formatBase(expression.base) +
        expression.indexer +
        formatExpression(expression.identifier, {
          preserveIdentifiers: true,
        });
    } else {
      const identifier = formatExpression(expression.identifier, {
        preserveIdentifiers: true,
      });

      var charStr = "";
      for (var i = 0; i < identifier.length; i++) {
        charStr += `\\${identifier.charCodeAt(i)}`;
      }

      result = `${formatBase(expression.base)}["${charStr}"]`;
    }
  } else if (expressionType == "FunctionDeclaration") {
    result = "function(";
    if (expression.parameters.length) {
      each(expression.parameters, (parameter, needsComma) => {
        // `Identifier`s have a `name`, `VarargLiteral`s have a `value`
        result += parameter.name
          ? generateIdentifier(parameter.name)
          : parameter.value;
        if (needsComma) {
          result += ",";
        }
      });
    }
    result += ")";
    result = joinStatements(result, formatStatementList(expression.body));
    result = joinStatements(result, "end");
  } else if (expressionType == "TableConstructorExpression") {
    result = "{";

    each(expression.fields, (field, needsComma) => {
      if (field.type == "TableKey") {
        result += `[${formatExpression(field.key)}]=${formatExpression(
          field.value,
        )}`;
      } else if (field.type == "TableValue") {
        result += formatExpression(field.value);
      } else {
        // at this point, `field.type == 'TableKeyString'`
        const key = formatExpression(field.key, {
          // TODO: keep track of nested scopes (#18)
          preserveIdentifiers: true,
        });

        let charStr = "";
        for (let i = 0; i < key.length; i++) {
          charStr += `\\${key.charCodeAt(i)}`;
        }

        result += `[\"${charStr}\"]=${formatExpression(field.value)}`;
      }
      if (needsComma) {
        result += ",";
      }
    });

    result += "}";
  } else {
    throw TypeError(`Unknown expression type: \`${expressionType}\``);
  }

  return result;
};

var formatStatementList = function (body) {
  let result = "";
  each(body, (statement) => {
    result = joinStatements(result, formatStatement(statement), ";");
  });
  return result;
};

var formatStatement = function (statement) {
  let result = "";
  const statementType = statement.type;

  if (statementType == "AssignmentStatement") {
    // left-hand side
    each(statement.variables, (variable, needsComma) => {
      result += formatExpression(variable);
      if (needsComma) {
        result += ",";
      }
    });

    // right-hand side
    result += "=";
    each(statement.init, (init, needsComma) => {
      result += formatExpression(init);
      if (needsComma) {
        result += ",";
      }
    });
  } else if (statementType == "LocalStatement") {
    result = "local ";

    // left-hand side
    each(statement.variables, (variable, needsComma) => {
      // Variables in a `LocalStatement` are always local, duh
      result += generateIdentifier(variable.name);
      if (needsComma) {
        result += ",";
      }
    });

    // right-hand side
    if (statement.init.length) {
      result += "=";
      each(statement.init, (init, needsComma) => {
        result += formatExpression(init);
        if (needsComma) {
          result += ",";
        }
      });
    }
  } else if (statementType == "CallStatement") {
    result = formatExpression(statement.expression);
  } else if (statementType == "IfStatement") {
    result = joinStatements(
      "if",
      formatExpression(statement.clauses[0].condition),
    );
    result = joinStatements(result, "then");
    result = joinStatements(
      result,
      formatStatementList(statement.clauses[0].body),
    );
    each(statement.clauses.slice(1), (clause) => {
      if (clause.condition) {
        result = joinStatements(result, "elseif");
        result = joinStatements(result, formatExpression(clause.condition));
        result = joinStatements(result, "then");
      } else {
        result = joinStatements(result, "else");
      }
      result = joinStatements(result, formatStatementList(clause.body));
    });
    result = joinStatements(result, "end");
  } else if (statementType == "WhileStatement") {
    result = joinStatements("while", formatExpression(statement.condition));
    result = joinStatements(result, "do");
    result = joinStatements(result, formatStatementList(statement.body));
    result = joinStatements(result, "end");
  } else if (statementType == "DoStatement") {
    result = joinStatements("do", formatStatementList(statement.body));
    result = joinStatements(result, "end");
  } else if (statementType == "ReturnStatement") {
    result = "return";

    each(statement.arguments, (argument, needsComma) => {
      result = joinStatements(result, formatExpression(argument));
      if (needsComma) {
        result += ",";
      }
    });
  } else if (statementType == "BreakStatement") {
    result = "break";
  } else if (statementType == "ContinueStatement") {
    result = "continue";
  } else if (statementType == "RepeatStatement") {
    result = joinStatements("repeat", formatStatementList(statement.body));
    result = joinStatements(result, "until");
    result = joinStatements(result, formatExpression(statement.condition));
  } else if (statementType == "FunctionDeclaration") {
    result = `${statement.isLocal ? "local " : ""}function `;
    statement.identifier.isFunctionName = true;
    result += formatExpression(statement.identifier);
    result += "(";

    // if (statement.parameters.length) {
    //     var params = statement.parameters;
    //     if (statement.identifier.indexer == ":") {
    //         var selfParam = parser.ast.identifier("self");
    //         selfParam.isLocal = true;
    //         params = [ selfParam ].concat(params);
    //     }

    //     each(params, function(parameter, needsComma) {
    //         // `Identifier`s have a `name`, `VarargLiteral`s have a `value`
    //         result += parameter.name
    //             ? generateIdentifier(parameter.name)
    //             : parameter.value;
    //         if (needsComma) {
    //             result += ',';
    //         }
    //     });
    // }

    if (statement.parameters.length) {
      each(statement.parameters, (parameter, needsComma) => {
        // `Identifier`s have a `name`, `VarargLiteral`s have a `value`
        result += parameter.name
          ? generateIdentifier(parameter.name)
          : parameter.value;
        if (needsComma) {
          result += ",";
        }
      });
    }

    result += ")";
    result = joinStatements(result, formatStatementList(statement.body));
    result = joinStatements(result, "end");
  } else if (statementType == "ForGenericStatement") {
    // see also `ForNumericStatement`

    result = "for ";

    each(statement.variables, (variable, needsComma) => {
      // The variables in a `ForGenericStatement` are always local
      result += generateIdentifier(variable.name);
      if (needsComma) {
        result += ",";
      }
    });

    result += " in";

    each(statement.iterators, (iterator, needsComma) => {
      result = joinStatements(result, formatExpression(iterator));
      if (needsComma) {
        result += ",";
      }
    });

    result = joinStatements(result, "do");
    result = joinStatements(result, formatStatementList(statement.body));
    result = joinStatements(result, "end");
  } else if (statementType == "ForNumericStatement") {
    // The variables in a `ForNumericStatement` are always local
    result = `for ${generateIdentifier(statement.variable.name)}=`;
    result += `${formatExpression(statement.start)},${formatExpression(
      statement.end,
    )}`;

    if (statement.step) {
      result += `,${formatExpression(statement.step)}`;
    }

    result = joinStatements(result, "do");
    result = joinStatements(result, formatStatementList(statement.body));
    result = joinStatements(result, "end");
  } else if (statementType == "LabelStatement") {
    // The identifier names in a `LabelStatement` can safely be renamed
    result = `::${generateIdentifier(statement.label.name)}::`;
  } else if (statementType == "GotoStatement") {
    // The identifier names in a `GotoStatement` can safely be renamed
    result = `goto ${generateIdentifier(statement.label.name)}`;
  } else {
    throw TypeError(`Unknown statement type: \`${statementType}\``);
  }

  return result;
};

const obfuscate = function (argument) {
  // `argument` can be a Lua code snippet (string)
  // or a parser-compatible AST (object)
  const ast = typeof argument === "string" ? parse(argument) : argument;

  // (Re)set temporary identifier values
  identifierMap = {};
  identifiersInUse = [];
  // This is a shortcut to help generate the first identifier (`a`) faster
  currentIdentifier = "9";

  // Make sure global variable names aren't renamed
  if (ast.globals) {
    each(ast.globals, (object) => {
      const { name } = object;
      identifierMap[name] = name;
      identifiersInUse.push(name);
    });
  } else {
    throw Error("Missing required AST property: `globals`");
  }

  return formatStatementList(ast.body);
};

/*--------------------------------------------------------------------------*/

const luaobf = {
  version: "1.0.2",
  obfuscate,
};

export default luaobf;
