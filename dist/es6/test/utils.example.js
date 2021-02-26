import { Notebook } from "../utils";
import { SliceDirection } from '../slice';
if (process.argv.length != 4) {
    console.log("Please provide notebook path, and cell.");
    process.exit();
}
var in_path = process.argv[2];
var cell_no = Number(process.argv[3]);
var notebook = new Notebook(in_path);
var loc_set = notebook.slice(cell_no, SliceDirection.Forward);
for (var _i = 0, _a = loc_set.items; _i < _a.length; _i++) {
    var loc = _a[_i];
    console.log(notebook.getCodeByLoc(loc));
}
//# sourceMappingURL=utils.example.js.map