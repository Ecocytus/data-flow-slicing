"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProgramBuilder = exports.CellProgram = exports.Program = void 0;
var ast = __importStar(require("./python-parser"));
var data_flow_1 = require("./data-flow");
var rewrite_magics_1 = require("./rewrite-magics");
var set_1 = require("./set");
var magicsRewriter = new rewrite_magics_1.MagicsRewriter();
/**
 * A program built from cells.
 */
var Program = /** @class */ (function () {
    /**
     * Construct a program.
     */
    function Program(cellPrograms) {
        var _this = this;
        this.cellToLineMap = {};
        this.lineToCellMap = {};
        var currentLine = 1;
        this.tree = { code: [], type: ast.MODULE };
        cellPrograms.forEach(function (cp) {
            var _a;
            var cell = cp.cell;
            // Build a mapping from the cells to their lines.
            var cellLength = cell.text.split('\n').length;
            var cellLines = [];
            for (var l = 0; l < cellLength; l++) {
                cellLines.push(currentLine + l);
            }
            cellLines.forEach(function (l) {
                _this.lineToCellMap[l] = cell;
                if (!_this.cellToLineMap[cell.executionEventId]) {
                    _this.cellToLineMap[cell.executionEventId] = new set_1.NumberSet();
                }
                _this.cellToLineMap[cell.executionEventId].add(l);
            });
            // Accumulate the code text.
            currentLine += cellLength;
            // Accumulate the code statements.
            // This includes resetting the locations of all of the nodes in the tree,
            // relative to the cells that come before this one.
            // This can be sped up by saving this computation.
            (_a = _this.tree.code).push.apply(_a, shiftStatementLines(cp.statements, Math.min.apply(Math, cellLines) - 1));
        });
        this.text = cellPrograms.map(function (cp) { return magicsRewriter.rewrite(cp.cell.text + '\n'); }).join('');
    }
    return Program;
}());
exports.Program = Program;
function shiftStatementLines(stmts, delta) {
    return stmts.map(function (statement) {
        var statementCopy = JSON.parse(JSON.stringify(statement));
        for (var _i = 0, _a = ast.walk(statementCopy); _i < _a.length; _i++) {
            var node = _a[_i];
            if (node.location) {
                node.location = shiftLines(node.location, delta);
            }
            if (node.type == ast.FOR) {
                node.decl_location = shiftLines(node.decl_location, delta);
            }
        }
        return statementCopy;
    });
}
function shiftLines(loc, delta) {
    return Object.assign({}, loc, {
        first_line: loc.first_line + delta,
        first_column: loc.first_column,
        last_line: loc.last_line + delta,
        last_column: loc.last_column
    });
}
/**
 * Program fragment for a cell. Used to cache parsing results.
 */
var CellProgram = /** @class */ (function () {
    /**
     * Construct a cell program
     */
    function CellProgram(cell, statements, defs, uses, hasError) {
        this.cell = cell;
        this.statements = statements;
        this.defs = defs;
        this.uses = uses;
        this.hasError = hasError;
    }
    CellProgram.prototype.usesSomethingFrom = function (that) {
        return this.uses.some(function (use) { return that.defs.some(function (def) { return use.name === def.name; }); });
    };
    return CellProgram;
}());
exports.CellProgram = CellProgram;
/**
 * Builds programs from a list of executed cells.
 */
var ProgramBuilder = /** @class */ (function () {
    /**
     * Construct a program builder.
     */
    function ProgramBuilder(dataflowAnalyzer) {
        this._dataflowAnalyzer = dataflowAnalyzer;
        this._cellPrograms = [];
    }
    /**
     * Add cells to the program builder.
     */
    ProgramBuilder.prototype.add = function () {
        var cells = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            cells[_i] = arguments[_i];
        }
        for (var _a = 0, cells_1 = cells; _a < cells_1.length; _a++) {
            var cell = cells_1[_a];
            // Proactively try to parse and find defs and uses in each block.
            // If there is a failure, discard that cell.
            var statements = [];
            var defs = undefined;
            var uses = undefined;
            var hasError = cell.hasError;
            try {
                // Parse the cell's code.
                var tree = ast.parse(magicsRewriter.rewrite(cell.text) + '\n');
                statements = tree.code;
                // Annotate each node with cell ID info, for dataflow caching.
                for (var _b = 0, _c = ast.walk(tree); _b < _c.length; _b++) {
                    var node = _c[_b];
                    // Sanity check that this is actually a node.
                    if (node.hasOwnProperty('type')) {
                        node.location.path = cell.executionEventId;
                    }
                }
                // By querying for defs and uses right when a cell is added to the log, we
                // can cache these results, making dataflow analysis faster.
                if (this._dataflowAnalyzer) {
                    defs = [];
                    uses = [];
                    for (var _d = 0, _e = tree.code; _d < _e.length; _d++) {
                        var stmt = _e[_d];
                        var defsUses = this._dataflowAnalyzer.getDefUseForStatement(stmt, new data_flow_1.RefSet());
                        defs.push.apply(defs, defsUses.DEFINITION.union(defsUses.UPDATE).items);
                        uses.push.apply(uses, defsUses.USE.items);
                    }
                }
                else {
                    defs = [];
                    uses = [];
                }
            }
            catch (e) {
                console.log("Couldn't analyze block", cell.text, ', error encountered, ', e, ', not adding to programs.');
                hasError = true;
            }
            this._cellPrograms.push(new CellProgram(cell, statements, defs, uses, hasError));
        }
    };
    /**
     * Reset (removing all cells).
     */
    ProgramBuilder.prototype.reset = function () {
        this._cellPrograms = [];
    };
    /**
     * Build a program from the list of cells. Program will include the cells' contents in
     * the order they were added to the log. It will omit cells that raised errors (syntax or
     * runtime, except for the last cell).
     */
    ProgramBuilder.prototype.buildTo = function (cellExecutionEventId) {
        var cellPrograms = [];
        var i;
        for (i = this._cellPrograms.length - 1; i >= 0 && this._cellPrograms[i].cell.executionEventId !== cellExecutionEventId; i--)
            ;
        cellPrograms.unshift(this._cellPrograms[i]);
        var lastExecutionCountSeen = this._cellPrograms[i].cell.executionCount;
        for (i--; i >= 0; i--) {
            var cellProgram = this._cellPrograms[i];
            var cell = cellProgram.cell;
            if (cell.executionCount >= lastExecutionCountSeen) {
                break;
            }
            if (!cellProgram.hasError) {
                cellPrograms.unshift(cellProgram);
            }
            lastExecutionCountSeen = cell.executionCount;
        }
        return new Program(cellPrograms);
    };
    ProgramBuilder.prototype.buildFrom = function (executionEventId) {
        var cellProgram = this.getCellProgram(executionEventId);
        if (!cellProgram) {
            return null;
        }
        var i = this._cellPrograms.findIndex(function (cp) { return cp.cell.persistentId === cellProgram.cell.persistentId; });
        return new Program(this._cellPrograms.slice(i));
    };
    ProgramBuilder.prototype.getCellProgram = function (executionEventId) {
        var matchingPrograms = this._cellPrograms.filter(function (cp) { return cp.cell.executionEventId == executionEventId; });
        if (matchingPrograms.length >= 1) {
            return matchingPrograms.pop();
        }
        return null;
    };
    ProgramBuilder.prototype.getCellProgramsWithSameId = function (executionEventId) {
        var cellProgram = this.getCellProgram(executionEventId);
        return this._cellPrograms.filter(function (cp) { return cp.cell.persistentId === cellProgram.cell.persistentId; });
    };
    return ProgramBuilder;
}());
exports.ProgramBuilder = ProgramBuilder;
//# sourceMappingURL=program-builder.js.map