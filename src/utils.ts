// import {MagicsRewriter, RefSet, walk, parse, ControlFlowGraph, DataflowAnalyzer, DataflowAnalyzerOptions, slice, SliceDirection, LocationSet, SyntaxNode, Location}

import { MagicsRewriter } from "./rewrite-magics"
import { ControlFlowGraph } from './control-flow';
import { DataflowAnalyzer, RefSet, ApiUsageAnalysis } from './data-flow';
import { LocationSet, slice, SliceDirection } from './slice';
import { Location } from './python-parser'
import { DefaultSpecs, JsonSpecs, FunctionSpec, TypeSpec } from './specs';
import fs from 'fs';

import * as ast from './python-parser';

// import { ApiCallAnalysisListener } from "./analysis-listener"

export class NBCell {
  source: string[];
  id: Number
  constructor(source: string[], id: number) {
    this.source = source;
    this.id = id;
  }

  getSource() { return this.source; }
}

export class Notebook {
  cells: NBCell[];
  source: string[];
  tree: ast.Module;
  cfg: ControlFlowGraph;
  analyzer: DataflowAnalyzer;
  moduleMap: JsonSpecs;

  constructor(path: string) {
    const ipynb_json = JSON.parse(fs.readFileSync(path, 'utf8'));
    const magic_rewriter = new MagicsRewriter();
    var cell_no: number[] = [];
    this.cells = []
    var count = 0
    for (let c of ipynb_json.cells) {
        if (c.cell_type == 'code') {
            var codeList:string[] = []
            var code: string[] = [];
            // case that ipynb cell is one long string
            if (typeof c.source == "string") {
                codeList = c.source.split('\n');
                for (let s of codeList) {
                    if (s == "") continue;
                    code.push(magic_rewriter.rewrite(s) + "\n");
                }
            } else {
                codeList = c.source;
                for (let s of codeList) {
                    code.push(magic_rewriter.rewrite(s));
                }
                code[code.length-1] += "\n"; 
            }
            this.cells.push(new NBCell(code, count));
            count += 1;
        }
    }
    this.source = [];
    for (let c of this.cells) {
      this.source = this.source.concat(c.getSource());
    }

    this.tree = ast.parse(this.source.join('')); 
    this.cfg = new ControlFlowGraph(this.tree);

    // TODO: more module options
    this.moduleMap = DefaultSpecs
    this.analyzer = new DataflowAnalyzer(this.moduleMap);

  }

  getCell(id: number) { return this.cells[id]; }

  getSize() { return this.cells.length; }

  getAllCode() { return this.source }

  // *********** idx starts at 1 ***********
  getLocsetByCell(cell_no: number) {
    // assert(cell_no < this.cells.length);

    var loc_set = new LocationSet();

    if (this.cells[cell_no].getSource().length == 0) {
      return loc_set;
    }

    // line start with 1
    var first_line = 1;

    for (let i = 0; i < cell_no; ++i) {
      first_line += this.cells[i].getSource().length;
    }

    var last_line = first_line + this.cells[cell_no].getSource().length - 1;
    
    loc_set.add({
      first_line: first_line,
      first_column: 0,
      last_line: last_line,
      last_column: 999
    })
    return loc_set;
  }

  getFuncs(cell_no: number) {
    var code = this.cells[cell_no].getSource().join('');
    let tree = ast.parse(code); 
    let cfg = new ControlFlowGraph(tree);
    let defsForMethodResolution = this.analyzer.analyze(cfg).statementDefs;
    var walker = new ApiUsageAnalysis(tree, this.analyzer.getSymbolTable(), defsForMethodResolution);
    ast.walk(tree, walker);
  }

  getDefs(cell_no: number) {
    var code = this.cells[cell_no].getSource().join('');
    var mod = ast.parse(code);
    return mod.code.reduce((refSet, stmt) => {
        var refs = this.analyzer.getDefs(stmt, refSet);
        return refSet.union(refs);
    }, new RefSet());
    // return this.analyzer.getDefs(mod.code[0], new RefSet()).items;
  }

  getUses(cell_no: number) {
    var code = this.cells[cell_no].getSource().join('');
    var mod = ast.parse(code);
    return mod.code.reduce((refSet, stmt) => {
      var refs = this.analyzer.getUses(stmt);
      return refSet.union(refs);
    }, new RefSet())
  }

  // number starts at 0
  slice(cell_no: number, direction?: SliceDirection, sorted?: boolean) {
    if (sorted == null) {
      sorted = true;
    }
    var seed = this.getLocsetByCell(cell_no);
    var loc_set = slice(this.tree, seed, undefined, direction)
    if (sorted) {
      var sorted_items = loc_set.items.sort((a,b) => (a.first_line < b.first_line ? -1 : 1));
      var sorted_locset = new LocationSet();
      sorted_locset.add(...sorted_items);
      return sorted_locset;
    } else {
      return loc_set;
    }
  }

  getCodeByLoc(loc: Location|undefined, col_slicing?: boolean) {
    console.log(loc)
    if (loc == undefined) {
        return [""];
    }
    if (col_slicing == null) {
        col_slicing = false;
    }
    var codes = this.source.slice(loc.first_line-1, loc.last_line);
    if (col_slicing) {
        if (codes.length > 1) {
            codes[0] = codes[0].slice(loc.first_column, undefined);
            codes[codes.length-1] = codes[codes.length-1].slice(undefined, loc.last_column);
        } else if (codes.length == 1) {
            codes[0] = codes[0].slice(loc.first_column, loc.last_column);
        }
    } else {
        if (loc.last_column == 0) {
            // TODO: handle indent and multi-line case
            // special case of empty line:
            codes.pop();
        }
    }
    return codes
  }
}

export function parse_func(func:ast.SyntaxNode) {
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
  return [lib_name, func_name]
}
