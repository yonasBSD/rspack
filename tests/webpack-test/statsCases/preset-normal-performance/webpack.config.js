/** @type {import("@rspack/core").Configuration} */
module.exports = {
	mode: "production",
	entry: "./index",
	performance: {
		hints: "warning"
	},
	stats: {
		hash: false,
		colors: true
	}
};
