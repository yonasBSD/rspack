import path from "node:path";

import {
	compareFile,
	type IFormatCodeOptions,
	type IFormatCodeReplacement
} from "../compare";
import { RspackDiffConfigPlugin, WebpackDiffConfigPlugin } from "../plugin";
import {
	ECompilerType,
	type ITestContext,
	type ITestEnv,
	type ITestProcessor,
	type TCompareModules,
	type TCompilerOptions,
	type TFileCompareResult,
	type TModuleCompareResult
} from "../type";
import { BasicProcessor } from "./basic";

export interface IDiffProcessorOptions extends IFormatCodeOptions {
	webpackPath: string;
	rspackPath: string;
	files?: string[];
	modules?: TCompareModules;
	runtimeModules?: TCompareModules;
	bootstrap?: boolean;
	detail?: boolean;
	errors?: boolean;
	replacements?: IFormatCodeReplacement[];
	renameModule?: (file: string) => string;
	onCompareFile?: (file: string, result: TFileCompareResult) => void;
	onCompareModules?: (file: string, results: TModuleCompareResult[]) => void;
	onCompareRuntimeModules?: (
		file: string,
		results: TModuleCompareResult[]
	) => void;
}
export class DiffProcessor implements ITestProcessor {
	private hashes: string[] = [];
	private webpack: BasicProcessor<ECompilerType.Webpack> | null = null;
	private rspack: BasicProcessor<ECompilerType.Rspack>;
	constructor(private options: IDiffProcessorOptions) {
		if (global.updateSnapshot) {
			this.webpack = new BasicProcessor<ECompilerType.Webpack>({
				defaultOptions: context =>
					this.getDefaultOptions(
						ECompilerType.Webpack,
						context.getSource(),
						path.join(context.getDist(), ECompilerType.Webpack)
					),
				compilerType: ECompilerType.Webpack,
				name: ECompilerType.Webpack,
				configFiles: ["webpack.config.js", "rspack.config.js"],
				runable: false
			});
		}

		this.rspack = new BasicProcessor<ECompilerType.Rspack>({
			defaultOptions: context =>
				this.getDefaultOptions(
					ECompilerType.Rspack,
					context.getSource(),
					path.join(context.getDist(), ECompilerType.Rspack)
				),
			compilerType: ECompilerType.Rspack,
			name: ECompilerType.Rspack,
			configFiles: ["rspack.config.js", "webpack.config.js"],
			runable: false
		});
	}

	async config(context: ITestContext) {
		if (this.webpack) {
			await this.webpack.config(context);
		}
		await this.rspack.config(context);
	}
	async compiler(context: ITestContext) {
		if (this.webpack) {
			await this.webpack.compiler(context);
		}
		await this.rspack.compiler(context);
	}
	async build(context: ITestContext) {
		if (this.webpack) {
			await this.webpack.build(context);
		}
		await this.rspack.build(context);
	}
	async check(env: ITestEnv, context: ITestContext) {
		if (this.webpack) {
			const webpackCompiler = context.getCompiler(ECompilerType.Webpack);
			const webpackStats = webpackCompiler.getStats();
			//TODO: handle chunk hash and content hash
			webpackStats?.hash && this.hashes.push(webpackStats?.hash);
			if (!this.options.errors) {
				env.expect(webpackStats?.hasErrors()).toBe(false);
			}
		}

		const rspackCompiler = context.getCompiler(ECompilerType.Rspack);
		const rspackStats = rspackCompiler.getStats();
		//TODO: handle chunk hash and content hash
		rspackStats?.hash && this.hashes.push(rspackStats?.hash);
		if (!this.options.errors) {
			env.expect(rspackStats?.hasErrors()).toBe(false);
		}

		const dist = context.getDist();
		const snapshot = context.getSource("__snapshot__");
		for (const file of this.options.files!) {
			const rspackDist = path.join(dist, ECompilerType.Rspack, file);
			const webpackDist = path.join(dist, ECompilerType.Webpack, file);
			const snapshotDist = path.join(snapshot, file.replace(/\.js$/, ".json"));
			const result = compareFile(rspackDist, webpackDist, {
				modules: this.options.modules,
				runtimeModules: this.options.runtimeModules,
				format: this.createFormatOptions(),
				renameModule: this.options.renameModule,
				bootstrap: this.options.bootstrap,
				detail: this.options.detail,
				snapshot: snapshotDist
			});
			if (typeof this.options.onCompareFile === "function") {
				this.options.onCompareFile(file, result);
			}
			if (
				typeof this.options.onCompareModules === "function" &&
				result.modules.modules
			) {
				this.options.onCompareModules(file, result.modules.modules);
			}
			if (
				typeof this.options.onCompareRuntimeModules === "function" &&
				result.modules.runtimeModules
			) {
				this.options.onCompareRuntimeModules(
					file,
					result.modules.runtimeModules
				);
			}
		}
	}

	private getDefaultOptions<T extends ECompilerType>(
		type: T,
		src: string,
		dist: string
	) {
		return {
			entry: path.join(src, "./src/index.js"),
			context: src,
			output: {
				path: dist,
				filename: "bundle.js",
				chunkFilename: "[name].chunk.js"
			},
			plugins: [
				type === ECompilerType.Webpack && new WebpackDiffConfigPlugin(),
				type === ECompilerType.Rspack && new RspackDiffConfigPlugin()
			].filter(Boolean),
			experiments:
				type === ECompilerType.Rspack
					? {
							css: true,
							rspackFuture: {
								bundlerInfo: {
									force: false
								}
							}
						}
					: {}
		} as TCompilerOptions<T>;
	}

	private createFormatOptions() {
		const formatOptions: IFormatCodeOptions = {
			ignoreModuleArguments: this.options.ignoreModuleArguments,
			ignoreModuleId: this.options.ignoreModuleId,
			ignorePropertyQuotationMark: this.options.ignorePropertyQuotationMark,
			ignoreBlockOnlyStatement: this.options.ignoreBlockOnlyStatement,
			ignoreIfCertainCondition: this.options.ignoreIfCertainCondition,
			ignoreSwcHelpersPath: this.options.ignoreSwcHelpersPath,
			ignoreObjectPropertySequence: this.options.ignoreObjectPropertySequence,
			ignoreCssFilePath: this.options.ignoreCssFilePath,
			replacements: this.options.replacements || []
		};
		for (const hash of this.hashes) {
			formatOptions.replacements!.push({ from: hash, to: "fullhash" });
		}
		return formatOptions;
	}
}
