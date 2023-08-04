import _ from "underscore";
import repeat from "lodash/repeat";
import detectIndent from "detect-indent";

import Buffer from "./buffer";
import Whitespace from "./whitespace";
import NodePath from "./path";

function commaSeparator() {
  this.token(",");
  this.space();
}

function commaSeparatorNewline() {
  this.token(",");
  this.newline();

  if (!this.endsWith("\n")) this.space();
}

/**

A class for generating Lua code from an Abstract Syntax Tree (AST).
@class
*/

export default class CodeGenerator {
  nodes = {
    /**
      Generate code for a File node.
      @param {object} node - The File node to generate code for.
    */

    File(node) {
      this.print(node.chunk);
    },

    /**
      Generate code for a Chunk node.
      @param {object} node - The Chunk node to generate code for.
    */
    Chunk(node) {
      if (node.body.length) {
        this.printSequence(node.body);
      }
    },

    /**
      Generate code for a LabelStatement node.
      @param {object} node - The LabelStatement node to generate code for.
    */
    LabelStatement(node) {
      this.token("::");
      this.print(node.label);
      this.token("::");
    },

    /**
      Generate code for a GotoStatement node.
      @param {object} node - The GotoStatement node to generate code for.
    */
    GotoStatement(node) {
      this.word("goto");
      this.print(node.label);
    },

    /**
    Generate code for a BreakStatement node.
    @param {object} node - The BreakStatement node to generate code for.
    */
    BreakStatement(node) {
      this.word("break");
    },
    ContinueStatement(node) {
      this.word("continue");
    },

    CallStatement(node) {
      this.print(node.expression);
    },
    AssignmentStatement(node) {
      this.printList(node.variables);

      this.space();
      this.token("=");
      this.space();

      this.printList(node.init);
    },
    LocalStatement(node) {
      this.word("local");
      this.space();

      this.printList(node.variables);

      if (node.init.length > 0) {
        this.space();
        this.token("=");
        this.space();

        this.printList(node.init);
      }
    },

    IfStatement(node) {
      if (node.clauses.length) {
        this.printJoin(node.clauses);
      }

      this.word("end");
    },
    IfClause(node) {
      this.word("if");
      this.space();

      this.print(node.condition);

      this.space();
      this.word("then");

      if (node.body.length) {
        this.printSequence(node.body, { indent: true });
      }
    },
    ElseifClause(node) {
      this.word("elseif");
      this.space();

      this.print(node.condition);

      this.space();
      this.word("then");

      if (node.body.length) {
        this.newline();

        this.printSequence(node.body, { indent: true });
      }
    },
    ElseClause(node) {
      this.word("else");
      if (node.body.length) {
        this.newline();

        this.printSequence(node.body, { indent: true });
      }
    },

    WhileStatement(node) {
      this.word("while");
      this.space();

      this.print(node.condition);

      this.space();
      this.word("do");

      if (node.body.length) {
        this.newline();

        this.printSequence(node.body, { indent: true });
      }

      this.word("end");
    },
    RepeatStatement(node) {
      this.word("repeat");

      if (node.body.length) {
        this.newline();

        this.printSequence(node.body, { indent: true });
      }

      this.word("until");
      this.space();
      this.print(node.condition);
    },
    ForGenericStatement(node) {
      this.word("for");
      this.space();

      this.printList(node.variables);
      this.space();
      this.word("in");
      this.space();

      this.printList(node.iterators);

      this.space();
      this.word("do");

      if (node.body.length) {
        this.newline();

        this.printSequence(node.body, { indent: true });
      }

      this.word("end");
    },
    ForNumericStatement(node) {
      this.word("for");
      this.space();

      this.print(node.variable);
      this.space();
      this.token("=");
      this.space();

      this.print(node.start);
      commaSeparator.call(this);

      this.print(node.end);

      if (node.step) {
        commaSeparator.call(this);
        this.print(node.step);
      }

      this.space();
      this.word("do");

      if (node.body.length) {
        this.newline();

        this.printSequence(node.body, { indent: true });
      }

      this.word("end");
    },
    DoStatement(node) {
      this.word("do");

      if (node.body.length) {
        this.newline();

        this.printSequence(node.body, { indent: true });
      }

      this.word("end");
    },

    ReturnStatement(node) {
      this.word("return");

      if (node.arguments.length) {
        this.space();
        this.printList(node.arguments);
      }
    },
    FunctionDeclaration(node) {
      if (node.inParens) {
        this.token("(");
      }

      if (node.isLocal) {
        this.word("local");
      }

      this.word("function");
      if (node.identifier) this.print(node.identifier);

      this.token("(");
      this.printList(node.parameters);
      this.token(")");

      if (node.body.length) {
        this.newline();

        this.printSequence(node.body, { indent: true });
      } else {
        this.space();
      }

      this.word("end");
      if (node.inParens) {
        this.token(")");
      }
    },

    // Expressions
    Identifier(node) {
      this.word(node.name);
    },

    SelfExpression(node) {
      this.word("self");
    },

    NumericLiteral(node) {
      this.number(node.raw);
    },
    StringLiteral(node) {
      this.token(node.raw);
    },
    BooleanLiteral(node) {
      this.word(node.raw);
    },
    VarargLiteral(node) {
      this.word(node.raw);
    },
    NilLiteral(node) {
      this.word(node.raw);
    },

    LogicalExpression(node) {
      if (node.inParens) this.token("(");

      this.print(node.left);
      this.space();

      this.token(node.operator);

      this.space();
      this.print(node.right);

      if (node.inParens) this.token(")");
    },
    BinaryExpression(node) {
      if (node.inParens) this.token("(");
      const isNilishCoalescing = node.operator === "??";
      if (isNilishCoalescing) {
        this.token("(");
        this.word("function()");
        this.space();
        this.word("local");
        this.space();
        this.word("__laux_nilish_coalescing_var");
        this.space();
        this.token("=");
        this.space();
        this.print(node.left);
        this.word("if");
        this.space();
        this.word("__laux_nilish_coalescing_var");
        this.space();
        this.token("~=");
        this.space();
        this.token("nil");
        this.space();
        this.word("then");
        this.space();
        this.word("return");
        this.space();
        this.word("__laux_nilish_coalescing_var");
        this.space();
        this.word("else");
        this.space();
        this.word("return");
        this.space();
      } else {
        this.print(node.left);
        this.space();
        this.token(node.operator);
      }

      this.space();
      this.print(node.right);

      if (node.inParens) this.token(")");
      if (isNilishCoalescing) {
        this.word("end");
        this.space();
        this.word("end");
        this.token(")");
        this.token("(");
        this.token(")");
      }
    },
    UnaryExpression(node) {
      if (node.inParens) this.token("(");

      if (node.operator === "not") {
        this.word(node.operator);
        this.space();
      } else {
        this.token(node.operator);
      }

      this.print(node.argument);

      if (node.inParens) this.token(")");
    },
    CallExpression(node) {
      this.print(node.base);

      this.token("(");

      this.printList(node.arguments);

      this.token(")");
    },
    TableCallExpression(node) {
      this.print(node.base);
      this.print(node.arguments);
    },
    StringCallExpression(node) {
      this.print(node.base);
      this.space();

      this.print(node.argument);
    },
    IndexExpression(node) {
      this.print(node.base);
      this.token("[");
      this.print(node.index);
      this.token("]");
    },
    MemberExpression(node) {
      this.print(node.base);
      this.token(node.indexer);
      this.print(node.identifier);
    },
    SafeMemberExpression(node) {
      this.print(node.base);
      this.print(node.identifier);
      // TODO: Safe Member Expression
    },

    FunctionExpression(node) {
      if (node.inParens) {
        this.token("(");
      }

      this.word("function");

      this.token("(");
      this.printList(node.parameters);
      this.token(")");

      if (node.body.length) {
        this.newline();

        this.printSequence(node.body, { indent: true });
      } else {
        this.space();
      }

      this.word("end");
      if (node.inParens) {
        this.token(")");
      }
    },
    FatArrowExpression(node) {
      this.nodes.FunctionExpression.call(this, node);

      if (false) {
        this.word("function");
        this.token("(");

        this.printList(node.parameters);

        this.token(")");

        const len = node.body.length;
        if (len) {
          if (len <= 1) this.space();

          this.printSequence(node.body, { indent: len >= 1 });

          if (len <= 1) this.space();
        }

        this.word("end");
      }
    },
    ThinArrowExpression(node) {
      this.nodes.FatArrowExpression.call(this, node);
    },

    TableConstructorExpression(node) {
      this.token("{");

      if (node.fields.length) {
        const len = node.fields.length;

        this.space();

        if (len > 1) {
          this.newline();
        }

        this.printSequence(node.fields, {
          indent: len > 1,
          separator: commaSeparator,
          indentEveryJoin: true,
        });

        this.space();

        if (len > 1) this.newline();
      }

      this.token("}");
    },
    TableKey(node) {
      this.token("[");
      this.print(node.key);
      this.token("]");

      this.space();
      this.token("=");
      this.space();

      this.print(node.value);
    },
    TableKeyString(node) {
      this.print(node.key);

      this.space();
      this.token("=");
      this.space();

      this.print(node.value);
    },
    TableValue(node) {
      this.print(node.value);
    },
    ShortcutIf(node, statement) {
      this.word("if");
      this.space();
      this.token("(");

      this.printList(node.arguments);

      this.token(")");
      this.space();
      this.word("then");
      this.space();

      this.word(statement);
      this.space();
      this.word("end");
    },
    StopIfStatement(node) {
      this.nodes.ShortcutIf.call(this, node, "return");
    },
    BreakIfStatement(node) {
      this.nodes.ShortcutIf.call(this, node, "break");
    },
    ContinueIfStatement(node) {
      this.nodes.ShortcutIf.call(this, node, "continue");
    },
    AwaitStatement(node) {
      this.word("awaitOutput()");
    },
  };

  _endsWithWord = false;

  _endsWithInteger = false;

  _indent = 0;

  constructor(code, ast, opts) {
    const tokens = ast.tokens || [];

    this.ast = ast;
    this.options = this.normalizeOptions(code, opts, tokens);

    this._buffer = new Buffer();
    this._whitespace = tokens.length > 0 ? new Whitespace(tokens) : null;
  }

  normalizeOptions(code, opts, tokens) {
    let indent = "  ";
    if (code && typeof code === "string") {
      const detected = detectIndent(code).indent;
      if (detected && detected !== " ") indent = detected;
    }

    const defaultOptions = {
      indent,
    };

    return Object.assign(defaultOptions, opts);
  }

  print(node) {
    if (!node) return;

    const { type } = node;
    if (this.nodes[type]) this.nodes[type].call(this, node);
    else {
      console.log(node);
      throw new Error(`Tried to print invalid node type '${type}'`);
    }
  }

  printList(nodes, opts = {}) {
    if (opts.separator == null) {
      opts.separator = commaSeparator;
    }

    return this.printJoin(nodes, opts);
  }

  printJoin(nodes, opts = {}) {
    if (!nodes || !nodes.length) return;

    if (opts.indent) this.indent();

    const newlineOpts = {
      addNewlines: opts.addNewlines,
    };

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node) continue;

      if (opts.statement) this._printNewline(true, node, newlineOpts);

      if (opts.indentEveryJoin) this.newline();
      this.print(node);

      if (opts.separator && i < nodes.length - 1) {
        opts.separator.call(this);
      }

      if (opts.statement) this._printNewline(false, node, newlineOpts);
    }

    if (opts.indent) this.dedent();
  }

  printSequence(nodes, opts = {}) {
    opts.statement = true;

    return this.printJoin(nodes, opts);
  }

  generate() {
    this.print(this.ast);

    return this._buffer.get();
  }

  word(str) {
    if (this._endsWithWord) this._space();

    this._append(str);

    this._endsWithWord = true;
  }

  number(str) {
    this.word(str);

    // this._endsWithInteger =
  }

  token(str) {
    this._append(str);
  }

  newline(i) {
    if (this.options.retainLines || this.options.compact) return;

    if (this.endsWith(repeat("\n", 6))) return;
    if (typeof i !== "number") i = 1;

    i = Math.min(6, i);
    if (this.endsWith("\n")) i--;
    if (i <= 0) return;

    for (let j = 0; j < i; j++) {
      this._newline();
    }
  }

  indent() {
    this._indent++;
  }

  dedent() {
    this._indent--;
  }

  semicolon(force = false) {
    this._append(";", !force);
  }

  space(force = false) {
    if (
      (this._buffer.hasContent() &&
        !this.endsWith(" ") &&
        !this.endsWith("\n")) ||
      force
    ) {
      this._space();
    }
  }

  endsWith(str) {
    return this._buffer.endsWith(str);
  }

  removeTrailingNewline() {
    this._buffer.removeTrailingNewline();
  }

  needsWhitespaceBefore(node) {
    return this._needsWhitespace(node, "before");
  }

  needsWhitespaceAfter(node) {
    return this._needsWhitespace(node, "after");
  }

  _needsWhitespace(node, type) {
    if (!node) return 0;

    if (node.type == "BlockStatement") return 1;
  }

  _append(str, queue = false) {
    this._maybeIndent(str);

    if (queue) this._buffer.queue(str);
    else this._buffer.append(str);

    this._endsWithWord = false;
    this._endsWithInteger = false;
  }

  _printNewline(leading, node, opts) {
    if (this.options.retainLines || this.options.compact) return;

    let lines = 0;

    if (node.range != null && this._whitespace) {
      if (leading) {
        lines = this._whitespace.getNewlinesBefore(node);
      } else {
        lines = this._whitespace.getNewlinesAfter(node);
      }
    } else {
      if (!leading) lines++;
      if (opts.addNewlines) line += opts.addNewlines(leading, node) || 0;

      let needs = this.needsWhitespaceAfter;
      if (leading) needs = this.needsWhitespaceBefore;
      if (needs.call(this, node)) lines++;

      if (!this._buffer.hasContent()) lines = 0;
    }

    this.newline(lines);
  }

  _maybeIndent(str) {
    if (this._indent && this.endsWith("\n") && str[0] !== "\n")
      this._buffer.queue(this._getIndent());
  }

  _space() {
    this._append(" ", true);
  }

  _newline() {
    this._append("\n", true);
  }

  _getIndent() {
    return repeat(this.options.indent, this._indent);
  }
}
