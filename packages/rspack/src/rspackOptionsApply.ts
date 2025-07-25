/**
 * The following code is modified based on
 * https://github.com/webpack/webpack/blob/4b4ca3bb53f36a5b8fc6bc1bd976ed7af161bd80/lib/OptionsApply.js
 *
 * MIT Licensed
 * Author Tobias Koppers @sokra
 * Copyright (c) JS Foundation and other contributors
 * https://github.com/webpack/webpack/blob/main/LICENSE
 */
import assert from "node:assert";
import fs from "graceful-fs";

import type {
	Compiler,
	OptimizationRuntimeChunkNormalized,
	RspackOptionsNormalized,
	RspackPluginFunction
} from ".";
import {
	APIPlugin,
	ArrayPushCallbackChunkFormatPlugin,
	AssetModulesPlugin,
	AsyncWebAssemblyModulesPlugin,
	BundlerInfoRspackPlugin,
	ChunkPrefetchPreloadPlugin,
	CommonJsChunkFormatPlugin,
	CssModulesPlugin,
	DataUriPlugin,
	DefinePlugin,
	DeterministicChunkIdsPlugin,
	DeterministicModuleIdsPlugin,
	ElectronTargetPlugin,
	EnableChunkLoadingPlugin,
	EnableLibraryPlugin,
	EnableWasmLoadingPlugin,
	EnsureChunkConditionsPlugin,
	EvalDevToolModulePlugin,
	EvalSourceMapDevToolPlugin,
	ExternalsPlugin,
	FileUriPlugin,
	FlagDependencyExportsPlugin,
	FlagDependencyUsagePlugin,
	HttpExternalsRspackPlugin,
	HttpUriPlugin,
	InferAsyncModulesPlugin,
	JavascriptModulesPlugin,
	JsonModulesPlugin,
	MangleExportsPlugin,
	MergeDuplicateChunksPlugin,
	ModuleChunkFormatPlugin,
	ModuleConcatenationPlugin,
	ModuleInfoHeaderPlugin,
	NamedChunkIdsPlugin,
	NamedModuleIdsPlugin,
	NaturalChunkIdsPlugin,
	NaturalModuleIdsPlugin,
	NodeTargetPlugin,
	NoEmitOnErrorsPlugin,
	OccurrenceChunkIdsPlugin,
	RealContentHashPlugin,
	RemoveEmptyChunksPlugin,
	RuntimeChunkPlugin,
	RuntimePlugin,
	SideEffectsFlagPlugin,
	SizeLimitsPlugin,
	SourceMapDevToolPlugin,
	SplitChunksPlugin,
	WorkerPlugin
} from "./builtin-plugin";
import MemoryCachePlugin from "./lib/cache/MemoryCachePlugin";
import EntryOptionPlugin from "./lib/EntryOptionPlugin";
import IgnoreWarningsPlugin from "./lib/IgnoreWarningsPlugin";
import { DefaultStatsFactoryPlugin } from "./stats/DefaultStatsFactoryPlugin";
import { DefaultStatsPresetPlugin } from "./stats/DefaultStatsPresetPlugin";
import { DefaultStatsPrinterPlugin } from "./stats/DefaultStatsPrinterPlugin";
import { assertNotNill } from "./util/assertNotNil";

export class RspackOptionsApply {
	process(options: RspackOptionsNormalized, compiler: Compiler) {
		assert(
			options.output.path,
			"options.output.path should have value after `applyRspackOptionsDefaults`"
		);
		compiler.outputPath = options.output.path;
		compiler.name = options.name;
		compiler.outputFileSystem = fs;

		if (options.externals) {
			assert(
				options.externalsType,
				"options.externalsType should have value after `applyRspackOptionsDefaults`"
			);
			new ExternalsPlugin(options.externalsType, options.externals).apply(
				compiler
			);
		}

		if (options.externalsPresets.node) {
			new NodeTargetPlugin().apply(compiler);
		}
		if (options.externalsPresets.electronMain) {
			new ElectronTargetPlugin("main").apply(compiler);
		}
		if (options.externalsPresets.electronPreload) {
			new ElectronTargetPlugin("preload").apply(compiler);
		}
		if (options.externalsPresets.electronRenderer) {
			new ElectronTargetPlugin("renderer").apply(compiler);
		}
		if (
			options.externalsPresets.electron &&
			!options.externalsPresets.electronMain &&
			!options.externalsPresets.electronPreload &&
			!options.externalsPresets.electronRenderer
		) {
			new ElectronTargetPlugin().apply(compiler);
		}
		if (options.externalsPresets.nwjs) {
			new ExternalsPlugin("node-commonjs", "nw.gui").apply(compiler);
		}
		if (
			options.externalsPresets.web ||
			options.externalsPresets.webAsync ||
			(options.externalsPresets.node && options.experiments.css)
		) {
			new HttpExternalsRspackPlugin(
				!!options.experiments.css,
				!!options.externalsPresets.webAsync
			).apply(compiler);
		}

		new ChunkPrefetchPreloadPlugin().apply(compiler);

		if (options.output.pathinfo) {
			new ModuleInfoHeaderPlugin(options.output.pathinfo === "verbose").apply(
				compiler
			);
		}

		if (typeof options.output.chunkFormat === "string") {
			switch (options.output.chunkFormat) {
				case "array-push": {
					new ArrayPushCallbackChunkFormatPlugin().apply(compiler);
					break;
				}
				case "commonjs": {
					new CommonJsChunkFormatPlugin().apply(compiler);
					break;
				}
				case "module": {
					new ModuleChunkFormatPlugin().apply(compiler);
					break;
				}
				default:
					throw new Error(
						`Unsupported chunk format '${options.output.chunkFormat}'.`
					);
			}
		}

		if (
			options.output.enabledChunkLoadingTypes &&
			options.output.enabledChunkLoadingTypes.length > 0
		) {
			for (const type of options.output.enabledChunkLoadingTypes) {
				new EnableChunkLoadingPlugin(type).apply(compiler);
			}
		}

		if (
			options.output.enabledWasmLoadingTypes &&
			options.output.enabledWasmLoadingTypes.length > 0
		) {
			for (const type of options.output.enabledWasmLoadingTypes) {
				new EnableWasmLoadingPlugin(type).apply(compiler);
			}
		}

		const runtimeChunk = options.optimization
			.runtimeChunk as OptimizationRuntimeChunkNormalized;
		if (runtimeChunk) {
			new RuntimeChunkPlugin(runtimeChunk).apply(compiler);
		}

		if (!options.optimization.emitOnErrors) {
			new NoEmitOnErrorsPlugin().apply(compiler);
		}

		if (options.devtool) {
			if (options.devtool.includes("source-map")) {
				const hidden = options.devtool.includes("hidden");
				const inline = options.devtool.includes("inline");
				const evalWrapped = options.devtool.includes("eval");
				const cheap = options.devtool.includes("cheap");
				const moduleMaps = options.devtool.includes("module");
				const noSources = options.devtool.includes("nosources");
				const debugIds = options.devtool.includes("debugids");
				const Plugin = evalWrapped
					? EvalSourceMapDevToolPlugin
					: SourceMapDevToolPlugin;
				new Plugin({
					filename: inline ? null : options.output.sourceMapFilename,
					moduleFilenameTemplate: options.output.devtoolModuleFilenameTemplate,
					fallbackModuleFilenameTemplate:
						options.output.devtoolFallbackModuleFilenameTemplate,
					append: hidden ? false : undefined,
					module: moduleMaps ? true : !cheap,
					columns: !cheap,
					noSources: noSources,
					namespace: options.output.devtoolNamespace,
					debugIds: debugIds
				}).apply(compiler);
			} else if (options.devtool.includes("eval")) {
				new EvalDevToolModulePlugin({
					moduleFilenameTemplate: options.output.devtoolModuleFilenameTemplate,
					namespace: options.output.devtoolNamespace
				}).apply(compiler);
			}
		}

		new JavascriptModulesPlugin().apply(compiler);
		new JsonModulesPlugin().apply(compiler);
		new AssetModulesPlugin().apply(compiler);
		if (options.experiments.asyncWebAssembly) {
			new AsyncWebAssemblyModulesPlugin().apply(compiler);
		}
		if (options.experiments.css) {
			new CssModulesPlugin().apply(compiler);
		}

		new EntryOptionPlugin().apply(compiler);
		assertNotNill(options.context);
		compiler.hooks.entryOption.call(options.context, options.entry);

		new RuntimePlugin().apply(compiler);

		if (options.experiments.rspackFuture!.bundlerInfo) {
			new BundlerInfoRspackPlugin(
				options.experiments.rspackFuture!.bundlerInfo
			).apply(compiler);
		}

		new InferAsyncModulesPlugin().apply(compiler);
		new APIPlugin().apply(compiler);

		new DataUriPlugin().apply(compiler);
		new FileUriPlugin().apply(compiler);

		if (options.experiments.buildHttp) {
			new HttpUriPlugin(options.experiments.buildHttp).apply(compiler);
		}

		new EnsureChunkConditionsPlugin().apply(compiler);
		if (options.optimization.mergeDuplicateChunks) {
			new MergeDuplicateChunksPlugin().apply(compiler);
		}

		if (options.optimization.sideEffects) {
			new SideEffectsFlagPlugin(/* options.optimization.sideEffects === true */).apply(
				compiler
			);
		}
		if (options.optimization.providedExports) {
			new FlagDependencyExportsPlugin().apply(compiler);
		}
		if (options.optimization.usedExports) {
			new FlagDependencyUsagePlugin(
				options.optimization.usedExports === "global"
			).apply(compiler);
		}
		if (options.optimization.concatenateModules) {
			new ModuleConcatenationPlugin().apply(compiler);
		}
		if (options.optimization.mangleExports) {
			new MangleExportsPlugin(
				options.optimization.mangleExports !== "size"
			).apply(compiler);
		}

		if (
			options.output.enabledLibraryTypes &&
			options.output.enabledLibraryTypes.length > 0
		) {
			for (const type of options.output.enabledLibraryTypes) {
				new EnableLibraryPlugin(type).apply(compiler);
			}
		}
		if (options.optimization.splitChunks) {
			new SplitChunksPlugin(options.optimization.splitChunks).apply(compiler);
		}
		// TODO: inconsistent: the plugin need to be placed after SplitChunksPlugin
		if (options.optimization.removeEmptyChunks) {
			new RemoveEmptyChunksPlugin().apply(compiler);
		}
		if (options.optimization.realContentHash) {
			new RealContentHashPlugin().apply(compiler);
		}
		const moduleIds = options.optimization.moduleIds;
		if (moduleIds) {
			switch (moduleIds) {
				case "named": {
					new NamedModuleIdsPlugin().apply(compiler);
					break;
				}
				case "natural": {
					new NaturalModuleIdsPlugin().apply(compiler);
					break;
				}
				case "deterministic": {
					new DeterministicModuleIdsPlugin().apply(compiler);
					break;
				}
				default:
					throw new Error(`moduleIds: ${moduleIds} is not implemented`);
			}
		}
		const chunkIds = options.optimization.chunkIds;
		if (chunkIds) {
			switch (chunkIds) {
				case "natural": {
					new NaturalChunkIdsPlugin().apply(compiler);
					break;
				}
				case "named": {
					new NamedChunkIdsPlugin().apply(compiler);
					break;
				}
				case "deterministic": {
					new DeterministicChunkIdsPlugin().apply(compiler);
					break;
				}
				case "size": {
					new OccurrenceChunkIdsPlugin({
						prioritiseInitial: true
					}).apply(compiler);
					break;
				}
				case "total-size": {
					new OccurrenceChunkIdsPlugin({
						prioritiseInitial: false
					}).apply(compiler);
					break;
				}
				default:
					throw new Error(`chunkIds: ${chunkIds} is not implemented`);
			}
		}
		if (options.optimization.nodeEnv) {
			new DefinePlugin({
				"process.env.NODE_ENV": JSON.stringify(options.optimization.nodeEnv)
			}).apply(compiler);
		}
		const { minimize, minimizer } = options.optimization;
		if (minimize && minimizer) {
			for (const item of minimizer) {
				if (typeof item === "function") {
					(item as RspackPluginFunction).call(compiler, compiler);
				} else if (item !== "..." && item) {
					item.apply(compiler);
				}
			}
		}

		if (options.performance) {
			new SizeLimitsPlugin(options.performance).apply(compiler);
		}

		if (options.cache) {
			new MemoryCachePlugin().apply(compiler);
		}

		new WorkerPlugin(
			options.output.workerChunkLoading!,
			options.output.workerWasmLoading!,
			options.output.module!,
			options.output.workerPublicPath!
		).apply(compiler);

		new DefaultStatsFactoryPlugin().apply(compiler);
		new DefaultStatsPresetPlugin().apply(compiler);
		new DefaultStatsPrinterPlugin().apply(compiler);

		if (options.ignoreWarnings && options.ignoreWarnings.length > 0) {
			new IgnoreWarningsPlugin(options.ignoreWarnings).apply(compiler);
		}

		compiler.hooks.afterPlugins.call(compiler);
		if (!compiler.inputFileSystem) {
			throw new Error("No input filesystem provided");
		}

		compiler.hooks.afterResolvers.call(compiler);
	}
}
