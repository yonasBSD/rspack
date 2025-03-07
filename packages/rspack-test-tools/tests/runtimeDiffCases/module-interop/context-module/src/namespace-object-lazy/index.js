it("should receive a namespace object when importing commonjs", function(done) {
	import("./cjs").then(function(result) {
		expect(result).toEqual(nsObj({ named: "named", default: { named: "named", default: "default" } }));
		done();
	}).catch(done);
});

it("should receive a namespace object when importing commonjs with __esModule", function(done) {
	import("./cjs-esmodule").then(function(result) {
		expect(result).toEqual({ __esModule: true, named: "named", default: "default" });
		done();
	}).catch(done);
});

function contextCJS(name) {
	return Promise.all([
		import(`./dir-cjs/${name}`),
		import(/* webpackMode: "lazy-once", webpackChunkName: "dir-cjs-1" */`./dir-cjs?1/${name}`),
		import(/* webpackMode: "eager", webpackChunkName: "dir-cjs-2" */`./dir-cjs?2/${name}`)
	]).then(function(results) {
		return import(/* webpackMode: "weak" */`./dir-cjs/${name}`).then(function(r) {
			results.push(r);
			return results;
		});
	});
}

function contextESM(name) {
	return Promise.all([
		import(`./dir-esm/${name}`),
		import(/* webpackMode: "lazy-once", webpackChunkName: "dir-esm-1" */`./dir-esm?1/${name}`),
		import(/* webpackMode: "eager", webpackChunkName: "dir-esm-2" */`./dir-esm?2/${name}`)
	]).then(function(results) {
		return import(/* webpackMode: "weak" */`./dir-esm/${name}`).then(function(r) {
			results.push(r);
			return results;
		});
	});
}

function contextMixed(name) {
	return Promise.all([
		import(`./dir-mixed/${name}`),
		import(/* webpackMode: "lazy-once", webpackChunkName: "dir-mixed-1" */`./dir-mixed?1/${name}`),
		import(/* webpackMode: "eager", webpackChunkName: "dir-mixed-2" */`./dir-mixed?2/${name}`)
	]).then(function(results) {
		return import(/* webpackMode: "weak" */`./dir-mixed/${name}`).then(function(r) {
			results.push(r);
			return results;
		});
	});
}

function promiseTest(promise, equalsTo) {
	return promise.then(function(results) {
		for(const result of results)
			expect(result).toEqual(equalsTo);
	});
}

it("should receive a namespace object when importing commonjs via context", function() {
	return Promise.all([
		promiseTest(contextCJS("one"), nsObj({ named: "named", default: { named: "named", default: "default" } })),
		promiseTest(contextCJS("two"), { __esModule: true, named: "named", default: "default" }),
		promiseTest(contextCJS("three"), nsObj({ named: "named", default: { named: "named", default: "default" } })),
		promiseTest(contextCJS("null"), nsObj({ default: null }))
	]);
});

it("should receive a namespace object when importing ESM via context", function() {
	return Promise.all([
		promiseTest(contextESM("one"), nsObj({ named: "named", default: "default" })),
		promiseTest(contextESM("two"), nsObj({ named: "named", default: "default" })),
		promiseTest(contextESM("three"), nsObj({ named: "named", default: "default" }))
	]);
});

it("should receive a namespace object when importing mixed content via context", function() {
	return Promise.all([
		promiseTest(contextMixed("one"), nsObj({ named: "named", default: { named: "named", default: "default" } })),
		promiseTest(contextMixed("two"), { __esModule: true, named: "named", default: "default" }),
		promiseTest(contextMixed("three"), nsObj({ named: "named", default: "default" })),
		promiseTest(contextMixed("null"), nsObj({ default: null })),
		promiseTest(contextMixed("json.json"), nsObj({ named: "named", default: { named: "named", default: "default" } }))
	]);
});
