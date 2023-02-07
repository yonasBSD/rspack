module.exports = {
  output: {
    path: './dist',
  },
	module: {
		rules: [
			{
				test: /\.s[ac]ss$/i,
				use: [{ loader: "builtin:sass-loader" }],
				type: "css"
			}
		]
	},
	stats: "errors-warnings"
}