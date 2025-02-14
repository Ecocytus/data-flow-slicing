import * as ast from './python-parser';
import { ControlFlowGraph } from './control-flow';
import { Set } from './set';
import { JsonSpecs, FunctionSpec, TypeSpec } from './specs';
import { SymbolTable } from './symbol-table';
declare class DefUse {
    DEFINITION: RefSet;
    UPDATE: RefSet;
    USE: RefSet;
    constructor(DEFINITION?: RefSet, UPDATE?: RefSet, USE?: RefSet);
    get defs(): Set<Ref>;
    get uses(): Set<Ref>;
    union(that: DefUse): DefUse;
    update(newRefs: DefUse): void;
    equals(that: DefUse): boolean;
    createFlowsFrom(fromSet: DefUse): [Set<Dataflow>, Set<Ref>];
}
/**
 * Use a shared dataflow analyzer object for all dataflow analysis / querying for defs and uses.
 * It caches defs and uses for each statement, which can save time.
 * For caching to work, statements must be annotated with a cell's ID and execution count.
 */
export declare class DataflowAnalyzer {
    constructor(moduleMap?: JsonSpecs);
    getSymbolTable(): SymbolTable;
    getDefUseForStatement(statement: ast.SyntaxNode, defsForMethodResolution: RefSet): DefUse;
    analyze(cfg: ControlFlowGraph, refSet?: RefSet): DataflowAnalysisResult;
    getDefs(statement: ast.SyntaxNode, defsForMethodResolution: RefSet): RefSet;
    private getClassDefs;
    private getFuncDefs;
    private getAssignDefs;
    private getImportFromDefs;
    private getImportDefs;
    getUses(statement: ast.SyntaxNode): RefSet;
    private getNameUses;
    private getClassDeclUses;
    private getFuncDeclUses;
    private getAssignUses;
    private _symbolTable;
    private _defUsesCache;
}
export interface Dataflow {
    fromNode: ast.SyntaxNode;
    toNode: ast.SyntaxNode;
    fromRef?: Ref;
    toRef?: Ref;
}
export declare enum ReferenceType {
    DEFINITION = "DEFINITION",
    UPDATE = "UPDATE",
    USE = "USE"
}
export declare enum SymbolType {
    VARIABLE = 0,
    CLASS = 1,
    FUNCTION = 2,
    IMPORT = 3,
    MUTATION = 4,
    MAGIC = 5
}
export interface Ref {
    type: SymbolType;
    level: ReferenceType;
    name: string;
    inferredType?: TypeSpec<FunctionSpec>;
    location: ast.Location;
    node: ast.SyntaxNode;
}
export declare class RefSet extends Set<Ref> {
    constructor(...items: Ref[]);
}
export declare function sameLocation(loc1: ast.Location, loc2: ast.Location): boolean;
declare abstract class AnalysisWalker implements ast.WalkListener {
    protected _statement: ast.SyntaxNode;
    protected symbolTable: SymbolTable;
    readonly defs: RefSet;
    constructor(_statement: ast.SyntaxNode, symbolTable: SymbolTable);
    abstract onEnterNode?(node: ast.SyntaxNode, ancestors: ast.SyntaxNode[]): any;
}
export interface ApiUsage {
    modulePath: String;
    funcName: String;
    location: ast.Location;
}
/**
 * Tree walk listener for collecting names used in function call.
 */
export declare class ApiUsageAnalysis extends AnalysisWalker {
    private variableDefs;
    usages: Array<ApiUsage>;
    constructor(statement: ast.SyntaxNode, symbolTable: SymbolTable, variableDefs: RefSet);
    onEnterNode(node: ast.SyntaxNode, ancestors: ast.SyntaxNode[]): void;
}
export declare type DataflowAnalysisResult = {
    dataflows: Set<Dataflow>;
    undefinedRefs: RefSet;
    statementDefs: RefSet;
};
export {};
