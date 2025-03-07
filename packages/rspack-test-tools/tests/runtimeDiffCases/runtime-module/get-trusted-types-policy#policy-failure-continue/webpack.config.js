/** @type {import("webpack").Configuration} */
module.exports = {
	entry: {
		bundle: {
			import: "./src/index",
			chunkLoading: "import-scripts"
		}
	},
	output: {
		trustedTypes: {
			policyName: "my-application#webpack",
			onPolicyCreationFailure: "continue"
		}
	},
	target: "web"
};
