"use strict";

require("./helpers/warmup-webpack");

const path = require("path");
const fs = require("graceful-fs");
const vm = require("vm");
const url = require("url");
const { URL, pathToFileURL, fileURLToPath } = require("url");
const { rimrafSync } = require("rimraf");
const checkArrayExpectation = require("./checkArrayExpectation");
const createLazyTestEnv = require("./helpers/createLazyTestEnv");
const deprecationTracking = require("./helpers/deprecationTracking");
const FakeDocument = require("./helpers/FakeDocument");
const CurrentScript = require("./helpers/CurrentScript");

const prepareOptions = require("./helpers/prepareOptions");
const { parseResource } = require("./lib/util/identifier");
const captureStdio = require("./helpers/captureStdio");
const asModule = require("./helpers/asModule");
const filterInfraStructureErrors = require("./helpers/infrastructureLogErrors");
const { createFilteredDescribe } = require("./lib/util/filterUtil")

const casesPath = path.join(__dirname, "configCases");
const categories = fs.readdirSync(casesPath).map(cat => {
	return {
		name: cat,
		tests: fs
			.readdirSync(path.join(casesPath, cat))
			.filter(folder => !folder.startsWith("_"))
			.sort()
	};
});

const createLogger = appendTarget => {
	return {
		log: l => appendTarget.push(l),
		debug: l => appendTarget.push(l),
		trace: l => appendTarget.push(l),
		info: l => appendTarget.push(l),
		warn: console.warn.bind(console),
		error: console.error.bind(console),
		logTime: () => { },
		group: () => { },
		groupCollapsed: () => { },
		groupEnd: () => { },
		profile: () => { },
		profileEnd: () => { },
		clear: () => { },
		status: () => { }
	};
};

const TIMEOUT = 10_000;

const describeCases = config => {
	describe(config.name, () => {
		let stderr;
		beforeEach(() => {
			stderr = captureStdio(process.stderr, true);
		});
		afterEach(() => {
			if (stderr) {
				stderr.restore();
			}
		});
		jest.setTimeout(TIMEOUT);

		for (const category of categories) {
			// eslint-disable-next-line no-loop-func
			describe(category.name, () => {
				for (const testName of category.tests) {
					// eslint-disable-next-line no-loop-func
					describe(testName, function () {
						const testDirectory = path.join(casesPath, category.name, testName);
						const filterPath = path.join(testDirectory, "test.filter.js");
						if (!createFilteredDescribe(testName, filterPath)) {
							return;
						}
						const infraStructureLog = [];
						const outBaseDir = path.join(__dirname, "js");
						const testSubPath = path.join(config.name, category.name, testName);
						const outputDirectory = path.join(outBaseDir, testSubPath);
						const cacheDirectory = path.join(outBaseDir, ".cache", testSubPath);
						let options, optionsArr, testConfig;
						beforeAll(() => {
							expect(() => {
								options = prepareOptions(
									require(path.join(testDirectory, "webpack.config.js")),
									{ testPath: outputDirectory }
								);
							}).not.toThrow();
							optionsArr = [].concat(options);
							optionsArr.forEach((options, idx) => {
								// CHANGE: rspack does not enable AMD by default
								if (options.amd === undefined) options.amd = {};
								if (!options.context) options.context = testDirectory;
								if (!options.mode) options.mode = "production";
								if (!options.optimization) options.optimization = {};
								if (options.optimization.minimize === undefined)
									options.optimization.minimize = false;
								if (!options.experiments) {
									options.experiments = {};
								}
								// CHANGE: use rspack internal swc minimizer
								// if (options.optimization.minimizer === undefined) {
								// 	options.optimization.minimizer = [
								// 		new (require("terser-webpack-plugin"))({
								// 			parallel: false
								// 		})
								// 	];
								// }
								if (!options.entry) options.entry = "./index.js";
								if (!options.target) options.target = "async-node";
								if (!options.output) options.output = {};
								if (!options.devtool) options.devtool = false;
								if (options.cache === undefined) options.cache = false;
								if (!options.output.path) options.output.path = outputDirectory;
								if (typeof options.output.pathinfo === "undefined")
									options.output.pathinfo = true;
								if (!options.output.filename)
									options.output.filename =
										"bundle" +
										idx +
										(options.experiments && options.experiments.outputModule
											? ".mjs"
											: ".js");
								if (config.cache) {
									options.cache = {
										cacheDirectory,
										name: `config-${idx}`,
										...config.cache
									};
									options.infrastructureLogging = {
										debug: true,
										console: createLogger(infraStructureLog)
									};
								}
								if (!options.snapshot) options.snapshot = {};
								// CHANGE: rspack does not support `snapshot.managedPaths` yet
								// if (!options.snapshot.managedPaths) {
								// 	options.snapshot.managedPaths = [
								// 		path.resolve(__dirname, "../node_modules")
								// 	];
								// }
							});
							testConfig = {
								findBundle: function (i, options) {
									const ext = path.extname(
										parseResource(options.output.filename).path
									);
									if (
										fs.existsSync(
											path.join(options.output.path, "bundle" + i + ext)
										)
									) {
										return "./bundle" + i + ext;
									}
								},
								timeout: TIMEOUT
							};
							try {
								// try to load a test file
								testConfig = Object.assign(
									testConfig,
									require(path.join(testDirectory, "test.config.js"))
								);
							} catch (e) {
								// ignored
							}
							if (testConfig.timeout) setDefaultTimeout(testConfig.timeout);
						});
						afterAll(() => {
							// cleanup
							options = undefined;
							optionsArr = undefined;
							testConfig = undefined;
						});
						beforeAll(() => {
							rimrafSync(cacheDirectory);
						});
						const handleFatalError = (err, done) => {
							const fakeStats = {
								errors: [
									{
										message: err.message,
										stack: err.stack
									}
								]
							};
							if (
								checkArrayExpectation(
									testDirectory,
									fakeStats,
									"error",
									"Error",
									options,
									done
								)
							) {
								return;
							}
							// Wait for uncaught errors to occur
							setTimeout(done);
							return;
						};
						if (config.cache) {
							it(
								`${testName} should pre-compile to fill disk cache (1st)`,
								done => {
									rimrafSync(outputDirectory);
									fs.mkdirSync(outputDirectory, { recursive: true });
									infraStructureLog.length = 0;
									const deprecationTracker = deprecationTracking.start();
									require("@rspack/core").rspack(options, err => {
										deprecationTracker();
										const infrastructureLogging = stderr.toString();
										if (infrastructureLogging) {
											return done(
												new Error(
													"Errors/Warnings during build:\n" +
													infrastructureLogging
												)
											);
										}
										const infrastructureLogErrors = filterInfraStructureErrors(
											infraStructureLog,
											{
												run: 1,
												options
											}
										);
										if (
											infrastructureLogErrors.length &&
											checkArrayExpectation(
												testDirectory,
												{ infrastructureLogs: infrastructureLogErrors },
												"infrastructureLog",
												"infrastructure-log",
												"InfrastructureLog",
												options,
												done
											)
										) {
											return;
										}
										if (err) return handleFatalError(err, done);
										done();
									});
								},
								TIMEOUT
							);
							it(
								`${testName} should pre-compile to fill disk cache (2nd)`,
								done => {
									rimrafSync(outputDirectory);
									fs.mkdirSync(outputDirectory, { recursive: true });
									infraStructureLog.length = 0;
									const deprecationTracker = deprecationTracking.start();
									require("@rspack/core")(options, (err, stats) => {
										deprecationTracker();
										if (err) return handleFatalError(err, done);
										if (!stats.hasErrors()) {
											const infrastructureLogging = stderr.toString();
											if (infrastructureLogging) {
												return done(
													new Error(
														"Errors/Warnings during build:\n" +
														infrastructureLogging
													)
												);
											}
											const allModules = children
												? children.reduce(
													(all, { modules }) => all.concat(modules),
													modules || []
												)
												: modules;
											if (
												allModules.some(
													m => m.type !== "cached modules" && !m.cached
												)
											) {
												return done(
													new Error(
														`Some modules were not cached:\n${stats.toString({
															all: false,
															modules: true,
															modulesSpace: 100
														})}`
													)
												);
											}
										}
										const infrastructureLogErrors = filterInfraStructureErrors(
											infraStructureLog,
											{
												run: 2,
												options
											}
										);
										if (
											infrastructureLogErrors.length &&
											checkArrayExpectation(
												testDirectory,
												{ infrastructureLogs: infrastructureLogErrors },
												"infrastructureLog",
												"infrastructure-log",
												"InfrastructureLog",
												options,
												done
											)
										) {
											return;
										}
										done();
									});
								},
								TIMEOUT
							);
						}
						it(
							`${testName} should compile`,
							done => {
								rimrafSync(outputDirectory);
								fs.mkdirSync(outputDirectory, { recursive: true });
								infraStructureLog.length = 0;
								const deprecationTracker = deprecationTracking.start();
								const onCompiled = (err, stats) => {
									const deprecations = deprecationTracker();
									if (err) return handleFatalError(err, done);
									const statOptions = {
										preset: "verbose",
										colors: false
									};
									fs.mkdirSync(outputDirectory, { recursive: true });
									// CHANGE: no test cases use stats.txt
									// fs.writeFileSync(
									// 	path.join(outputDirectory, "stats.txt"),
									// 	stats.toString(statOptions),
									// 	"utf-8"
									// );

									const getStatsJson = (() => {
										let cache = null;
										return () => {
											if (!cache) {
												cache = stats.toJson({
													errorDetails: true
												});
											}
											return cache;
										};
									})();
									// const jsonStats = getStatsJson();
									// CHANGE: no test cases use stats.json
									// fs.writeFileSync(
									// 	path.join(outputDirectory, "stats.json"),
									// 	JSON.stringify(jsonStats, null, 2),
									// 	"utf-8"
									// );
									if (
										fs.existsSync(path.join(testDirectory, "errors.js")) &&
										checkArrayExpectation(
											testDirectory,
											getStatsJson(),
											"error",
											"Error",
											options,
											done
										)
									) {
										return;
									}
									if (
										fs.existsSync(path.join(testDirectory, "warnings.js")) &&
										checkArrayExpectation(
											testDirectory,
											getStatsJson(),
											"warning",
											"Warning",
											options,
											done
										)
									) {
										return;
									}
									const infrastructureLogging = stderr.toString();
									if (infrastructureLogging) {
										return done(
											new Error(
												"Errors/Warnings during build:\n" +
												infrastructureLogging
											)
										);
									}
									if (
										checkArrayExpectation(
											testDirectory,
											{ deprecations },
											"deprecation",
											"Deprecation",
											options,
											done
										)
									) {
										return;
									}
									const infrastructureLogErrors = filterInfraStructureErrors(
										infraStructureLog,
										{
											run: 3,
											options
										}
									);
									if (
										infrastructureLogErrors.length &&
										checkArrayExpectation(
											testDirectory,
											{ infrastructureLogs: infrastructureLogErrors },
											"infrastructureLog",
											"infrastructure-log",
											"InfrastructureLog",
											options,
											done
										)
									) {
										return;
									}

									let filesCount = 0;

									if (testConfig.noTests) return process.nextTick(done);
									if (testConfig.beforeExecute) testConfig.beforeExecute();
									const results = [];
									for (let i = 0; i < optionsArr.length; i++) {
										const options = optionsArr[i];
										const bundlePath = testConfig.findBundle(i, optionsArr[i]);
										if (bundlePath) {
											filesCount++;
											const document = new FakeDocument(outputDirectory);
											const globalContext = {
												console: console,
												expect: expect,
												setTimeout: setTimeout,
												clearTimeout: clearTimeout,
												document,
												getComputedStyle:
													document.getComputedStyle.bind(document),
												location: {
													href: "https://test.cases/path/index.html",
													origin: "https://test.cases",
													toString() {
														return "https://test.cases/path/index.html";
													}
												}
											};

											const requireCache = Object.create(null);
											const esmCache = new Map();
											const esmIdentifier = `${category.name}-${testName}-${i}`;
											const baseModuleScope = {
												console: console,
												it: _it,
												beforeEach: _beforeEach,
												afterEach: _afterEach,
												expect,
												jest,
												nsObj: m => {
													Object.defineProperty(m, Symbol.toStringTag, {
														value: "Module"
													});
													return m;
												},
												__STATS_I__: i,
											};

											let runInNewContext = false;
											if (
												options.target === "web" ||
												options.target === "webworker" ||
												(Array.isArray(options.target) &&
													(options.target.includes("web") ||
														options.target.includes("webworker")))
											) {
												baseModuleScope.window = globalContext;
												baseModuleScope.self = globalContext;
												baseModuleScope.document = globalContext.document;
												baseModuleScope.setTimeout = globalContext.setTimeout;
												baseModuleScope.clearTimeout = globalContext.clearTimeout;
												baseModuleScope.getComputedStyle =
													globalContext.getComputedStyle;
												baseModuleScope.URL = URL;
												if (typeof Blob !== "undefined") {
													baseModuleScope.Blob = Blob;
												}
												baseModuleScope.Worker =
													require("./helpers/createFakeWorker")({
														outputDirectory
													});
												runInNewContext = true;
											}
											if (testConfig.moduleScope) {
												testConfig.moduleScope(baseModuleScope, options);
											}
											const esmContext = vm.createContext(baseModuleScope, {
												name: "context for esm"
											});

											// eslint-disable-next-line no-loop-func
											const _require = (
												currentDirectory,
												options,
												module,
												esmMode,
												parentModule
											) => {
												if (testConfig.resolveModule) {
													module = testConfig.resolveModule(module, i, options);
												}
												if (testConfig === undefined) {
													throw new Error(
														`_require(${module}) called after all tests from ${category.name} ${testName} have completed`
													);
												}
												if (Array.isArray(module) || /^\.\.?\//.test(module)) {
													let content;
													let p;
													let subPath = "";
													if (Array.isArray(module)) {
														p = path.join(
															currentDirectory,
															".array-require.js"
														);
														content = `module.exports = (${module
															.map(arg => {
																return `require(${JSON.stringify(`./${arg}`)})`;
															})
															.join(", ")});`;
													} else {
														p = path.join(currentDirectory, module);
														content = fs.readFileSync(p, "utf-8");
														const lastSlash = module.lastIndexOf("/");
														let firstSlash = module.indexOf("/");

														if (lastSlash !== -1 && firstSlash !== lastSlash) {
															if (firstSlash !== -1) {
																let next = module.indexOf("/", firstSlash + 1);
																let dir = module.slice(firstSlash + 1, next);

																while (dir === ".") {
																	firstSlash = next;
																	next = module.indexOf("/", firstSlash + 1);
																	dir = module.slice(firstSlash + 1, next);
																}
															}

															subPath = module.slice(
																firstSlash + 1,
																lastSlash + 1
															);
														}
													}
													const isModule =
														p.endsWith(".mjs") &&
														options.experiments &&
														options.experiments.outputModule;

													if (isModule) {
														if (!vm.SourceTextModule)
															throw new Error(
																"Running this test requires '--experimental-vm-modules'.\nRun with 'node --experimental-vm-modules node_modules/jest-cli/bin/jest'."
															);
														let esm = esmCache.get(p);
														if (!esm) {
															if (content.includes("__STATS__")) {
																esmContext.__STATS__ = getStatsJson();
															}
															esm = new vm.SourceTextModule(content, {
																identifier: esmIdentifier + "-" + p,
																url:
																	pathToFileURL(p).href + "?" + esmIdentifier,
																context: esmContext,
																initializeImportMeta: (meta, module) => {
																	meta.url = pathToFileURL(p).href;
																},
																importModuleDynamically: async (
																	specifier,
																	module
																) => {
																	const normalizedSpecifier =
																		specifier.startsWith("file:")
																			? `./${path.relative(
																				path.dirname(p),
																				url.fileURLToPath(specifier)
																			)}`
																			: specifier.replace(
																				/https:\/\/example.com\/public\/path\//,
																				"./"
																			);
																	const result = await _require(
																		path.dirname(p),
																		options,
																		normalizedSpecifier,
																		"evaluated",
																		module
																	);
																	return await asModule(result, module.context);
																}
															});
															esmCache.set(p, esm);
														}
														if (esmMode === "unlinked") return esm;
														return (async () => {
															if (esmMode === "unlinked") return esm;
															await esm.link(
																async (specifier, referencingModule) => {
																	return await asModule(
																		await _require(
																			path.dirname(
																				referencingModule.identifier
																					? referencingModule.identifier.slice(
																						esmIdentifier.length + 1
																					)
																					: fileURLToPath(referencingModule.url)
																			),
																			options,
																			specifier,
																			"unlinked",
																			referencingModule
																		),
																		referencingModule.context,
																		true
																	);
																}
															);
															// node.js 10 needs instantiate
															if (esm.instantiate) esm.instantiate();
															await esm.evaluate();
															if (esmMode === "evaluated") return esm;
															const ns = esm.namespace;
															return ns.default && ns.default instanceof Promise
																? ns.default
																: ns;
														})();
													}
													const isJSON = p.endsWith(".json");
													if (isJSON) {
														return JSON.parse(content);
													}

													if (p in requireCache) {
														return requireCache[p].exports;
													}
													const m = {
														exports: {}
													};
													requireCache[p] = m;

													const moduleScope = {
														...baseModuleScope,
														require: _require.bind(
															null,
															path.dirname(p),
															options
														),
														importScripts: url => {
															expect(url).toMatch(
																/^https:\/\/test\.cases\/path\//
															);
															_require(
																outputDirectory,
																options,
																`.${url.slice(
																	"https://test.cases/path".length
																)}`
															);
														},
														module: m,
														exports: m.exports,
														__dirname: path.dirname(p),
														__filename: p,
														_globalAssign: { expect }
													};
													if (content.includes("__STATS__")) {
														moduleScope.__STATS__ = getStatsJson();
													}
													if (testConfig.moduleScope) {
														testConfig.moduleScope(moduleScope, options);
													}
													if (!runInNewContext)
														content = `Object.assign(global, _globalAssign); ${content}`;
													const args = Object.keys(moduleScope);
													const argValues = args.map(arg => moduleScope[arg]);
													const code = `(function(${args.join(
														", "
													)}) {${content}\n})`;

													let oldCurrentScript = document.currentScript;
													document.currentScript = new CurrentScript(subPath);
													const fn = runInNewContext
														? vm.runInNewContext(code, globalContext, p)
														: vm.runInThisContext(code, p);
													fn.call(
														testConfig.nonEsmThis
															? testConfig.nonEsmThis(module)
															: m.exports,
														...argValues
													);
													document.currentScript = oldCurrentScript;
													return m.exports;
												} else if (
													testConfig.modules &&
													module in testConfig.modules
												) {
													return testConfig.modules[module];
												} else {
													return require(module.startsWith("node:")
														? module.slice(5)
														: module);
												}
											};

											try {
												if (Array.isArray(bundlePath)) {
													for (const bundlePathItem of bundlePath) {
														results.push(
															_require(
																outputDirectory,
																options,
																"./" + bundlePathItem
															)
														);
													}
												} else {
													results.push(
														_require(outputDirectory, options, bundlePath)
													);
												}
											} catch (err) {
												// Abort early if `_require` throws
												return handleFatalError(err, done);
											}
										}
									}
									// give a free pass to compilation that generated an error
									if (
										!stats.hasErrors() &&
										filesCount !== optionsArr.length
									) {
										return done(
											new Error(
												"Should have found at least one bundle file per webpack config"
											)
										);
									}
									Promise.all(results)
										.then(() => {
											if (testConfig.afterExecute) testConfig.afterExecute(options);
											for (const key of Object.keys(global)) {
												if (key.includes("webpack")) delete global[key];
											}
											if (getNumberOfTests() < filesCount) {
												return done(
													new Error(
														"No tests exported by test case" +
														getNumberOfTests() +
														" " +
														filesCount
													)
												);
											}
											done();
										})
										.catch(done);
								};
								if (config.cache) {
									try {
										const compiler = require("@rspack/core")(options);
										compiler.run(err => {
											if (err) return handleFatalError(err, done);
											compiler.run((error, stats) => {
												compiler.close(err => {
													if (err) return handleFatalError(err, done);
													onCompiled(error, stats);
												});
											});
										});
									} catch (e) {
										handleFatalError(e, done);
									}
								} else {
									require("@rspack/core")(options, onCompiled);
								}
							},
							TIMEOUT
						);

						const {
							it: _it,
							beforeEach: _beforeEach,
							afterEach: _afterEach,
							setDefaultTimeout,
							getNumberOfTests
						} = createLazyTestEnv(TIMEOUT);
					});
				}
			});
		}
	});
};

exports.describeCases = describeCases;
