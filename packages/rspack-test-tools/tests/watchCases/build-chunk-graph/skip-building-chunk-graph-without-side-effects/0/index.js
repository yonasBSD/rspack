// make sure
import lib from "./lib"
import value from './value'
import { v1 } from './re-exports'

it("should have correct result", () => {
  expect(value).toBe(42);
  expect(lib).toBe(42);
	expect(v1).toBe(42);
});
