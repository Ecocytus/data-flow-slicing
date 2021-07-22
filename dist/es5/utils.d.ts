import { ControlFlowGraph } from './control-flow';
import { DataflowAnalyzer, RefSet, ApiUsage } from './data-flow';
import { LocationSet, SliceDirection } from './slice';
import { Location } from './python-parser';
import { JsonSpecs } from './specs';
import * as ast from './python-parser';
export declare class NBCell {
    source: string[];
    id: Number;
    constructor(source: string[], id: number);
    getSource(): string[];
    getLength(): number;
}
export declare class Notebook {
    cells: NBCell[];
    source: string[];
    tree: ast.Module;
    cfg: ControlFlowGraph;
    analyzer: DataflowAnalyzer;
    moduleMap: JsonSpecs;
    constructor(ipynb_json: any);
    getCell(id: number): NBCell;
    getCellNo(line_no: number): number;
    getSize(): number;
    getAllCode(): string[];
    getLocsetByCell(cell_no: number): LocationSet;
    getFuncs(cell_no: number): ApiUsage[];
    getDefs(cell_no: number): RefSet;
    getUses(cell_no: number): RefSet;
    slice(cell_no: number, direction?: SliceDirection, sorted?: boolean): LocationSet;
    getCodeByLoc(loc: Location | undefined, col_slicing?: boolean): string[];
    getCodeByLocSet(locset: LocationSet, col_slicing?: boolean): string[];
    _splitSeeds(plotSeedLocations: LocationSet): [LocationSet, number][];
    _runAnalysis(source: string, defsForMethodResolution: RefSet): ApiUsage[];
    convertNotebookToEDA(output_path: string, name: string): void;
    extractEDA(output_path: string, name: string, max_slices?: number): void;
}
export declare function parse_func(func: ast.SyntaxNode): string[];
