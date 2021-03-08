// import {MagicsRewriter, RefSet, walk, parse, ControlFlowGraph, DataflowAnalyzer, DataflowAnalyzerOptions, slice, SliceDirection, LocationSet, SyntaxNode, Location}

import { MagicsRewriter } from "./rewrite-magics"
import { ControlFlowGraph } from './control-flow';
import { DataflowAnalyzer, RefSet, ApiUsageAnalysis, ApiUsage } from './data-flow';
import { LocationSet, slice, SliceDirection } from './slice';
import { Location } from './python-parser'
import { DefaultSpecs, JsonSpecs, FunctionSpec, TypeSpec } from './specs';
import * as visSpec from "./visualization_spec.json";
import fs from 'fs';

import * as ast from './python-parser';

export class NBCell {
  source: string[];
  id: Number
  constructor(source: string[], id: number) {
    this.source = source;
    this.id = id;
  }

  getSource() { return this.source; }
  getLength() { return this.source.length; }
}

interface CellUsage {
  cell_line: number;
  usage: string;
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

    // TODO: more module options
    this.tree = ast.parse(this.source.join(''));
    this.moduleMap = DefaultSpecs
    this.analyzer = new DataflowAnalyzer(this.moduleMap);

  }

  getCell(id: number) { return this.cells[id]; }

  getCellNo(line_no: number) {
    let cell_no = 0;
    while(this.cells[cell_no].getLength() < line_no) {
      line_no -= this.cells[cell_no].getLength();
      cell_no += 1;
    }
    return cell_no;
  }

  getSize() { return this.cells.length; }

  getAllCode() { return this.source }

  // *********** idx starts at 1 ***********
  getLocsetByCell(cell_no: number) {
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

  // get dependent code location and function usage
  getFuncs(cell_no: number) {
    var dep_locset = this.slice(cell_no, SliceDirection.Backward, true);
    // get all dependent code
    var code_dep = this.getCodeByLocSet(dep_locset).join('');
    var code_cell = this.cells[cell_no].getSource().join('');
    // get definition from dependent code
    let defsForMethodResolution = this.analyzer.analyze(new ControlFlowGraph(ast.parse(code_dep))).statementDefs;
    var tree = ast.parse(code_cell)
    var walker = new ApiUsageAnalysis(tree, this.analyzer.getSymbolTable(), defsForMethodResolution);
    ast.walk(tree, walker);
    return walker.usages;
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
    var loc_set = slice(this.tree, seed, this.analyzer, direction)
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

  getCodeByLocSet(locset: LocationSet, col_slicing?: boolean) {
    let codes: string[] = []
    for (let loc of locset.items) {
      codes = codes.concat(this.getCodeByLoc(loc, col_slicing))
    }
    return codes;
  }

  _splitSeeds(plotSeedLocations:LocationSet) {
    var sorted_seeds = plotSeedLocations.items.sort((a,b) => (a.first_line < b.first_line ? -1 : 1))
    var seed_list: [LocationSet, number][] = [];
  
    var pre_cellno = 1;
    for (let idx = 0; idx < this.cells.length; ++idx) {
        let cell = this.cells[idx];
        let cur_cellno = pre_cellno + cell.getLength();
        var cur_loc = new LocationSet();
        sorted_seeds.filter(a => {
          let last_line = a.last_line;
          if (a.last_column == 0) {
            last_line -= 1;
          }
          return last_line < cur_cellno && last_line >= pre_cellno
        }).forEach(a => cur_loc.add(a))
        if (!cur_loc.empty) {
          seed_list.push([cur_loc, idx]);
        }
        pre_cellno = cur_cellno;
    }
  
    return seed_list;
  }

  _runAnalysis(source: string, defsForMethodResolution: RefSet) {
    let temp_tree = ast.parse(source);
    let temp_walker = new ApiUsageAnalysis(temp_tree, this.analyzer.getSymbolTable(), defsForMethodResolution);
    ast.walk(temp_tree, temp_walker);
    return temp_walker.usages;
  }
  

  // used for dataset preprocess, it will generate all different dependency 
  extractEDA(output_path: string, name: string) {
    // get all dependent code
    var code= this.source.join('');
    var tree = ast.parse(code)
    var cfg = new ControlFlowGraph(tree);
    // get definition from dependent code
    let defsForMethodResolution = this.analyzer.analyze(cfg).statementDefs;
    var walker = new ApiUsageAnalysis(tree, this.analyzer.getSymbolTable(), defsForMethodResolution);
    ast.walk(tree, walker);
    // console.log(walker.usages)
    let file_count = 0;
    for (let usage of walker.usages) {
      if (isVisualization(usage)) {
        let seed = new LocationSet(usage.location);
        // console.log(`${file_count}: slice out based on: ` + this.getCodeByLoc(usage.location));
        let loc_set = slice(tree, seed, this.analyzer, SliceDirection.Backward);
        let cur_line = 0; // line number of sliced code
        let cell_usage_list: CellUsage[] = [];
        // TODO: findout why sometime slicing is wrong, e.g. in 12718015.ipynb
        let splited_set = this._splitSeeds(loc_set);
        let source: string = '';
        let want = false;
        for (const [loc, cell_no] of splited_set) {
          let temp_code = this.getCodeByLocSet(loc);
          source += temp_code.join('');
          cur_line += temp_code.length;
          let usages: ApiUsage[] = [];
          try {
            usages = this._runAnalysis(temp_code.join(''), defsForMethodResolution);
          } catch {}
          if (usages.length == 0) {
            // console.log("ignore");
            continue;
          }
          
          usages.forEach(u => {
            if (u.modulePath != '__builtins__' && u.modulePath.split('.')[0] != 'matplotlib') {
              want = true;
            }
          });
          cell_usage_list.push(convertToCellUsage(usages, cur_line));
        }

        if (want) {
          fs.writeFile(`${output_path}/${name}_${file_count}.py`, source, function(err) {
            if (err) throw err;
          });

          const createCsvWriter = require('csv-writer').createObjectCsvWriter;
          const csvWriter = createCsvWriter({
              path: `${output_path}/${name}_${file_count}.csv`,
              header: [
                  {id: 'cell_line', title: 'CELL'},
                  {id: 'usage', title: 'USAGE'}
              ]
          });
          csvWriter.writeRecords(cell_usage_list)
            .then(() => {});
          file_count += 1;
        }
      }
    }
  }
}

function convertToCellUsage(apiUsages: ApiUsage[], cell_line: number) : CellUsage {
  let usageSet: Set<string> = new Set();
  for (let u of apiUsages) {
    usageSet.add(u.modulePath + ', ' + u.funcName);
  }
  return { cell_line: cell_line, usage: Array.from(usageSet).join(', ') };
}

function isVisualization(usage: ApiUsage) {
  let path = usage.modulePath.split('.');
  let spec = visSpec;
  while (path.length > 0 && spec.hasOwnProperty(path[0])) {
    spec = spec[path.shift()]
  }
  if (Array.isArray(spec)) {
    // reach the func list
    if (spec[0] == "*") {
      return true;
    } else {
      return path.length == 0 && spec.find(s => s == usage.funcName);
    }
  }
  return false;
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
