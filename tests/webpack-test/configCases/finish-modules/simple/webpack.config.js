/**
 * @this {import("@rspack/core").Compiler} the compiler
 */
var testPlugin = function () {
	this.hooks.compilation.tap("TestPlugin", compilation => {
		compilation.hooks.finishModules.tapAsync(
			"TestPlugin",
			function (_modules, callback) {
				callback();
			}
		);
	});
};

/** @type {import("@rspack/core").Configuration} */
module.exports = {
	plugins: [testPlugin]
};
