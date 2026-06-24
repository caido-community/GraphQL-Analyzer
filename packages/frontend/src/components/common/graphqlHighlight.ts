import { StreamLanguage } from "@codemirror/language";

const keywords = new Set([
  "query",
  "mutation",
  "subscription",
  "fragment",
  "on",
  "true",
  "false",
  "null",
]);

export const graphqlLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;

    if (stream.match(/^#.*/) !== null) return "comment";
    if (stream.match(/^"(?:[^"\\]|\\.)*"/) !== null) return "string";
    if (stream.match(/^\$[_A-Za-z][_A-Za-z0-9]*/) !== null)
      return "variableName";
    if (stream.match(/^@[_A-Za-z][_A-Za-z0-9]*/) !== null) return "meta";
    if (stream.match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/) !== null) {
      return "number";
    }

    const word = stream.match(/^[_A-Za-z][_A-Za-z0-9]*/);
    if (word !== null && typeof word !== "boolean") {
      const name = word[0] ?? "";
      if (keywords.has(name)) return "keyword";
      if (/^[A-Z]/.test(name)) return "typeName";
      return "propertyName";
    }

    if (stream.match(/^[{}()[\]!:=,|&.]/) !== null) return "punctuation";

    stream.next();
    return null;
  },
});
