// import {MagicsRewriter, RefSet, walk, parse, ControlFlowGraph, DataflowAnalyzer, DataflowAnalyzerOptions, slice, SliceDirection, LocationSet, SyntaxNode, Location}
import { MagicsRewriter } from "./rewrite-magics";
import { ControlFlowGraph } from './control-flow';
import { DataflowAnalyzer, RefSet, ApiUsageAnalysis } from './data-flow';
import { LocationSet, slice, SliceDirection } from './slice';
import { DefaultSpecs } from './specs';
import * as visSpec from "./visualization_spec.json";
import fs from 'fs';
import * as ast from './python-parser';
var NBCell = /** @class */ (function () {
    function NBCell(source, id) {
        this.source = source;
        this.id = id;
    }
    NBCell.prototype.getSource = function () { return this.source; };
    NBCell.prototype.getLength = function () { return this.source.length; };
    return NBCell;
}());
export { NBCell };
var Notebook = /** @class */ (function () {
    function Notebook(path) {
        var ipynb_json = JSON.parse(fs.readFileSync(path, 'utf8'));
        var magic_rewriter = new MagicsRewriter();
        var cell_no = [];
        this.cells = [];
        var count = 0;
        for (var _i = 0, _a = ipynb_json.cells; _i < _a.length; _i++) {
            var c = _a[_i];
            if (c.cell_type == 'code') {
                var codeList = [];
                var code = [];
                // case that ipynb cell is one long string
                if (typeof c.source == "string") {
                    codeList = c.source.split('\n');
                    for (var _b = 0, codeList_1 = codeList; _b < codeList_1.length; _b++) {
                        var s = codeList_1[_b];
                        if (s == "")
                            continue;
                        code.push(magic_rewriter.rewrite(s) + "\n");
                    }
                }
                else {
                    codeList = c.source;
                    for (var _c = 0, codeList_2 = codeList; _c < codeList_2.length; _c++) {
                        var s = codeList_2[_c];
                        code.push(magic_rewriter.rewrite(s));
                    }
                    code[code.length - 1] += "\n";
                }
                this.cells.push(new NBCell(code, count));
                count += 1;
            }
        }
        this.source = [];
        for (var _d = 0, _e = this.cells; _d < _e.length; _d++) {
            var c = _e[_d];
            this.source = this.source.concat(c.getSource());
        }
        // TODO: more module options
        this.moduleMap = DefaultSpecs;
        this.analyzer = new DataflowAnalyzer(this.moduleMap);
    }
    Notebook.prototype.getCell = function (id) { return this.cells[id]; };
    Notebook.prototype.getCellNo = function (line_no) {
        var cell_no = 0;
        while (this.cells[cell_no].getLength() < line_no) {
            line_no -= this.cells[cell_no].getLength();
            cell_no += 1;
        }
        return cell_no;
    };
    Notebook.prototype.getSize = function () { return this.cells.length; };
    Notebook.prototype.getAllCode = function () { return this.source; };
    // *********** idx starts at 1 ***********
    Notebook.prototype.getLocsetByCell = function (cell_no) {
        var loc_set = new LocationSet();
        if (this.cells[cell_no].getSource().length == 0) {
            return loc_set;
        }
        // line start with 1
        var first_line = 1;
        for (var i = 0; i < cell_no; ++i) {
            first_line += this.cells[i].getSource().length;
        }
        var last_line = first_line + this.cells[cell_no].getSource().length - 1;
        loc_set.add({
            first_line: first_line,
            first_column: 0,
            last_line: last_line,
            last_column: 999
        });
        return loc_set;
    };
    // get dependent code location and function usage
    Notebook.prototype.getFuncs = function (cell_no) {
        var dep_locset = this.slice(cell_no, SliceDirection.Backward, true);
        // get all dependent code
        var code_dep = this.getCodeByLocSet(dep_locset).join('');
        var code_cell = this.cells[cell_no].getSource().join('');
        // get definition from dependent code
        var defsForMethodResolution = this.analyzer.analyze(new ControlFlowGraph(ast.parse(code_dep))).statementDefs;
        var tree = ast.parse(code_cell);
        var walker = new ApiUsageAnalysis(tree, this.analyzer.getSymbolTable(), defsForMethodResolution);
        ast.walk(tree, walker);
        return walker.usages;
    };
    Notebook.prototype.getDefs = function (cell_no) {
        var _this = this;
        var code = this.cells[cell_no].getSource().join('');
        var mod = ast.parse(code);
        return mod.code.reduce(function (refSet, stmt) {
            var refs = _this.analyzer.getDefs(stmt, refSet);
            return refSet.union(refs);
        }, new RefSet());
        // return this.analyzer.getDefs(mod.code[0], new RefSet()).items;
    };
    Notebook.prototype.getUses = function (cell_no) {
        var _this = this;
        var code = this.cells[cell_no].getSource().join('');
        var mod = ast.parse(code);
        return mod.code.reduce(function (refSet, stmt) {
            var refs = _this.analyzer.getUses(stmt);
            return refSet.union(refs);
        }, new RefSet());
    };
    // number starts at 0
    Notebook.prototype.slice = function (cell_no, direction, sorted) {
        if (sorted == null) {
            sorted = true;
        }
        var seed = this.getLocsetByCell(cell_no);
        var loc_set = slice(this.tree, seed, this.analyzer, direction);
        if (sorted) {
            var sorted_items = loc_set.items.sort(function (a, b) { return (a.first_line < b.first_line ? -1 : 1); });
            var sorted_locset = new LocationSet();
            sorted_locset.add.apply(sorted_locset, sorted_items);
            return sorted_locset;
        }
        else {
            return loc_set;
        }
    };
    Notebook.prototype.getCodeByLoc = function (loc, col_slicing) {
        if (loc == undefined) {
            return [""];
        }
        if (col_slicing == null) {
            col_slicing = false;
        }
        var codes = this.source.slice(loc.first_line - 1, loc.last_line);
        if (col_slicing) {
            if (codes.length > 1) {
                codes[0] = codes[0].slice(loc.first_column, undefined);
                codes[codes.length - 1] = codes[codes.length - 1].slice(undefined, loc.last_column);
            }
            else if (codes.length == 1) {
                codes[0] = codes[0].slice(loc.first_column, loc.last_column);
            }
        }
        else {
            if (loc.last_column == 0) {
                // TODO: handle indent and multi-line case
                // special case of empty line:
                codes.pop();
            }
        }
        return codes;
    };
    Notebook.prototype.getCodeByLocSet = function (locset, col_slicing) {
        var codes = [];
        for (var _i = 0, _a = locset.items; _i < _a.length; _i++) {
            var loc = _a[_i];
            codes = codes.concat(this.getCodeByLoc(loc, col_slicing));
        }
        return codes;
    };
    Notebook.prototype._splitSeeds = function (plotSeedLocations) {
        var sorted_seeds = plotSeedLocations.items.sort(function (a, b) { return (a.first_line < b.first_line ? -1 : 1); });
        var seed_list = [];
        var pre_cellno = 1;
        var _loop_1 = function (idx) {
            var cell = this_1.cells[idx];
            var cur_cellno = pre_cellno + cell.getLength();
            cur_loc = new LocationSet();
            sorted_seeds.filter(function (a) {
                var last_line = a.last_line;
                if (a.last_column == 0) {
                    last_line -= 1;
                }
                return last_line < cur_cellno && last_line >= pre_cellno;
            }).forEach(function (a) { return cur_loc.add(a); });
            if (!cur_loc.empty) {
                seed_list.push([cur_loc, idx]);
            }
            pre_cellno = cur_cellno;
        };
        var this_1 = this, cur_loc;
        for (var idx = 0; idx < this.cells.length; ++idx) {
            _loop_1(idx);
        }
        return seed_list;
    };
    Notebook.prototype._runAnalysis = function (source, defsForMethodResolution) {
        var temp_tree = ast.parse(source);
        var temp_walker = new ApiUsageAnalysis(temp_tree, this.analyzer.getSymbolTable(), defsForMethodResolution);
        ast.walk(temp_tree, temp_walker);
        return temp_walker.usages;
    };
    // used for dataset preprocess, it will generate all different dependency 
    Notebook.prototype.extractEDA = function (output_path) {
        // get all dependent code
        var code = this.source.join('');
        var tree = ast.parse(code);
        var cfg = new ControlFlowGraph(tree);
        // get definition from dependent code
        var defsForMethodResolution = this.analyzer.analyze(cfg).statementDefs;
        var walker = new ApiUsageAnalysis(tree, this.analyzer.getSymbolTable(), defsForMethodResolution);
        ast.walk(tree, walker);
        // console.log(walker.usages)
        var file_count = 0;
        var _loop_2 = function (usage) {
            if (isVisualization(usage)) {
                var seed = new LocationSet(usage.location);
                var loc_set = slice(tree, seed, this_2.analyzer, SliceDirection.Backward);
                var cur_line = 0; // line number of sliced code
                var cell_usage_list = [];
                // TODO: findout why sometime slicing is wrong, e.g. in 12718015.ipynb
                var splited_set = this_2._splitSeeds(loc_set);
                var source = '';
                var want_1 = false;
                for (var _i = 0, splited_set_1 = splited_set; _i < splited_set_1.length; _i++) {
                    var _a = splited_set_1[_i], loc = _a[0], cell_no = _a[1];
                    var temp_code = this_2.getCodeByLocSet(loc);
                    source += temp_code.join('');
                    cur_line += temp_code.length;
                    var usages = [];
                    try {
                        usages = this_2._runAnalysis(temp_code.join(''), defsForMethodResolution);
                    }
                    catch (_b) { }
                    if (usages.length == 0) {
                        console.log("ignore");
                        continue;
                    }
                    usages.forEach(function (u) {
                        if (u.modulePath != '__builtins__') {
                            want_1 = true;
                        }
                    });
                    cell_usage_list.push(convertToCellUsage(usages, cur_line));
                }
                if (want_1) {
                    fs.writeFile(output_path + "_" + file_count + ".py", source, function (err) {
                        if (err)
                            throw err;
                    });
                    var createCsvWriter = require('csv-writer').createObjectCsvWriter;
                    var csvWriter = createCsvWriter({
                        path: output_path + "_" + file_count + ".csv",
                        header: [
                            { id: 'cell_line', title: 'CELL' },
                            { id: 'usage', title: 'USAGE' }
                        ]
                    });
                    csvWriter.writeRecords(cell_usage_list)
                        .then(function () { });
                    file_count += 1;
                }
            }
        };
        var this_2 = this;
        for (var _i = 0, _a = walker.usages; _i < _a.length; _i++) {
            var usage = _a[_i];
            _loop_2(usage);
        }
    };
    return Notebook;
}());
export { Notebook };
function convertToCellUsage(apiUsages, cell_line) {
    var usageSet = new Set();
    for (var _i = 0, apiUsages_1 = apiUsages; _i < apiUsages_1.length; _i++) {
        var u = apiUsages_1[_i];
        usageSet.add(u.modulePath + ', ' + u.funcName);
    }
    return { cell_line: cell_line, usage: Array.from(usageSet).join(', ') };
}
function isVisualization(usage) {
    var path = usage.modulePath.split('.');
    var spec = visSpec;
    while (path.length > 0 && spec.hasOwnProperty(path[0])) {
        spec = spec[path.shift()];
    }
    if (Array.isArray(spec)) {
        // reach the func list
        if (spec[0] == "*") {
            return true;
        }
        else {
            return path.length == 0 && spec.find(function (s) { return s == usage.funcName; });
        }
    }
    return false;
}
export function parse_func(func) {
    var lib_name = "";
    var func_name = "";
    if (func.type == "dot") {
        if (func.value.type == "name") {
            lib_name = func.value.id;
        }
        func_name = func.name;
    }
    if (func.type == "name") {
        func_name = func.id;
    }
    return [lib_name, func_name];
}
//# sourceMappingURL=utils.js.map