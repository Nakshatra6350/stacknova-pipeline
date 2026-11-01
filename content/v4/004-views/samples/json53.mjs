// A 64-bit id in JSON, read by JavaScript: JSON.parse makes it a double, so ids above 2^53 change.
//
//     node json53.mjs
const big = () => 2n ** 53n + 1n + 2n * BigInt(Math.floor(Math.random() * 1e9));
const ids = Array.from({ length: 1000 }, big);
const parse = (text) => JSON.parse(text).id;

const asNumber = ids.filter((id) => BigInt(parse(`{"id":${id}}`)) !== id);
const asString = ids.filter((id) => BigInt(parse(`{"id":"${id}"}`)) !== id);

console.log(`JSON number: ${asNumber.length} of 1000 ids changed`);
console.log(`JSON string: ${asString.length} of 1000 ids changed`);
console.log(`9007199254740993 comes back as ${parse('{"id":9007199254740993}')}`);
console.log(`Number.MAX_SAFE_INTEGER = ${Number.MAX_SAFE_INTEGER}`);
