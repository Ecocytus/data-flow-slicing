"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var utils_1 = require("../utils");
var slice_1 = require("../slice");
if (process.argv.length != 4) {
    console.log("Please provide notebook path, and cell.");
    process.exit();
}
var in_path = process.argv[2];
var cell_no = Number(process.argv[3]);
var notebook = new utils_1.Notebook(in_path);
var loc_set = notebook.slice(cell_no, slice_1.SliceDirection.Forward);
for (var _i = 0, _a = loc_set.items; _i < _a.length; _i++) {
    var loc = _a[_i];
    console.log(notebook.getCodeByLoc(loc));
}
//# sourceMappingURL=utils.example.js.map