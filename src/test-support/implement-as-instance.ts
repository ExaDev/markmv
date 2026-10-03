/**
 * Builds a class-mock implementation that makes `new Class()` hold the members of a test double.
 * vitest types a class mock's implementation as either a constructable or a `this`-typed function
 * returning nothing, and a double is not a full instance of a class that has private members, so the
 * double's members are copied onto the constructed instance instead of returning it.
 * @param create - Builds the test double whose members the instance should carry
 * @returns An implementation to pass to `mockImplementation` on a mocked class
 */
export function implementAsInstance(
  create: () => object,
): (this: object) => void {
  return function (this: object): void {
    const double = create();
    for (const key of Reflect.ownKeys(double)) {
      Reflect.set(this, key, Reflect.get(double, key));
    }
  };
}
