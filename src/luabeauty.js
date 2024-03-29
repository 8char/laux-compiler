/*! https://mths.be/luamin v1.0.2 by @mathias */
/*--------------------------------------------------------------------------*/

import extend from "extend";
import parser from "./parser";

parser.defaultOptions.comments = true;
parser.defaultOptions.scope = true;
const { parse } = parser;

const regexAlphaUnderscore = /[a-zA-Z_]/;
const regexAlphaNumUnderscore = /[a-zA-Z0-9_]/;
const regexVarName = /^[A-Z_][0-9A-Z_]*$/i;
const regexDigits = /[0-9]/;

let indentString = "";

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
  "unary-": 8,
  "unary!": 8, // unary -
  "^": 10,
};

const KEYWORDS = [
  "do",
  "if",
  "in",
  "or",
  "and",
  "end",
  "for",
  "not",
  "nil",
  "else",
  "goto",
  "then",
  "break",
  "local",
  "until",
  "while",
  "elseif",
  "repeat",
  "return",
  "function",
];

const each = function (array, fn) {
  let index = -1;
  const { length } = array;
  const max = length - 1;
  while (++index < length) {
    fn(array[index], index < max);
  }
};

const { hasOwnProperty } = {};
/* var extend = function(destination, source) {
  var key;
  if (source) {
    for (key in source) {
      if (hasOwnProperty.call(source, key)) {
        destination[key] = source[key];
      }
    }
  }
  return destination;
};
*/

const generateIdentifier = function (name) {
  return name;
};

/* var lauIdx = 0;
var generateLAUIdentifier = function(expression) {
  return parser.ast.identifier("__laui" + lauIdx++);
}; */

const generateAssert = function (expression, message) {
  const { ast } = parser;
  const assertId = ast.identifier("assert");
  const messageLiteral = ast.literal(
    parser.tokenTypes.StringLiteral,
    message,
    `"${message}"`,
  );
  const callExp = ast.callExpression(assertId, [expression, messageLiteral]);

  return ast.callStatement(callExp);
};

/*--------------------------------------------------------------------------*/

const joinStatements = function (a, b, separator, depth) {
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
    return a + separator + b;
  }
  if (regexDigits.test(lastCharA)) {
    if (
      firstCharB == "(" ||
      !(firstCharB == "." || regexAlphaUnderscore.test(firstCharB))
    ) {
      // e.g. `1` + `+`
      // e.g. `1` + `==`
      return a + separator + b;
    }
    // e.g. `1` + `..`
    // e.g. `1` + `and`
    return a + separator + b;
  }
  if (lastCharA == firstCharB && lastCharA == "-") {
    // e.g. `1-` + `-2`
    return a + separator + b;
  }
  if (lastCharA == "!") {
    return a + b;
  }

  return a + separator + b;
};

const formatBase = function (base, depth) {
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
  result += formatExpression(base, depth);
  if (needsParens) {
    result += ")";
  }
  return result;
};

var formatExpression = function (expression, depth, options) {
  const indent = Array(depth + 1).join(indentString);

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
      expression.name != "_G"
    ) {
      result = expression.name;
    } else {
      result =
        expression.isLocal && !options.preserveIdentifiers
          ? generateIdentifier(expression.name)
          : expression.name;
    }
  } else if (expressionType == "StringLiteral") {
    let { raw } = expression;
    let match;
    while ((match = /\\([0-9]+)/g.exec(raw))) {
      const str = match[0];
      const num = parseInt(str.substr(1));
      if (num) {
        const char = String.fromCharCode(num);

        const start = raw.substr(0, match.index);
        const end = raw.substr(match.index + str.length);

        raw = start + char + end;
      }
    }

    result = raw;
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

    result = formatExpression(expression.left, depth, {
      precedence: currentPrecedence,
      direction: "left",
      parent: operator,
    });
    result = joinStatements(result, operator);
    result = joinStatements(
      result,
      formatExpression(expression.right, depth, {
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
      formatExpression(expression.argument, depth, {
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
    if (expression.base.type == "FunctionDeclaration") {
      result = `(${formatBase(expression.base, depth)})(`;
    } else {
      result = `${formatBase(expression.base, depth)}(`;
    }

    const args = expression.arguments;
    each(args, (argument, needsComma) => {
      result += formatExpression(argument, depth);
      if (needsComma) {
        result += ", ";
      }
    });
    result += ")";
  } else if (expressionType == "TableCallExpression") {
    result =
      formatExpression(expression.base, depth) +
      formatExpression(expression.arguments, depth);
  } else if (expressionType == "StringCallExpression") {
    result =
      formatExpression(expression.base, depth) +
      formatExpression(expression.argument, depth);
  } else if (expressionType == "IndexExpression") {
    let out = `${formatBase(expression.base, depth)}[${formatExpression(
      expression.index,
      depth,
    )}]`;

    if (expression.base.name == "_G") {
      var { index } = expression;
      if (index.type == "StringLiteral") {
        var strName = formatExpression(index, depth);
        var name = strName.substr(1, strName.length - 2);
        if (name.match(regexVarName) && KEYWORDS.indexOf(name) == -1) {
          out = formatExpression(parser.ast.identifier(name), depth);
        }
      }
    } else {
      var { index } = expression;
      if (index.type == "StringLiteral") {
        var strName = formatExpression(index, depth);
        var name = strName.substr(1, strName.length - 2);
        if (name.match(regexVarName) && KEYWORDS.indexOf(name) == -1) {
          out = joinStatements(
            formatExpression(expression.base, depth),
            formatExpression(parser.ast.identifier(name), depth),
            ".",
          );
        }
      }
    }

    result = out;
  } else if (expressionType == "MemberExpression") {
    result =
      formatBase(expression.base, depth) +
      expression.indexer +
      formatExpression(expression.identifier, depth, {
        preserveIdentifiers: true,
      });
  } else if (expressionType == "FunctionDeclaration") {
    const { body } = expression;
    result = "function(";
    if (expression.parameters.length) {
      each(expression.parameters, (parameter, needsComma) => {
        // `Identifier`s have a `name`, `VarargLiteral`s have a `value`
        result += parameter.name
          ? generateIdentifier(parameter.name)
          : parameter.value;

        if (needsComma) {
          result += ", ";
        }
      });
    }

    var isEmpty = body.length == 0;
    let sep = isEmpty ? null : "\n";
    if (expression.body.length > 0) sep = "\n";

    result += ")";
    result = joinStatements(result, formatStatement(body, depth + 1), sep);
    result = joinStatements(result, `${isEmpty ? "" : indent}end`, sep);
  } else if (expressionType == "TableConstructorExpression") {
    var isEmpty = expression.fields.length <= 1;

    result = "{";
    result += isEmpty ? "" : "\n";

    const innerIndent = isEmpty ? "" : Array(depth + 2).join(indentString);

    each(expression.fields, (field, needsComma) => {
      if (field.type == "TableKey") {
        const strName = formatExpression(field.key, depth);
        const name =
          field.key.type === "StringLiteral"
            ? strName.substr(1, strName.length - 2)
            : strName;

        if (field.key.type === "StringLiteral" && name.match(regexVarName)) {
          result += `${innerIndent + name} = ${formatExpression(
            field.value,
            depth + 1,
          )}`;
        } else {
          result += `${innerIndent}[${formatExpression(
            field.key,
            depth,
          )}] = ${formatExpression(field.value, depth + 1)}`;
        }
      } else if (field.type == "TableValue") {
        result += innerIndent + formatExpression(field.value, depth + 1);
      } else {
        // at this point, `field.type == "TableKeyString"`
        result += `${
          innerIndent +
          formatExpression(field.key, {
            preserveIdentifiers: true,
          })
        } = ${formatExpression(field.value, depth + 1)}`;
      }
      if (needsComma) {
        result += ",\n";
      }
    });

    if (!isEmpty) result += "\n";

    result += `${isEmpty ? "" : indent}}`;
  } else {
    /* else if (expressionType == "FatArrowDeclaration" || expressionType == "ThinArrowDeclaration") {
    var body = expression.body;

    result += "function(";

    var params = expression.parameters;
    var defaultValues = [];
    each(params, function(parameter, needsComma) {
      // `Identifier`s have a `name`, `VarargLiteral`s have a `value`
      result += parameter.name
        ? generateIdentifier(parameter.name)
        : parameter.value;

      if (parameter.defaultValue) {
        var ifBody = parser.ast.assignmentStatement(
          [parameter],
          [parameter.defaultValue]);
        var ifCondition = parser.ast.binaryExpression(
          "==",
          parameter,
          parser.ast.literal(parser.tokenTypes.NilLiteral, null, "nil"))
        var ifClause = parser.ast.ifClause(ifCondition, [ifBody]);
        var ifStatement = parser.ast.ifStatement([ifClause]);
        ifStatement.inline = true;

        defaultValues.push(ifStatement);
      }

      if (needsComma) {
        result += ", ";
      }
    });
    body = defaultValues.concat(body);
    // }

    var isEmpty = body.length == 0;
    var sep = isEmpty ? null : "\n";

    result += ")";
    result = joinStatements(result, formatStatement(body, depth + 1), sep);
    result = joinStatements(result, (isEmpty ? "" : indent) + "end", sep);

  } */
    throw TypeError(`Unknown expression type: \`${expressionType}\``);
  }

  return result;
};

const appendArray = function (a, b) {
  each(b, (element) => {
    if (a.indexOf(element) == -1) a.push(element);
  });
};

const getStatementReferences = function (statement) {
  const { type } = statement;
  const refs = [];

  switch (type) {
    case "CallStatement":
      appendArray(refs, getStatementReferences(statement.expression));
      break;

    case "CallExpression":
      appendArray(refs, getStatementReferences(statement.base));

      each(statement.arguments, (arg) => {
        const newRefs = getStatementReferences(arg);

        appendArray(refs, newRefs);
      });

      break;

    case "LocalStatement":
    case "AssignmentStatement":
      each(statement.variables, (variable) => {
        const newRefs = getStatementReferences(variable);

        appendArray(refs, newRefs);
      });

      break;

    case "MemberExpression":
      appendArray(refs, getStatementReferences(statement.base));
      appendArray(refs, getStatementReferences(statement.identifier));
      break;

    case "Identifier":
      refs.push(statement.name);
      break;
  }

  return refs;
};

const shouldHaveEmptyLine = function (statement, lastStatement) {
  const sType = statement.type;
  const lsType = lastStatement.type;
  if (sType == "IfStatement" && lsType == "IfStatement") {
    if (lastStatement.inline && statement.inline) return false;
    return true;
  }
  if (sType == "FunctionDeclaration") return true;

  if (
    sType == "ForGenericStatement" ||
    sType == "ForNumericStatement" ||
    sType == "WhileStatement"
  )
    return true;

  if (sType == "AssignmentStatement" || lsType == "AssignmentStatement") {
    if (lsType == "MutationStatement" || sType == "MutationStatement")
      return false;
  }

  if (statement.type != lastStatement.type) {
    const statementRefs = getStatementReferences(statement);
    const lastStatementRefs = getStatementReferences(lastStatement);

    const totalRefs = 0;
    let collidingRefs = 0;
    for (let i = 0; i < statementRefs.length; i++) {
      let found = false;

      for (let j = 0; j < lastStatementRefs.length; j++) {
        if (statementRefs[i] == lastStatementRefs[j]) {
          found = true;
          break;
        }
      }

      if (found) {
        collidingRefs++;
      }
    }

    if (collidingRefs > 0) return false;

    return true;
  }

  return false;
};

const formatStatementList = function (body, depth) {
  let result = "";
  const indent = Array(depth + 1).join(indentString);
  let lastStatement;
  each(body, (statement) => {
    if (lastStatement && shouldHaveEmptyLine(statement, lastStatement)) {
      result += "\n";
    }

    result = joinStatements(
      result,
      indent + formatStatement(statement, depth),
      "\n",
    );
    lastStatement = statement;
  });
  return result;
};

var formatStatement = function (statement, depth) {
  let result = "";
  const statementType = statement.type;
  const indent = Array(depth + 1).join(indentString);

  if (statementType == "BlockStatement") {
    result = formatStatementList(statement.body, depth);
  } else if (statementType == "AssignmentStatement") {
    // left-hand side
    each(statement.variables, (variable, needsComma) => {
      result += formatExpression(variable, depth);
      if (needsComma) {
        result += ", ";
      }
    });

    // right-hand side
    result += " = ";
    each(statement.init, (init, needsComma) => {
      result += formatExpression(init, depth);
      if (needsComma) {
        result += ", ";
      }
    });
  } else if (statementType == "LocalStatement") {
    result = "local ";

    // left-hand side
    each(statement.variables, (variable, needsComma) => {
      // Variables in a `LocalStatement` are always local, duh
      result += generateIdentifier(variable.name);
      if (needsComma) {
        result += ", ";
      }
    });

    // right-hand side
    if (statement.init.length) {
      result += " = ";
      each(statement.init, (init, needsComma) => {
        result += formatExpression(init, depth);
        if (needsComma) {
          result += ", ";
        }
      });
    }
  } else if (statementType == "CallStatement") {
    result = formatExpression(statement.expression, depth);
  } else if (statementType == "IfStatement") {
    const { inline } = statement;
    var isEmpty = statement.clauses[0].body.length == 0;

    result = joinStatements(
      "if",
      formatExpression(statement.clauses[0].condition, depth),
    );
    result = joinStatements(result, "then");
    result = joinStatements(
      result,
      formatStatement(statement.clauses[0].body, inline ? 0 : depth + 1),
      isEmpty || inline ? null : "\n",
    );
    each(statement.clauses.slice(1), (clause) => {
      const isEmpty = clause.body.length == 0;
      const sep = isEmpty ? null : "\n";
      const indentStr = isEmpty ? "" : indent;

      if (clause.condition) {
        result = joinStatements(result, `${indentStr}elseif`, sep);
        result = joinStatements(
          result,
          formatExpression(clause.condition, depth),
        );
        result = joinStatements(result, "then");
      } else {
        result = joinStatements(result, `${indentStr}else`, sep);
      }

      result = joinStatements(
        result,
        formatStatement(clause.body, depth + 1),
        sep,
      );
    });

    if (!isEmpty && !inline)
      result = joinStatements(result, `${indent}end`, "\n");
    else result = joinStatements(result, "end");
  } else if (statementType == "WhileStatement") {
    var isEmpty = statement.body.length == 0;
    var sep = isEmpty ? null : "\n";

    result = joinStatements(
      "while",
      formatExpression(statement.condition, depth),
    );
    result = joinStatements(result, "do");
    result = joinStatements(
      result,
      formatStatement(statement.body, depth + 1),
      sep,
    );
    result = joinStatements(result, `${isEmpty ? "" : indent}end`, sep);
  } else if (statementType == "DoStatement") {
    var isEmpty = statement.body.length == 0;
    var sep = isEmpty ? null : "\n";

    result = joinStatements(
      "do",
      formatStatement(statement.body, depth + 1),
      sep,
    );
    result = joinStatements(result, `${isEmpty ? "" : indent}end`, sep);
  } else if (statementType == "ReturnStatement") {
    result = "return";

    each(statement.arguments, (argument, needsComma) => {
      result = joinStatements(result, formatExpression(argument, depth));
      if (needsComma) {
        result += ", ";
      }
    });
  } else if (statementType == "BreakStatement") {
    result = "break";
  } else if (statementType == "ContinueStatement") {
    result = "continue";
  } else if (statementType == "RepeatStatement") {
    result = joinStatements("repeat", formatStatement(statement.body, depth));
    result = joinStatements(result, "until");
    result = joinStatements(
      result,
      formatExpression(statement.condition, depth),
    );
  } else if (statementType == "FunctionDeclaration") {
    const { body } = statement;

    result = `${statement.isLocal ? "local " : ""}function `;
    result += formatExpression(statement.identifier, depth);
    result += "(";

    // if (statement.parameters.length) {
    const params = statement.parameters;
    each(params, (parameter, needsComma) => {
      // `Identifier`s have a `name`, `VarargLiteral`s have a `value`
      result += parameter.name
        ? generateIdentifier(parameter.name)
        : parameter.value;

      if (needsComma) {
        result += ", ";
      }
    });
    // }

    var isEmpty = body.length == 0;
    var sep = isEmpty ? null : "\n";

    result += ")";
    result = joinStatements(result, formatStatement(body, depth + 1), sep);
    result = joinStatements(result, `${isEmpty ? "" : indent}end`, sep);
  } else if (statementType == "ForGenericStatement") {
    // see also `ForNumericStatement`

    result = "for ";

    each(statement.variables, (variable, needsComma) => {
      // The variables in a `ForGenericStatement` are always local
      result += generateIdentifier(variable.name);
      if (needsComma) {
        result += ", ";
      }
    });

    result += " in";

    each(statement.iterators, (iterator, needsComma) => {
      result = joinStatements(result, formatExpression(iterator, depth));
      if (needsComma) {
        result += ", ";
      }
    });

    var isEmpty = statement.body.length == 0;
    var sep = isEmpty ? null : "\n";

    result = joinStatements(result, "do");
    result = joinStatements(
      result,
      formatStatement(statement.body, depth + 1),
      sep,
    );
    result = joinStatements(result, `${isEmpty ? "" : indent}end`, sep);
  } else if (statementType == "ForNumericStatement") {
    var isEmpty = statement.body.length == 0;
    var sep = isEmpty ? null : "\n";

    // The variables in a `ForNumericStatement` are always local
    result = `for ${generateIdentifier(statement.variable.name)} = `;
    result += `${formatExpression(statement.start, depth)}, ${formatExpression(
      statement.end,
      depth,
    )}`;

    if (statement.step) {
      result += `, ${formatExpression(statement.step, depth)}`;
    }

    result = joinStatements(result, "do");
    result = joinStatements(
      result,
      formatStatement(statement.body, depth + 1),
      sep,
    );
    result = joinStatements(result, `${isEmpty ? "" : indent}end`, sep);
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

const beautify = function (argument, _options) {
  // `argument` can be a Lua code snippet (string)
  // or a parser-compatible AST (object)
  // lauIdx = 0;
  const ast = typeof argument === "string" ? parse(argument) : argument;

  if (_options) {
    const options = extend(
      {
        indent: 4,
      },
      {
        indent: _options.indent,
      },
    );

    indentString = Array(options.indent + 1).join(" ");
  }

  return formatStatement(ast.body, 0);
};

/*--------------------------------------------------------------------------*/

const luabeauty = {
  version: "1.0.2",
  beautify,
};

export default luabeauty;
