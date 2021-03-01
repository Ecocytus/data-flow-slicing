import { sep } from "node:path";
import { FunctionDescription, FunctionSpec, TypeSpec, ModuleSpec, ModuleMap, JsonSpecs } from ".";
import * as ast from './python-parser';

function mapDict<U, V>(obj: { [item: string]: U }, f: (item: U) => V): { [item: string]: V } {
	const result: { [item: string]: V } = {};
	Object.keys(obj).forEach(k => result[k] = f(obj[k]));
	return result;
}


function cleanFunc(fdesc: FunctionDescription): FunctionSpec {
	if (typeof fdesc === 'string') {
		return { name: fdesc, reads: [], updates: [] };
	} else {
		if (!fdesc.reads) { fdesc.reads = []; }
		if (!fdesc.updates) { fdesc.updates = []; }
		return fdesc;
	}
}

function cleanType(tdesc: TypeSpec<FunctionDescription>): TypeSpec<FunctionSpec> {
	return {
		methods: tdesc.methods ? tdesc.methods.map(m => cleanFunc(m)) : []
	};
}

function cleanModule(mdesc: ModuleSpec<FunctionDescription>, parts: string[]): ModuleSpec<FunctionSpec> {
	const modulePath = parts.join('.');
	const mod: ModuleSpec<FunctionSpec> = {
		functions: mdesc.functions ? mdesc.functions.map(f => { 
			let cf = cleanFunc(f); 
			cf.modulePath = modulePath;
			return cf;
		}) : [],
		types: mdesc.types ? mapDict(mdesc.types, d => {
			let ct = cleanType(d);
			ct.methods.forEach(m => m.modulePath = modulePath);
			return ct;
		}) : {},
		modules: mdesc.modules ? mapDict(mdesc.modules, d => {
			// TODO: is that correct?
			let cm = cleanModule(d, parts.slice(1));
			return cm;
		}) : {}
	};
	mod.functions.forEach(f => {
		if (f.returns) { f.returnsType = mod.types[f.returns]; }
	});
	Object.keys(mod.types).forEach(typename => {
		const ty = mod.types[typename];
		ty.methods.forEach(f => {
			if (f.returns) { f.returnsType = mod.types[f.returns]; }
		});
	});
	return mod;
}

export class SymbolTable {
	public modules: ModuleMap<FunctionSpec> = {};
	public types: { [name: string]: TypeSpec<FunctionSpec> } = {};
	public functions: { [name: string]: FunctionSpec } = {};

	constructor(private jsonSpecs: JsonSpecs) {
		// preload all the built-in functions.
		this.importModuleDefinitions('__builtins__', [{ path: '*', name: '' }]);
	}

	public lookupFunction(name: string) {
		const spec = this.functions[name];
		if (spec) { return spec; }
		const clss = this.types[name];
		if (clss) {
			return clss.methods.find(fn => fn.name === '__init__') ||
				{ name: '__init__', updates: ['0'], returns: name, returnsType: clss };
		}
		return undefined;
	}

	public lookupNode(func: ast.SyntaxNode) {
		return func.type === ast.NAME ? this.lookupFunction(func.id) :
			func.type === ast.DOT && func.value.type === ast.NAME ? this.lookupModuleFunction(func.value.id, func.name)
				: undefined;
	}

	public lookupModuleFunction(modName: string, funcName: string) {
		const mod = this.modules[modName];
		return mod ? mod.functions.find(f => f.name === funcName) : undefined;
	}

	public importModule(modulePath: string, alias: string): ModuleSpec<FunctionSpec> {
		const spec = this.lookupSpec(this.jsonSpecs, modulePath.split('.'));
		if (!spec) {
			console.log(`*** WARNING no spec for module ${modulePath}`);
			return;
		}
		if (modulePath) {
			this.modules[modulePath] = spec;
			if (alias && alias.length) {
				this.modules[alias] = spec;
			}
		}
	}

	public importModuleDefinitions(namePath: string, imports: { path: string; name: string }[]): ModuleSpec<FunctionSpec> {
		const spec = this.lookupSpec(this.jsonSpecs, namePath.split('.'));
		if (!spec) {
			console.log(`*** WARNING no spec for module ${namePath}`);
			return;
		}
		if (spec) {
			imports.forEach(imp => {
				const funs = spec.functions ? spec.functions.map(f => cleanFunc(f)) : [];
				if (imp.path === '*') {
					funs.forEach(f => this.functions[f.name] = f);
					if (spec.types) { Object.keys(spec.types).forEach(fname => this.types[fname] = spec.types[fname]); }
				} else if (spec.types && spec.types[imp.name]) {
					this.types[imp.name] = spec.types[imp.name];
				} else {
					const fspec = funs.find(f => f.name === imp.name);
					if (fspec) { this.functions[fspec.name] = fspec; }
				}
			});
		} else {
			console.log(`*** WARNING no spec for module ${namePath}`);
		}
	}

	private lookupSpec(map: JsonSpecs, parts: string[]): ModuleSpec<FunctionSpec> {
		return this.lookupSpecRec(map, parts, 0);
	}

	private lookupSpecRec(map: JsonSpecs, parts: string[], idx: number): ModuleSpec<FunctionSpec> {
		if (!map || parts.length == 0) { return undefined; }
		const spec = map[parts[idx]];
		if (!spec) { return undefined; }
		if (idx+1 < parts.length) {
			return this.lookupSpecRec(spec.modules, parts, idx+1);
		} else {
			return cleanModule(spec, parts);
		}
	}
}
